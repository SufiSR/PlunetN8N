import { XMLParser } from 'fast-xml-parser';

export function extractUuid(xml: string): string | null {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const env = (parsed?.Envelope ?? {}) as Record<string, unknown>;
    const body = (env?.Body ?? {}) as Record<string, unknown>;

    const keys = Object.keys(body);
    if (keys.length === 0) return null;

    const respKeyMaybe = keys.find((k) => /loginresponse|response|return/i.test(k)) ?? keys[0];
    if (!respKeyMaybe) return null;

    const wrapperUnknown = (body as Record<string, unknown>)[respKeyMaybe];
    const wrapper =
        typeof wrapperUnknown === 'object' && wrapperUnknown !== null
            ? (wrapperUnknown as Record<string, unknown>)
            : {};

    const ret = (wrapper as Record<string, unknown>)['return'] ?? wrapper;

    if (typeof ret === 'string' && isUuid(ret)) return ret;
    if (ret && typeof ret === 'object') {
        const maybe =
            (ret as Record<string, unknown>)['uuid'] ??
            (ret as Record<string, unknown>)['UUID'] ??
            (ret as Record<string, unknown>)['token'] ??
            (ret as Record<string, unknown>)['sessionId'];
        if (typeof maybe === 'string' && isUuid(maybe)) return maybe;
    }
    return null;
}

export function parseValidate(xml: string): boolean {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const env = (parsed?.Envelope ?? {}) as Record<string, unknown>;
    const body = (env?.Body ?? {}) as Record<string, unknown>;

    const keys = Object.keys(body);
    if (keys.length === 0) return false;

    const respKeyMaybe = keys.find((k) => /validate(response)?|response|return/i.test(k)) ?? keys[0];
    if (!respKeyMaybe) return false;

    const wrapperUnknown = (body as Record<string, unknown>)[respKeyMaybe];
    const wrapper =
        typeof wrapperUnknown === 'object' && wrapperUnknown !== null
            ? (wrapperUnknown as Record<string, unknown>)
            : {};

    const ret = (wrapper as Record<string, unknown>)['return'] ?? wrapper;

    if (typeof ret === 'boolean') return ret;
    if (typeof ret === 'string') return ret.toLowerCase() === 'true';

    if (ret && typeof ret === 'object') {
        const rec = ret as Record<string, unknown>;
        const maybe = rec['valid'] ?? rec['isValid'] ?? rec['value'];
        if (typeof maybe === 'boolean') return maybe;
        if (typeof maybe === 'string') return maybe.toLowerCase() === 'true';
    }
    return false;
}

export function extractStatusMessage(xml: string): string | null {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
    const parsed = parser.parse(xml) as unknown;

    function dfs(node: unknown): string | null {
        if (!node || typeof node !== 'object') return null;
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (typeof k === 'string' && k.toLowerCase().includes('statusmessage')) {
                if (typeof v === 'string') return v;
                const fromChild = dfs(v);
                if (fromChild) return fromChild;
            }
            const rec = dfs(v);
            if (rec) return rec;
        }
        return null;
    }

    return dfs(parsed);
}

function isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
