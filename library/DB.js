import { Disk } from "./Disk.js";
import { Index, Cluster } from "./Cluster.js";
import { Flow } from "./Flow.js";

/* Uso:
new HyperDB({
    depth: 2,
    folder: './storage/database',
    memory: 20,
    index: { threshold: 10, debounce: 5000 },
    nodes: { threshold: 5, debounce: 3000 }
})
*/

export class HyperDB {
    #options = null;
    constructor(options = {}) {
        if (options?.constructor?.name !== 'Object') {
            throw new Error('Invalid options');
        }

        this.#options = options;

        // Inyección de dependencias: Disk
        if (options.$class?.Disk) {
            const a0 = options.$class.Disk;
            if (a0.constructor.name == 'Array') {
                this.disk = new Disk(...a0);
            } else if (a0.constructor.name == 'Object') {
                this.disk = new Disk(a0);
            } else this.disk = a0
        }

        if (!this.disk) {
            this.disk = new Disk({
                memory: { limit: options.memory || 20 },
                folder: options.folder || './data',
            });
        }

        // Inyección de dependencias: Index
        if (options.$class?.Index) {
            const a0 = options.$class.Index;
            if (a0.constructor.name == 'Array') {
                this.index = new Index(this.disk, ...a0);
            } else if (a0.constructor.name == 'Object') {
                this.index = new Index(this.disk, a0);
            } else this.index = a0
        }

        if (!this.index) {
            this.index = new Index(this.disk, {
                file: {
                    limit: options.index?.threshold || 10,
                    delay: options.index?.debounce || 5000
                }
            })
        }

        // Inyección de dependencias: Flow
        if (options.$class?.Flow) {
            const a0 = options.$class.Flow;
            if (a0.constructor.name == 'Array') {
                this.flow = new Flow(...a0);
            } else this.flow = a0
        }

        if (!this.flow) {
            this.flow = new Flow();
        }

        /////////////////////////////

        this.proxies = new WeakMap();
        this.flows = new WeakMap();

        this.data = this.Proxy(this.index.data);
        this.shared = {}
    }

    memory() {
        return this.disk.memory.stats()
    }

    flush() {
        return this.disk.flush()
    }

    open(...path) {
        const o = this.index.get(...path)
        const router = this.flow.get(...path)
        if (o && o.$file) return this.Proxy(o, router)
        return false
    }

    Proxy(index, flow) {
        const DB = this
        if (!index) index = this.index.data;
        if (index.$file == 'root.bin') flow = this.flow.tree

        if (flow) this.flows.set(index, flow);
        if (this.proxies.has(index)) return this.proxies.get(index);

        let root = null;

        // Inyección de dependencias: Cluster
        if (this.#options?.$class?.Cluster) {
            const a0 = this.#options.$class.Cluster;
            if (a0.constructor.name === 'Array') {
                root = new Cluster(this.disk, index, ...a0);
            } else if (a0.constructor.name === 'Object') {
                root = new Cluster(this.disk, index, a0);
            } else root = a0;
        }

        if (!root) root = new Cluster(this.disk, index, {
            shard: { depth: this.#options?.depth || 2 },
            file: {
                limit: this.#options?.nodes?.threshold || 5,
                delay: this.#options?.nodes?.debounce || 3000
            }
        });

        ////////////////////////////

        const open = (args, index, flow) => {
            const Open = (object) => () => args.reduce((acc, k) => acc?.[k], object) ?? false;
            const $index = Open(index)();
            const $flow = Open(flow)();
            if ($index && $index.$file) return this.Proxy($index, $flow)
        }

        const guard = (method) => (...args) => {
            if (flow?.$proxy && flow?.$proxy?.[method]) {
                let control = { end: false, value: null, error: null };
                const receiver = (method === 'delete') ? null : args[args.length - 1];

                flow.$proxy[method].apply({
                    resolve: (val) => { control.end = true; control.value = val },
                    reject: (err) => { control.end = true; control.error = err },
                    open: (...args) => open(args, index, flow),
                    data: receiver, index: index, flow: flow,
                }, args);

                return control
            }
        }

        const proxy = new Proxy({}, {
            get(target, key, receiver) {
                if (typeof key === 'symbol') return Reflect.get(target, key);

                const flow = DB.flows.get(index);

                // Flow logic
                if (flow?.$call && flow?.$call?.[key]) {
                    const fun = flow.$call[key];
                    if (typeof fun === 'function') {
                        return (...args) => fun.apply({
                            data: receiver, index: index, flow: flow,
                            open: (...args) => open(args, index, flow),
                            DB: DB
                        }, args);
                    }
                } else if (DB.shared[key]) {
                    const fun = DB.shared[key];
                    if (typeof fun === 'function') {
                        return (...args) => fun.apply({
                            data: receiver, index: index, flow: flow,
                            open: (...args) => open(args, index, flow),
                            DB: DB
                        }, args);
                    }
                }

                const r = guard('get')(target, key, receiver);
                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                // Index logic
                const rootGet = root.get(key);

                if (rootGet?.constructor?.name === 'Object' && rootGet.$file) {
                    return DB.Proxy(index[key], flow?.[key]);
                } else {
                    return rootGet;
                }
            },
            set(target, key, value, receiver) {
                const r = guard('set')(target, key, value, receiver);
                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                root.set(key, value);
                DB.index.save();
                return true;
            },
            deleteProperty(target, key) {
                const r = guard('delete')(target, key);
                if (r?.end && r?.error) throw r.error;
                if (r?.end) return r.value;

                root.delete(key);
                DB.index.save();
                return true;
            },
            ownKeys(target) {
                return root.keys();
            },
            getOwnPropertyDescriptor(_, key) {
                return {
                    enumerable: true,
                    configurable: true,
                    value: root.get(key)
                };
            }
        })

        this.proxies.set(index, proxy);
        return proxy;
    }
}