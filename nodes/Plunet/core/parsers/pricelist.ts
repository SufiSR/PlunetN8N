// nodes/Plunet/core/parsers/pricelist.ts
import {
    asNum,
    asStr,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
    findFirstTagBlock,
    findAllTagBlocks,
    scopeToData,
    deepObjectify,
    firstNonEmptyKey,
} from './common';

// ============================================================================
// DTO TYPES
// ============================================================================

export type PricelistDTO = {
    adminPriceListId?: number;
    adminPriceListPartnerType?: number;
    currency?: string;
    isWithWhiteSpace?: boolean;
    memo?: string;
    pricelistNameEN?: string;
    resourcePriceListID?: number;
    [k: string]: unknown;
};

// ============================================================================
// ENTITY DETECTORS
// ============================================================================

function isLikelyPricelist(x: any): boolean {
    if (!x || typeof x !== 'object') return false;
    return (
        'adminPriceListId' in x || 'AdminPriceListId' in x ||
        'pricelistNameEN' in x || 'PricelistNameEN' in x ||
        'currency' in x || 'Currency' in x
    );
}

// ============================================================================
// ENTITY COERCERS
// ============================================================================

function coercePricelist(raw: any): PricelistDTO {
    const p: PricelistDTO = {
        adminPriceListId: asNum(firstNonEmptyKey(raw, ['adminPriceListId', 'AdminPriceListId'])),
        adminPriceListPartnerType: asNum(firstNonEmptyKey(raw, ['adminPriceListPartnerType', 'AdminPriceListPartnerType'])),
        currency: asStr(firstNonEmptyKey(raw, ['currency', 'Currency'])),
        isWithWhiteSpace: (() => {
            const v = firstNonEmptyKey(raw, ['isWithWhiteSpace', 'IsWithWhiteSpace', 'withWhiteSpace']);
            if (typeof v === 'boolean') return v;
            if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
            if (typeof v === 'number') return v !== 0;
            return undefined;
        })(),
        memo: asStr(firstNonEmptyKey(raw, ['memo', 'Memo'])),
        pricelistNameEN: asStr(firstNonEmptyKey(raw, ['pricelistNameEN', 'PricelistNameEN'])),
        resourcePriceListID: asNum(firstNonEmptyKey(raw, ['resourcePriceListID', 'ResourcePriceListID'])),
    };

    for (const [k, v] of Object.entries(raw)) {
        if (!(k in p)) (p as any)[k] = v;
    }
    return p;
}

// ============================================================================
// DEEP FINDERS
// ============================================================================

function findPricelistDeep(node: any): any | undefined {
    if (!node || typeof node !== 'object') return undefined;

    if (node.Pricelist && typeof node.Pricelist === 'object') return node.Pricelist;
    if (node.pricelist && typeof node.pricelist === 'object') return node.pricelist;

    if (isLikelyPricelist(node)) return node;

    const candidates: any[] = [];
    if (node.return) candidates.push(node.return);
    for (const [k, v] of Object.entries(node)) {
        if (/result$/i.test(k) && v && typeof v === 'object') candidates.push(v);
    }
    if (node.data !== undefined) candidates.push(node.data);

    for (const c of candidates) {
        if (Array.isArray(c)) {
            for (const el of c) {
                const hit = findPricelistDeep(el);
                if (hit) return hit;
            }
        } else {
            const hit = findPricelistDeep(c);
            if (hit) return hit;
        }
    }

    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
            const hit = findPricelistDeep(v);
            if (hit) return hit;
        }
    }
    return undefined;
}

// ============================================================================
// ARRAY PICKERS
// ============================================================================

function pickPricelistArray(ret: any): any[] {
    const out: any[] = [];

    const data = ret?.data;
    if (Array.isArray(data)) {
        for (const d of data) {
            const maybe = findPricelistDeep(d);
            if (maybe) out.push(maybe);
        }
    } else if (data && typeof data === 'object') {
        const maybe = findPricelistDeep(data);
        if (maybe) out.push(maybe);
    }

    const list = ret?.Pricelists ?? ret?.pricelists;
    if (Array.isArray(list)) {
        for (const p of list) {
            const maybe = findPricelistDeep(p);
            if (maybe) out.push(maybe);
        }
    }

    if (out.length === 0) {
        const single = findPricelistDeep(ret);
        if (single) out.push(single);
    }

    return out;
}

// ============================================================================
// MAIN PARSERS
// ============================================================================

export function parsePricelistListResult(xml: string): ResultBase & { pricelists: PricelistDTO[] } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const nodes = pickPricelistArray(ret);
    const pricelists = nodes.map(coercePricelist);
    return { ...base, pricelists };
}

export function parsePricelistResult(xml: string) {
    const base = extractResultBase(xml);
    const scope = scopeToData(xml, 'PricelistResult');
    const block = findFirstTagBlock(scope, 'Pricelist');
    const pricelist = block ? deepObjectify(block) : undefined;

    return { pricelist, statusMessage: base.statusMessage, statusCode: base.statusCode };
}

export function parsePricelistEntryListResult(xml: string) {
    const base = extractResultBase(xml);
    const scope = scopeToData(xml, 'PricelistEntryListResult');

    let blocks = findAllTagBlocks(scope, 'PricelistEntry');

    if (blocks.length === 0) {
        const fallback: string[] = [];
        const anyEntryRx = /<(?:\w+:)?([A-Za-z0-9_]*Entry)\b[^>]*>[\s\S]*?<\/(?:\w+:)?\1>/gi;
        let m: RegExpExecArray | null;
        while ((m = anyEntryRx.exec(scope))) {
            fallback.push(m[0]);
        }
        blocks = fallback;
    }

    const entries = blocks.map(deepObjectify);

    return { entries, statusMessage: base.statusMessage, statusCode: base.statusCode };
}
