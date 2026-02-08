import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import v8 from 'v8';

export class SyncIO {
    constructor(folder, atomic = true) {
        this.base = folder;
        this.atomic = atomic
        if (!fs.existsSync(this.base)) fs.mkdirSync(this.base, { recursive: true });
    }

    #catch(fn) {
        try { return fn() } catch (e) { console.error(e); return null }
    }

    read(filePath) {
        return this.#catch(() => {
            const buffer = fs.readFileSync(filePath);
            const data = v8.deserialize(buffer);
            return data;
        })
    }

    write(filePath, data = {}) {
        return this.#catch(() => {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (this.atomic) {
                const tempPath = filePath + '.tmp';
                const buffer = v8.serialize(data);
                const fd = fs.openSync(tempPath, 'w');
                fs.writeSync(fd, buffer);
                fs.closeSync(fd);
                fs.renameSync(tempPath, filePath);
                return true;
            } else {
                const buffer = v8.serialize(data);
                fs.writeFileSync(filePath, buffer);
                return true;
            }
        })
    }

    remove(filePath) {
        return this.#catch(() => {
            if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
            return true;
        })
    }

    exists(filePath) {
        return fs.existsSync(filePath);
    }
}

///////////////////////

export class AsyncIO {
    #c0 = 0;
    #q0 = [];

    constructor(folder, atomic = true) {
        this.base = folder;
        this.atomic = atomic;
        this.Pipe = new Map();
        if (!fs.existsSync(this.base)) fs.mkdirSync(this.base, { recursive: true });
    }

    async #a0(fn) {
        if (this.#c0 >= 64) await new Promise(r => this.#q0.push(r));
        this.#c0++;
        try { return await fn(); } finally {
            this.#c0--;
            if (this.#q0.length) this.#q0.shift()();
        }
    }

    async #e0(fn, r = 3) {
        try { return await fn(); } catch (e) {
            if ((e.code === 'ENOENT' || e.code === 'EMFILE') && r > 0) {
                await new Promise(t => setTimeout(t, 20));
                return this.#e0(fn, r - 1);
            } else throw e;
        }
    }

    async queue(filename, action) {
        const next = (this.Pipe.get(filename) || Promise.resolve())
            .then(() => this.#a0(action)).catch((e) => console.error(e)).finally(() =>
                (this.Pipe.get(filename) === next) ? this.Pipe.delete(filename) : false);
        return this.Pipe.set(filename, next).get(filename);
    }

    async read(filePath) {
        return this.queue(filePath, async () => {
            try {
                const buffer = await fsp.readFile(filePath);
                return v8.deserialize(buffer);
            } catch (e) { return null }
        });
    }

    async write(filePath, data = {}) {
        return this.queue(filePath, async () => {
            const dir = path.dirname(filePath);
            const buffer = v8.serialize(data);
            await this.#e0(() => fsp.mkdir(dir, { recursive: true }));

            if (this.atomic) {
                const tempPath = filePath + '.tmp';
                await this.#e0(() => fsp.writeFile(tempPath, buffer));
                await this.#e0(() => fsp.rename(tempPath, filePath));
                return true;
            } else {
                await this.#e0(() => fsp.writeFile(filePath, buffer));
                return true;
            }
        })
    }

    async remove(filePath) {
        return this.queue(filePath, async () => {
            await this.#e0(() => fsp.rm(filePath, { recursive: true, force: true }));
            return true;
        });
    }

    async exists(filePath) {
        return await fsp.access(filePath).then(() => true).catch(() => null)
    }

    async flush() {
        await Promise.all(this.Pipe.values());
        while (this.#c0 > 0 || this.#q0.length > 0) await new Promise(r => setTimeout(r, 50));
        return true;
    }
}