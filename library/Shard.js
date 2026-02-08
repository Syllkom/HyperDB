import crypto from 'crypto';

export class Shard {
    constructor(disk, indexMap, cluster, depth) {
        this.disk = disk;
        this.indexMap = indexMap;
        this.cluster = cluster;
        this.depth = depth || 2;
    }

   static isObject(any) {
        if (!any) return false;
        if (typeof any !== 'object') return false;
        if (Array.isArray(any)) return false;
        const proto = Object.getPrototypeOf(any);
        return proto === Object.prototype || proto === null;
    }

    genId(depth) {
        depth = depth || this.depth;
        const id = crypto.randomBytes(4).toString('hex').toUpperCase();
        if (!depth || depth <= 0) return `${id}`
        const folder = id.substring(0, depth);
        return `${folder}/${id}`;
    }

    forge(data, indexMap, cluster) {
        if (!Shard.isObject(data)) return;

        indexMap = indexMap || this.indexMap;
        cluster = cluster || this.cluster;

        let mapContent = {};
        let hubContent = {};

        for (const key in data) {
            const value = data[key];

            if (Shard.isObject(value)) {
                const Id = this.genId();
                const nodeFile = Id + '.node.bin';
                const mapFile = Id + '.map.bin';

                this.disk.write(mapFile, { $file: mapFile });

                const _Index = new this.indexMap.constructor(this.disk, mapFile);
                const _Cluster = new this.cluster.constructor(this.disk, _Index);

                this.forge(value, _Index, _Cluster);

                hubContent[key] = `node:${nodeFile}`;
                mapContent[key] = mapFile;
            } else {
                hubContent[key] = value;
            }
        }

        Object.assign(indexMap.data, mapContent);
        Object.assign(cluster.data, hubContent);

        indexMap.file.save();
        cluster.node.file.save();
    }

    purge(mapPath) {
        if (!mapPath) return;
        if (typeof mapPath !== 'string') return;
        if (!mapPath.endsWith('.map.bin')) return;
        const mapData = this.disk.readSync(mapPath);

        if (!mapData) return;
        for (const key in mapData) {
            if (key === '$file') continue;
            const childPath = mapData[key];
            this.purge(childPath);
        }

        const nodePath = mapPath.replace('.map.bin', '.node.bin');

        this.disk.remove(mapPath);
        this.disk.remove(nodePath);
    }
}