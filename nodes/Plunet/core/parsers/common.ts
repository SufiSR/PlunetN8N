// nodes/Plunet/core/parsers/common.ts
import {
    asNum,
    asStr,
    toArray,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
} from '../xml';

// ============================================================================
// XML UTILITIES
// ============================================================================

/** Namespace-agnostic tag scanners */
export function findFirstTag(xml: string, tag: string): string | undefined {
    const rx = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i');
    const m = rx.exec(xml);
    return m ? m[1] : undefined;
}

export function findFirstTagBlock(xml: string, tag: string): string | undefined {
    const rx = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, 'i');
    const m = rx.exec(xml);
    return m ? m[0] : undefined;
}

export function findAllTagBlocks(xml: string, tag: string): string[] {
    const rx = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, 'gi');
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(xml))) out.push(m[0]);
    return out;
}

export function coerceScalar(s: string): any {
    const raw = s.trim();
    if (raw === '') return '';
    const t = raw.toLowerCase();
    if (t === 'true') return true;
    if (t === 'false') return false;

    // .NET-style /Date(1694544000000)/ → ISO
    const dotnet = /\/Date\((-?\d+)\)\//.exec(raw);
    if (dotnet?.[1]) {
        const ms = Number(dotnet[1]);
        if (!Number.isNaN(ms)) return new Date(ms).toISOString();
    }

    // number?
    if (/^-?\d+$/.test(raw)) return Number(raw);
    if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);

    return raw;
}

export function objectify(xmlFragment: string): Record<string, any> {
    const obj: Record<string, any> = {};
    const rx = /<(?:\w+:)?([A-Za-z0-9_]+)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/g;

    let m: RegExpExecArray | null;
    while ((m = rx.exec(xmlFragment)) !== null) {
        const key = typeof m[1] === 'string' ? m[1].trim() : '';
        if (!key) continue;

        const inner = typeof m[2] === 'string' ? m[2].trim() : '';

        if (/<(?:\w+:)?[A-Za-z0-9_]+\b[^>]*>/.test(inner)) {
            obj[key] = inner;
        } else {
            obj[key] = coerceScalar(inner);
        }
    }
    return obj;
}

export function deepObjectify(xmlBlock: string): any {
    const childRx = /<(?:\w+:)?([A-Za-z0-9_]+)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/g;

    const out: Record<string, any> = {};
    for (let m: RegExpExecArray | null; (m = childRx.exec(xmlBlock)); ) {
        const key = typeof m[1] === 'string' ? m[1].trim() : '';
        if (!key) continue;

        const innerRaw = typeof m[2] === 'string' ? m[2] : '';
        const hasChildTag = /<(?:\w+:)?[A-Za-z0-9_]+\b[^>]*>/.test(innerRaw);

        const value = hasChildTag ? deepObjectify(innerRaw) : coerceScalar(innerRaw.trim());

        if (Object.prototype.hasOwnProperty.call(out, key)) {
            const prev = out[key];
            if (Array.isArray(prev)) {
                prev.push(value);
            } else {
                out[key] = [prev, value];
            }
        } else {
            out[key] = value;
        }
    }

    if (Object.keys(out).length === 0) {
        return coerceScalar(xmlBlock.replace(/<[^>]*>/g, '').trim());
    }

    return out;
}

export function scopeToData(xml: string, wrapperTag: string): string {
    const wrapper = findFirstTagBlock(xml, wrapperTag) ?? xml;
    return findFirstTag(wrapper, 'data') ?? wrapper;
}

export function firstNonEmptyKey(obj: Record<string, any>, keys: string[]) {
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

// ============================================================================
// ENUM MAPPINGS
// ============================================================================

const CustomerStatusNameById: Record<number, string> = {
    1: 'ACTIVE',
    2: 'NOT_ACTIVE',
    3: 'CONTACTED',
    4: 'NEW',
    5: 'BLOCKED',
    6: 'AQUISITION_ADDRESS',
    7: 'NEW_AUTO',
    8: 'DELETION_REQUESTED',
};

export function idToCustomerStatusName(id?: number | null): string | undefined {
    if (id == null) return undefined;
    return CustomerStatusNameById[id];
}

// ============================================================================
// RE-EXPORTS FROM XML MODULE
// ============================================================================

export {
    asNum,
    asStr,
    toArray,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
};
