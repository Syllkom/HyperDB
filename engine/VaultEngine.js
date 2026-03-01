// ./engine/VaultEngine.js
import fs from 'fs';
import path from 'path';
import v8 from 'v8';
import { open } from 'lmdb';
import { MemoryArena } from './MemoryArena.js';

export class VaultEngine {
    constructor(options = {}) {
        options.folder = options.folder || './data';
        options.memory = options.memory || 50;
        this.basePath = path.resolve(options.folder);
        
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
        
        this.db = open({ path: this.basePath, compression: true, encoding: 'binary' });
        
        this.mapsArena = new MemoryArena(options.memory * 0.10, ['root.map.bin']);
        this.nodesArena = new MemoryArena(options.memory * 0.90, ['root.node.bin']);
    }

    #getArena(filename) {
        if (filename?.endsWith('map.bin')) return this.mapsArena;
        else if (filename?.endsWith('node.bin')) return this.nodesArena;
        else throw new Error('Invalid vault filename');
    }

    #encode(data) { return v8.serialize(data); }
    #decode(buffer) { return buffer ? v8.deserialize(buffer) : null; }

    writeSync(filename, data = {}) {
        const arena = this.#getArena(filename);
        const buffer = this.#encode(data);
        arena.set(filename, data, buffer.length);
        this.db.putSync(filename, buffer);
        return true;
    }

    async write(filename, data = {}) {
        const arena = this.#getArena(filename);
        const buffer = this.#encode(data);
        arena.set(filename, data, buffer.length);
        await this.db.put(filename, buffer);
        return true;
    }

    readSync(filename) {
        const arena = this.#getArena(filename);
        const cached = arena.get(filename);
        if (cached) return cached;
        
        const buffer = this.db.getBinary(filename);
        if (!buffer) return null;
        
        const data = this.#decode(buffer);
        arena.set(filename, data, buffer.length);
        return data;
    }

    async read(filename) { return this.readSync(filename); }
    
    removeSync(key) { 
        this.#getArena(key).delete(key); 
        this.db.removeSync(key); 
        return true; 
    }
    
    async remove(key) { 
        this.#getArena(key).delete(key); 
        await this.db.remove(key); 
        return true; 
    }
    
    existsSync(key) { 
        return this.#getArena(key).has(key) || this.db.doesExist(key); 
    }
    
    async exists(key) { return this.existsSync(key); }
    async flush() { return this.db.flushed; }
    async prune() { return true; }
}