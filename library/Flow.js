export class Flow {
    constructor() {
        this.tree = {};
    }

    forge(...args) {
        const val = args.pop();
        return args.reduceRight((acc, key) => ({ [key]: acc }), val);
    }

    get(...args) {
        return args.reduce((acc, k) => acc?.[k], this.tree) ?? false;
    }

    set(...args) {
        const val = args.pop();
        const target = args.reduce((acc, k) => acc[k] ??= {}, this.tree);
        const merge = (t, s) => Object.keys(s).forEach(k =>
            (s[k] instanceof Object && k in t) ? merge(t[k], s[k]) : t[k] = s[k]);
        merge(target, val);
    }

    delete(...args) {
        const del = (obj, [k, ...rest]) => {
            if (!obj?.[k]) return false;
            const success = rest.length ? del(obj[k], rest)
                : (delete obj[k].$proxy, delete obj[k].$call, true);
            if (success && !Object.keys(obj[k]).length)
                delete obj[k];
            return success;
        };
        return del(this.tree, args);
    }
}
