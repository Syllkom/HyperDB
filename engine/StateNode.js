// ./engine/primitives/StateNode.js
import { WriteBuffer } from "./WriteBuffer.js";

export class StateNode {
    constructor(vaultEngine, pointerRegistry, options = {}) {
        this.vaultEngine = vaultEngine;
        
        this.buffer = new WriteBuffer(vaultEngine, pointerRegistry.fileNode, {
            limit: options?.file?.limit || 10,
            delay: options.file?.delay || 5000
        });
    }

    save() { return this.buffer.save(); }
    keys() { return Object.keys(this.data); }
    get data() { return this.buffer.data; }
    get(key) { return this.data[key] }

    set(key, value) {
        this.data[key] = value;
        this.buffer.save();
    }

    delete(key) {
        delete this.data[key];
        this.buffer.save();
    }
}
