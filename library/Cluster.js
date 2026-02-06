import { Shard } from "./Shard.js";

export class File {
    #count = 0;
    #timer = null;
    constructor(disk, file, options = {}) {
        this.file = file;
        this.disk = disk;

        this._limit = options.limit ?? 10;
        this._delay = options.delay ?? 5000;
    }

    get data() {
        if (this.disk.existsSync(this.file)) {
            return this.disk.readSync(this.file);
        } else {
            this.disk.writeSync(this.file, {});
            return this.disk.readSync(this.file)
        }
    }

    save(force = false) {
        if (force || ++this.#count >= this._limit) {
            clearTimeout(this.#timer);
            this.#timer = null;
            this.#count = 0;
            return this.disk.write(this.file, this.data);
        }

        clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.save(true), this._delay);
    }
}

export class Index {
    constructor(disk, options = {}) {
        this.disk = disk;

        if (options?.$class?.File) {
            const a0 = options.$class.File;
            if (a0.constructor.name === 'Array') {
                this.file = new File(disk, 'index.bin', ...a0);
            } else if (a0.constructor.name === 'Object') {
                this.file = new File(disk, 'index.bin', a0);
            } else this.file = a0;
        }

        if (!this.file) {
            this.file = new File(disk, 'index.bin', {
                limit: options?.file?.limit || 10,
                delay: options.file?.delay || 5000
            });
        }

        this.data = this.file.data;
        if (!this.data.$file) {
            this.data.$file = 'root.bin';
            this.save();
        }
    }

    get(...args) {
        return args.reduce((acc, k) => acc?.[k], this.data) ?? false;
    }

    save() {
        return this.file.save();
    }
}

export class Cluster {
    constructor(disk, indexMap, options = {}) {
        this.disk = disk;
        this.indexMap = indexMap;

        if (options.$class?.Shard) {
            const a0 = options.$class.Shard;
            if (a0.constructor.name === 'Array') {
                this.shard = new Shard(disk, ...a0);
            } else if (a0.constructor.name === 'Number') {
                this.shard = new Shard(disk, a0);
            } else this.shard = a0;
        }

        if (options?.$class?.File) {
            const a0 = options.$class.File;
            if (a0.constructor.name === 'Array') {
                this.file = new File(disk, this.indexMap.$file, ...a0);
            } else if (a0.constructor.name === 'Object') {
                this.file = new File(disk, this.indexMap.$file, a0);
            } else this.file = a0;
        }

        if (!this.shard) {
            this.shard = new Shard(disk, options?.shard?.depth || 2);
        }

        if (!this.file) {
            this.file = new File(disk, this.indexMap.$file, {
                limit: options?.file?.limit || 5,
                delay: options.file?.delay || 3000
            });
        }
    }

    get data() {
        return this.file.data;
    }

    get(key) {
        const value = this.data[key];
        if (typeof value === 'string' && value.endsWith('.bin')) {
            if (!this.indexMap[key]) this.indexMap[key] = { $file: value };
            return { $file: value }
        }
        return value;
    }

    set(key, value) {
        if (this.indexMap[key]) {
            this.shard.purge(this.indexMap[key]);
            delete this.indexMap[key];
        }

        let isObject = false;
        if (value && typeof value === 'object') {
            const proto = Object.getPrototypeOf(value);
            isObject = (proto === Object.prototype || proto === null);
        }

        if (isObject) {
            let tmpIndex = {}
            const file = this.shard.forge(tmpIndex, value);

            if (file) {
                this.indexMap[key] = tmpIndex;
                this.data[key] = file;
            } else {
                return false;
            }
        } else {
            this.data[key] = value;
        }

        this.file.save();
    }

    delete(key) {
        if (this.indexMap[key]) {
            this.shard.purge(this.indexMap[key]);
            delete this.indexMap[key];
        }
        delete this.data[key];
        this.file.save();
    }

    keys() {
        return Object.keys(this.data);
    }
}