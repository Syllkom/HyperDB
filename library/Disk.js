import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

import { Memory } from './Memory.js';
import { SyncIO, AsyncIO } from './IO.js';

export class Disk {
    constructor(options = {}) {
        if (options.constructor.name !== 'Object')
            throw new Error('Invalid options');

        options.folder = options.folder || './data';
        options.atomic = typeof options.atomic === 'boolean' ? options.atomic : true;
        options.memory = options.memory || 50;

        this.syncIO = new SyncIO(options.folder, options.atomic);
        this.asyncIO = new AsyncIO(options.folder, options.atomic);

        this.flowRam = new Memory(options.memory * 0.02, ['root.flow.bin']);
        this.mapsRam = new Memory(options.memory * 0.10, ['root.map.bin']);
        this.nodesRam = new Memory(options.memory * 0.88, ['root.node.bin']);

        if (!options.folder) options.folder = './data';

        this.basePath = path.resolve(options.folder);
        this.mapsPath = path.join(this.basePath, 'maps');
        this.nodesPath = path.join(this.basePath, 'nodes');
        this.flowPath = path.join(this.basePath, 'flows');

        const folders = [this.basePath, this.mapsPath, this.nodesPath, this.flowPath]

        folders.forEach(dir => {
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        });
    }

    #a0(filename) {
        if (filename?.endsWith('flow.bin')) return {
            path: this.flowRam.pinnedKeys.has(filename) ? path.join(this.basePath, filename) : path.join(this.flowPath, filename),
            ram: this.flowRam
        }
        else if (filename?.endsWith('map.bin')) return {
            path: this.mapsRam.pinnedKeys.has(filename) ? path.join(this.basePath, filename) : path.join(this.mapsPath, filename),
            ram: this.mapsRam
        }
        else if (filename?.endsWith('node.bin')) return {
            path: this.nodesRam.pinnedKeys.has(filename) ? path.join(this.basePath, filename) : path.join(this.nodesPath, filename),
            ram: this.nodesRam
        }
        else return new Error('Invalid filename');
    }

    //////////////////////

    readSync(filename) {
        const { ram, path } = this.#a0(filename);
        const cached = ram.get(filename);
        if (cached) return cached;
        const data = this.syncIO.read(path);
        ram.set(filename, data);
        return data;
    }

    writeSync(filename, data = {}) {
        const { ram, path } = this.#a0(filename);
        ram.set(filename, data);
        this.syncIO.write(path, data);
        return true;
    }

    removeSync(filename) {
        const { ram, path } = this.#a0(filename);
        ram.delete(filename);
        this.syncIO.remove(path);
        return true;
    }

    existsSync(filename) {
        const { ram, path } = this.#a0(filename);
        if (ram.has(filename)) return true;
        return this.syncIO.exists(path);
    }

    //////////////////////

    async read(filename) {
        const { ram, path } = this.#a0(filename);
        const cached = ram.get(filename);
        if (cached) return cached;
        const data = await this.asyncIO.read(path);
        ram.set(filename, data);
        return data;
    }

    write(filename, data = {}) {
        const { ram, path } = this.#a0(filename);
        ram.set(filename, data);
        return this.asyncIO.write(path, data);
    }

    remove(filename) {
        const { ram, path } = this.#a0(filename);
        ram.delete(filename);
        return this.asyncIO.remove(path);
    }

    exists(filename) {
        const { ram, path } = this.#a0(filename);
        if (ram.has(filename)) return true;
        return this.asyncIO.exists(path);
    }

    //////////////////////

    async flush() {
        return await this.asyncIO.flush();
    }

    async prune() {
        return this.asyncIO.queue('__maint__', async () => {
            const scan = async (d) => {
                const items = await fsp.readdir(d, { withFileTypes: true });
                for (const i of items) if (i.isDirectory()) await scan(path.join(d, i.name));
                if (d !== this.nodesPath && d !== this.basePath && !(await fsp.readdir(d)).length)
                    await fsp.rmdir(d).catch(() => null);
            };

            if (fs.existsSync(this.flowPath)) await scan(this.flowPath);
            if (fs.existsSync(this.nodesPath)) await scan(this.nodesPath);
            if (fs.existsSync(this.mapsPath)) await scan(this.mapsPath);
        });
    }
}