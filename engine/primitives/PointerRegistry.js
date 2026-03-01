// ./engine/primitives/PointerRegistry.js
import { WriteBuffer } from "./WriteBuffer.js";

export class PointerRegistry {
    constructor(vaultEngine, mapFileTarget, options = {}) {
        this.vaultEngine = vaultEngine;
        this.fileMap = mapFileTarget;
        this.fileNode = this.fileMap.replace('.map.bin', '.node.bin');
        
        this.buffer = new WriteBuffer(vaultEngine, this.fileMap, {
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