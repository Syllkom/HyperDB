import { File } from "./File.js";

export class Node {
    constructor(disk, indexMap, options = {}) {
        this.disk = disk;
        this.file = new File(
            disk, indexMap.fileNode, {
            limit: options?.file?.limit || 10,
            delay: options.file?.delay || 5000
        });
    }

    save() { return this.file.save(); }
    keys() { return Object.keys(this.data); }
    get data() { return this.file.data; }
    get(key) { return this.data[key] }

    set(key, value) {
        this.data[key] = value;
        this.file.save();
    }

    delete(key) {
        delete this.data[key];
        this.file.save();
    }
}
