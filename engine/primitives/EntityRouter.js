// ./engine/primitives/EntityRouter.js
import { ShardMatrix, HyperType, HyperCodec } from '../ShardMatrix.js';
import { StateNode } from './StateNode.js';

export class EntityRouter {
    constructor(vaultEngine, pointerRegistry, options = {}) {
        this.pointerRegistry = pointerRegistry;
        this.vaultEngine = vaultEngine;
        
        this.stateNode = new StateNode(vaultEngine, pointerRegistry, options);
        this.shardMatrix = new ShardMatrix(vaultEngine, pointerRegistry, this.stateNode, options.shard?.depth);
    }

    get buffer() { return this.stateNode.buffer; }
    
    get data() {
        return this.stateNode.data;
    }

    get(key) {
        const value = this.data[key];

        if (HyperCodec.is(value) && value[1] === HyperType.NODE) {
            const decoded = HyperCodec.decode(value);
            if (!this.pointerRegistry.get(key)) {
                this.pointerRegistry.set(key, decoded[2]);
            }
        }

        return value;
    }

    set(key, value) {
        if (this.pointerRegistry.get(key)) {
            this.delete(key);
        }

        if (ShardMatrix.isObject(value)) {
            this.shardMatrix.forge({ [key]: value }, this.pointerRegistry, this);
        } else if (typeof value === 'function') {
            this.data[key] = HyperCodec.encode(HyperType.FUNCTION, value);
        } else {
            this.data[key] = value;
        }
        
        this.stateNode.buffer.save();
    }

    delete(key) {
        const nestedPointer = this.pointerRegistry.get(key);

        if (nestedPointer) {
            this.shardMatrix.purge(nestedPointer);
            this.pointerRegistry.delete(key);
        }

        delete this.data[key];
        this.stateNode.buffer.save();
    }

    keys() {
        return Object.keys(this.data);
    }
}