import crypto from 'crypto';

export const genId = (depth) => {
    const id = crypto.randomBytes(4).toString('hex').toUpperCase();
    if (!depth || depth <= 0) return `${id}.bin`
    const folder = id.substring(0, depth);
    return `${folder}/${id}.bin`;
};

function isShardable(val) {
    if (!val || typeof val !== 'object') return false;
    const proto = Object.getPrototypeOf(val);
    return proto === Object.prototype || proto === null;
}

export class Shard {
    constructor(disk, depth) {
        this.disk = disk;
        this.depth = depth;
    }

    purge(index) {
        if (index.$file) this.disk.remove(index.$file);
        for (const key in index) {
            if (key === '$file') continue;
            if (index[key] && typeof index[key] === 'object')
                this.purge(index[key]);
        }
    }

    forge(index, value, file) {
        try {
            const Id = file || genId(this.depth);
            value = structuredClone(value);
            index.$file = Id;

            for (const key in value) {
                 if (!isShardable(value[key])) continue;
                 
                index[key] = {};
                value[key] = this.forge(index[key], value[key]);
            }

            this.disk.write(Id, value);
            return Id;
        } catch (e) {
            this.disk.onError(e.message);
            return null
        }
    }
}