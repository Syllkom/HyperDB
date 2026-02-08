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
            this.disk.write(this.file, {});
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