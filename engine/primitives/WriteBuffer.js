// ./engine/primitives/WriteBuffer.js
export class WriteBuffer {
    #commitCount = 0;
    #flushTimer = null;

    constructor(vaultEngine, fileTarget, options = {}) {
        this.fileTarget = fileTarget;
        this.vaultEngine = vaultEngine;
        this._limit = options.limit ?? 10;
        this._delay = options.delay ?? 5000;
    }

    get data() {
        if (this.vaultEngine.existsSync(this.fileTarget)) {
            return this.vaultEngine.readSync(this.fileTarget);
        } else {
            this.vaultEngine.write(this.fileTarget, {});
            return this.vaultEngine.readSync(this.fileTarget)
        }
    }

    save(forceCommit = false) {
        if (forceCommit || ++this.#commitCount >= this._limit) {
            clearTimeout(this.#flushTimer);
            this.#flushTimer = null;
            this.#commitCount = 0;
            return this.vaultEngine.write(this.fileTarget, this.data);
        }

        clearTimeout(this.#flushTimer);
        this.#flushTimer = setTimeout(() => this.save(true), this._delay);
    }
}