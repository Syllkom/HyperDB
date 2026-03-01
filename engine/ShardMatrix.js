// ./engine/ShardMatrix.js
import crypto from 'crypto';

export const HyperType = {
    NODE: 1,
    FUNCTION: 2,
    FILE: 3
}

export const HyperCodec = {
    SIG: 0x485950,
    is(array) {
        return Array.isArray(array) && array[0] === this.SIG;
    },
    encode(type, data) {
        return [this.SIG, type, Date.now(), Buffer.from(data.toString()).toString('base64')]
    },
    decode(array) {
        if (array?.[0] !== this.SIG) return;
        return [array[1], array[2], Buffer.from(array[3], 'base64').toString('utf-8')]
    },
}

export class ShardMatrix {
    constructor(vaultEngine, pointerRegistry, entityRouter, depth) {
        this.vaultEngine = vaultEngine;
        this.pointerRegistry = pointerRegistry;
        this.entityRouter = entityRouter;
        this.depth = depth || 2;
    }

    static isObject(any) {
        if (!any || typeof any !== 'object' || Array.isArray(any)) return false;
        const proto = Object.getPrototypeOf(any);
        return proto === Object.prototype || proto === null;
    }

    genId(depth) {
        depth = depth || this.depth;
        const id = crypto.randomBytes(6).toString('hex').toUpperCase();
        if (!depth || depth <= 0) return `${id}`
        const folder = id.substring(0, depth);
        return `${folder}/${id}`;
    }

    forge(payload, currentRegistry, currentRouter) {
        if (!ShardMatrix.isObject(payload)) return;

        currentRegistry = currentRegistry || this.pointerRegistry;
        currentRouter = currentRouter || this.entityRouter;

        let mapContent = {};
        let hubContent = {};

        for (const key in payload) {
            const value = payload[key];

            if (ShardMatrix.isObject(value)) {
                const shardId = this.genId();
                const nodeFile = shardId + '.node.bin';
                const mapFile = shardId + '.map.bin';

                this.vaultEngine.write(mapFile, { $file: mapFile });

                const nestedRegistry = new currentRegistry.constructor(this.vaultEngine, mapFile);
                const nestedRouter = new currentRouter.constructor(this.vaultEngine, nestedRegistry);

                this.forge(value, nestedRegistry, nestedRouter);

                hubContent[key] = HyperCodec.encode(HyperType.NODE, nodeFile);
                mapContent[key] = mapFile;
            } else {
                hubContent[key] = value;
            }
        }

        Object.assign(currentRegistry.data, mapContent);
        Object.assign(currentRouter.data, hubContent);

        currentRegistry.buffer.save();
        currentRouter.buffer.save();
    }

    purge(pointerPath) {
        if (!pointerPath || typeof pointerPath !== 'string' || !pointerPath.endsWith('.map.bin')) return;
        const registryData = this.vaultEngine.readSync(pointerPath);

        if (!registryData) return;
        for (const key in registryData) {
            if (key === '$file') continue;
            const childPath = registryData[key];
            this.purge(childPath);
        }

        const statePath = pointerPath.replace('.map.bin', '.node.bin');
        this.vaultEngine.remove(pointerPath);
        this.vaultEngine.remove(statePath);
    }
}
