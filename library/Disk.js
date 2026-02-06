import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import v8 from 'v8';

import { Memory } from './Memory.js';

export class Disk {
    constructor(options = {}) {
        if (options.constructor.name !== 'Object')
            throw new Error('Invalid options');

        if (options?.$class?.Memory) {
            const a0 = options.$class.Memory;
            if (a0.constructor.name == 'Array') {
                this.memory = new Memory(...a0);
            } else this.memory = a0
        }

        if (!options.folder) options.folder = './data';

        if (!this.memory) this.memory = new Memory(
            options.memory?.limit || 20,
            ['index.bin', 'root.bin']);

        this.onError = options.onError || ((err) =>
            console.error(`[HyperDB_IO_Error]:`, err));

        this.Pipe = new Map();
        this.basePath = path.resolve(options.folder);
        this.dataPath = path.join(this.basePath, 'data');
        this.files = ['index.bin', 'root.bin']

        if (!fs.existsSync(this.basePath)) fs.mkdirSync(this.basePath, { recursive: true });
        if (!fs.existsSync(this.dataPath)) fs.mkdirSync(this.dataPath, { recursive: true });
    }

    #path(filename) {
        if (!this.files.includes(filename))
            return path.join(this.dataPath, filename);
        return path.join(this.basePath, filename);
    }

    ////////////////////// Sync Methods

    readSync(filename) {
        const cached = this.memory.get(filename);
        if (cached) return cached;

        const filePath = this.#path(filename);
        try {
            const buffer = fs.readFileSync(filePath);
            const data = v8.deserialize(buffer);
            this.memory.set(filename, data);
            return data;
        } catch (e) {
            this.onError(e);
            return null;
        }
    }

    writeSync(filename, data = {}) {
        const filePath = this.#path(filename);
        try {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const tempPath = filePath + '.tmp';
            const buffer = v8.serialize(data);
            const fd = fs.openSync(tempPath, 'w');
            fs.writeSync(fd, buffer);
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fs.renameSync(tempPath, filePath);
            this.memory.set(filename, data);
            return true;
        } catch (e) {
            this.onError(e);
            return false;
        }
    }

    removeSync(filename) {
        const filePath = this.#path(filename);
        try {
            if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
            this.memory.delete(filename);
            return true;
        } catch (e) {
            this.onError(e);
            return false;
        }
    }

    existsSync(filename) {
        if (this.memory.has(filename)) return true;
        return fs.existsSync(this.#path(filename));
    }

    ////////////////////// Async Methods

    async #pipe(filename, action) {
        const next = (this.Pipe.get(filename) || Promise.resolve())
            .then(() => action().catch((e) => this.onError(e))).finally(() =>
                (this.Pipe.get(filename) === next) ? this.Pipe.delete(filename) : false);
        return this.Pipe.set(filename, next).get(filename);
    }

    async read(filename) {
        const cached = this.memory.get(filename);
        if (cached) return cached;

        return this.#pipe(filename, async () => {
            const filePath = this.#path(filename);
            try {
                const buffer = await fsp.readFile(filePath);
                const data = v8.deserialize(buffer);
                this.memory.set(filename, data);
                return data;
            } catch (e) {
                return null;
            }
        });
    }

    async write(filename, data = {}) {
        this.memory.set(filename, data);
        return this.#pipe(filename, async () => {
            const filePath = this.#path(filename);
            const dir = path.dirname(filePath);
            await fsp.mkdir(dir, { recursive: true });
            const tempPath = filePath + '.tmp';
            const buffer = v8.serialize(data);
            const handle = await fsp.open(tempPath, 'w');
            await handle.write(buffer);
            await handle.sync();
            await handle.close();
            await fsp.rename(tempPath, filePath);
            return true;
        });
    }

    async remove(filename) {
        this.memory.delete(filename);
        return this.#pipe(filename, async () => {
            const filePath = this.#path(filename);
            await fsp.rm(filePath, { recursive: true, force: true });
            return true;
        });
    }

    async exists(filename) {
        if (this.memory.has(filename)) return true;
        try {
            await fsp.access(this.#path(filename));
            return true;
        } catch {
            return false;
        }
    }

    async flush() {
        await Promise.all(this.Pipe.values());
        return true;
    }

    async prune() {
        return this.#pipe('__maint__', async () => {
            const scan = async (d) => {
                const items = await fsp.readdir(d, { withFileTypes: true });
                for (const i of items) if (i.isDirectory()) await scan(path.join(d, i.name));
                if (d !== this.dataPath && d !== this.basePath && !(await fsp.readdir(d)).length)
                    await fsp.rmdir(d).catch(() => null);
            };
            if (fs.existsSync(this.dataPath)) await scan(this.dataPath);
        });
    }
}