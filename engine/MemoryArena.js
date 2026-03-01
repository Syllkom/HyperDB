// ./engine/MemoryArena.js
import v8 from 'v8';

export class MemoryArena {
    constructor(limitMB = 50, pinnedKeys = []) {
        this.limit = Number(limitMB) * 1024 * 1024;
        this.pinnedKeys = new Set(pinnedKeys);
        this.pinned = new Map();
        this.cache = new Map();
        this.currentSize = 0;
    }

    #size(data) {
        try { return v8.serialize(data).length; }
        catch (e) { return 0; }
    }

    set(key, data, explicitSize = null) {
        if (this.pinnedKeys.has(key)) {
            this.pinned.set(key, data);
            return true;
        }

        if (this.cache.has(key)) this.delete(key);
        
        const dataSize = explicitSize !== null ? explicitSize : this.#size(data);
        if (dataSize > this.limit) return false;

        while (this.currentSize + dataSize > this.limit && this.cache.size > 0) {
            const oldestKey = this.cache.keys().next().value;
            this.delete(oldestKey);
        }

        this.cache.set(key, { data, size: dataSize });
        this.currentSize += dataSize;
        return true;
    }

    get(key) {
        if (this.pinned.has(key)) return this.pinned.get(key);
        const item = this.cache.get(key);
        if (!item) return null;
        
        this.cache.delete(key);
        this.cache.set(key, item);
        return item.data;
    }

    delete(key) {
        if (this.pinned.has(key)) return this.pinned.delete(key);
        const item = this.cache.get(key);
        if (!item) return false;
        
        this.currentSize -= item.size;
        this.cache.delete(key);
        return true;
    }

    stats() {
        const kb = this.currentSize / 1024;
        const mb = this.currentSize / (1024 * 1024);
        return {
            used: mb < 0.01 ? `${kb.toFixed(2)} KB` : `${mb.toFixed(2)} MB`,
            limit: (this.limit / (1024 * 1024)).toFixed(2) + " MB",
            items: this.cache.size
        };
    }

    has(key) {
        return this.pinned.has(key) || this.cache.has(key);
    }
}