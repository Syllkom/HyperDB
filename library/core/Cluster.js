import { Shard } from '../Shard.js';
import { Flow } from './Flow.js';
import { Node } from './Node.js';

export class Cluster {
    constructor(disk, indexMap, options = {}) {
        this.indexMap = indexMap
        this.disk = disk

        this.flow = new Flow(disk, indexMap)
        this.node = new Node(disk, indexMap, options)

        this.shard = new Shard(disk, indexMap, this) 
    }

    get data() {
        return this.node.data;
    }

    get(key) {
        const value = this.data[key];

        if (typeof value === 'string'
            && value.startsWith('node:')
            && value.endsWith('.node.bin')
            && this.indexMap.get(value)) {
            this.indexMap.set(key, value);
        }

        return value;
    }

    set(key, value) {
        if (this.indexMap.get(key))
            this.delete(key);

        if (Shard.isObject(value)) {
            this.shard.forge({ [key]: value }, this.indexMap, this);
        } else {
            this.data[key] = value;
            this.node.file.save();
        }
    }

    delete(key) {
        const map = this.indexMap.get(key);

        if (map) {
            this.shard.purge(map);
            this.indexMap.delete(key);
        }

        delete this.data[key];
        this.node.file.save();
    }

    keys() {
        return Object.keys(this.data);
    }
}