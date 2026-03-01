// .HyperDB
import { VaultEngine } from "./engine/VaultEngine.js";
import { HyperCodec, HyperType, ShardMatrix } from "./engine/ShardMatrix.js";
import { EntityRouter } from "./engine/primitives/EntityRouter.js";
import { PointerRegistry } from "./engine/primitives/PointerRegistry.js";

export class HyperDB {
    #config = null;
    
    constructor(config = {}) {
        if (config?.constructor?.name !== 'Object') {
            throw new Error('Invalid configuration payload');
        }

        this.#config = config;

        this.vaultEngine = new VaultEngine({
            memory: config.memory || 50,
            folder: config.folder || './data',
            atomic: config.atomic === undefined ? true : config.atomic
        });

        this.rootRegistry = new PointerRegistry(this.vaultEngine, 'root.map.bin', {
            file: {
                limit: config.maps?.threshold || 10,
                delay: config.maps?.debounce || 5000
            }
        });

        this.activeNodes = new WeakMap();
        this.data = this.createProxy(this.rootRegistry);
        this.sharedState = {};
    }

    metrics() {
        return {
            pointers: this.vaultEngine.mapsArena.stats(),
            nodes: this.vaultEngine.nodesArena.stats()
        }
    }

    prune() {
        return this.vaultEngine.prune();
    }

    flush() {
        return this.vaultEngine.flush();
    }

    navigate(...path) {
        if (!path.length) return;
        let currentLevel = this.rootRegistry.data;

        path = path.filter((segment) => {
            if (typeof segment == 'string') return true;
            else if (segment instanceof this.rootRegistry.constructor) {
                currentLevel = segment.data; return false;
            } else return false;
        });

        for (let i = 0; i < path.length; i++) {
            if (!currentLevel[path[i]]) return false;
            const pointerFile = currentLevel[path[i]];
            if (typeof pointerFile !== 'string') return false;
            if (!pointerFile.endsWith('.map.bin')) return false;
            currentLevel = this.vaultEngine.readSync(pointerFile);
        }

        if (!currentLevel || !(currentLevel?.$file)) return false;

        let limit = this.#config?.maps?.threshold || 10;
        let delay = this.#config?.maps?.debounce || 5000;

        const nestedRegistry = new this.rootRegistry.constructor(
            this.vaultEngine, 
            currentLevel.$file,
            { file: { limit: limit, delay: delay } }
        );

        return this.createProxy(nestedRegistry);
    }

    createProxy(registry) {
        if (!registry?.data) return;
        const targetData = registry.data;
        
        if (this.activeNodes.has(targetData)) {
            const stateNode = this.activeNodes.get(targetData);
            if (stateNode?.proxy) return stateNode.proxy;
        }

        this.activeNodes.set(targetData, {
            proxy: null,
            invokableFunctions: {},
            interceptors: {}
        });

        const nodeState = this.activeNodes.get(targetData);
        const dbInstance = this;
        
        const router = new EntityRouter(this.vaultEngine, registry, {
            shard: { depth: this.#config?.depth || 2 },
            file: {
                limit: this.#config?.nodes?.threshold || 10,
                delay: this.#config?.nodes?.debounce || 5000
            }
        });

        const navigateDeep = (...args) => {
            const nested = this.navigate(...args, registry);
            if (nested && nested.$file) return this.createProxy(nested);
        }

        const ProxyTraps = {
            get: '$proxyMethodGet',
            set: '$proxyMethodSet',
            delete: '$proxyMethodDelete'
        }

        const buildInterceptor = (trap) => (context = {}) => {
            const trapHandler = router.get(ProxyTraps[trap]);

            if (HyperCodec.is(trapHandler)) {
                const { receiver, key, value, target } = context;
                nodeState.interceptors[trap] ||= new Function(`return ${HyperCodec.decode(trapHandler)[2]}`)();
                
                let controlState = { end: false, value: null, error: null };

                nodeState.interceptors[trap].apply({
                    resolve: (val) => { controlState.end = true; controlState.value = val; },
                    reject: (err) => { controlState.end = true; controlState.error = err; },
                    navigate: (...args) => navigateDeep(...args), 
                    data: receiver, 
                    router: router, 
                    ...context
                }, [target, key, value ?? receiver, receiver]);
                
                return controlState;
            }
        }

        const dynamicProxy = new Proxy({}, {
            get(target, key, receiver) {
                if (typeof key === 'symbol') return Reflect.get(target, key);

                if (key === '$proxy') return {
                    define: (keyOrObject, handler) => {
                        if (ShardMatrix.isObject(keyOrObject)) {
                            const validTraps = Object.keys(ProxyTraps);
                            for (const k in keyOrObject) {
                                if (!validTraps.includes(k) || typeof keyOrObject[k] !== 'function') continue;
                                nodeState.interceptors[k] = keyOrObject[k];
                                router.set(ProxyTraps[k], keyOrObject[k]);
                            }
                        } else if (keyOrObject && (typeof handler === 'function')) {
                            if (!ProxyTraps[keyOrObject]) return false;
                            nodeState.interceptors[keyOrObject] = handler;
                            router.set(ProxyTraps[keyOrObject], handler);
                        } else return false;
                    },
                    remove: (trapKey) => {
                        if (typeof trapKey == 'string') {
                            if (!ProxyTraps[trapKey]) return false;
                            delete nodeState.interceptors[trapKey];
                            router.delete(ProxyTraps[trapKey]);
                            return true;
                        } else if (trapKey === undefined) {
                            for (const k in ProxyTraps) {
                                router.delete(ProxyTraps[k]);
                                delete nodeState.interceptors[k];
                            }
                            return true;
                        }
                    }
                }

                const interceptorResult = buildInterceptor('get')({ target, key, receiver });
                if (interceptorResult?.end && interceptorResult?.error) throw interceptorResult.error;
                if (interceptorResult?.end) return interceptorResult.value;

                const value = router.get(key);
                if (!HyperCodec.is(value)) return value;

                if (value[1] === HyperType.FUNCTION) {
                    nodeState.invokableFunctions[key] ||= (new Function(`return ${HyperCodec.decode(value)?.[2]}`)());
                    return (...args) => nodeState.invokableFunctions[key].apply({
                        data: receiver, 
                        router: router, 
                        navigate: (...args) => navigateDeep(...args), 
                        ...{ target, key }
                    }, args);
                }
                else if (value[1] === HyperType.NODE) {
                    const decoded = HyperCodec.decode(value);
                    const nestedRegistry = new PointerRegistry(dbInstance.vaultEngine, decoded[2]);
                    return dbInstance.createProxy(nestedRegistry);
                } 
                
                return value;
            },
            
            set(target, key, value, receiver) {
                const interceptorResult = buildInterceptor('set')({ target, key, value, receiver });
                if (interceptorResult?.end && interceptorResult?.error) throw interceptorResult.error;
                value = (interceptorResult?.end) ? interceptorResult.value : value;

                if ((Object.values(ProxyTraps).includes(key)) && typeof value === 'function') {
                    nodeState.interceptors[key] = value;
                } else if (typeof value === 'function') {
                    nodeState.invokableFunctions[key] = value;
                }

                router.set(key, value);
                return true;
            },
            
            deleteProperty(target, key) {
                const interceptorResult = buildInterceptor('delete')({ target, key });
                if (interceptorResult?.end && interceptorResult?.error) throw interceptorResult.error;
                if (interceptorResult?.end) return interceptorResult.value;

                if (nodeState.interceptors?.[key]) delete nodeState.interceptors[key];
                else if (nodeState.invokableFunctions?.[key]) delete nodeState.invokableFunctions[key];

                router.delete(key);
                return true;
            },
            
            ownKeys() { return router.keys(); },
            
            getOwnPropertyDescriptor(_, key) {
                return { enumerable: true, configurable: true, value: router.get(key) };
            }
        });

        nodeState.proxy = dynamicProxy;
        return dynamicProxy;
    }
}