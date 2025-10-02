// nodes/Plunet/core/parsers/address.ts
import {
    asNum,
    asStr,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
    firstNonEmptyKey,
} from './common';
import { getAddressTypeName } from '../../enums/address-type';

// ============================================================================
// DTO TYPES
// ============================================================================

export type AddressDTO = {
    addressID?: number;
    addressType?: number;
    addressTypeLabel?: string;
    description?: string;
    name1?: string;
    name2?: string;
    office?: string;
    street?: string;
    street2?: string;
    city?: string;
    zip?: string;
    state?: string;
    country?: string;
    [k: string]: unknown;
};

// ============================================================================
// ENTITY DETECTORS
// ============================================================================

function isLikelyAddress(x: any): boolean {
    if (!x || typeof x !== 'object') return false;
    return (
        'addressID' in x ||
        'AddressID' in x ||
        'name1' in x ||
        'Name1' in x ||
        'street' in x ||
        'Street' in x ||
        'city' in x ||
        'City' in x
    );
}

// ============================================================================
// ENTITY COERCERS
// ============================================================================

function coerceAddress(raw: any): AddressDTO {
    const a: AddressDTO = {};
    a.addressID = asNum(firstNonEmptyKey(raw, ['addressID', 'AddressID', 'id', 'ID']));
    a.description = asStr(firstNonEmptyKey(raw, ['description', 'Description']));
    a.name1 = asStr(firstNonEmptyKey(raw, ['name1', 'Name1']));
    a.name2 = asStr(firstNonEmptyKey(raw, ['name2', 'Name2']));
    a.office = asStr(firstNonEmptyKey(raw, ['office', 'Office']));
    a.street = asStr(firstNonEmptyKey(raw, ['street', 'Street']));
    a.street2 = asStr(firstNonEmptyKey(raw, ['street2', 'Street2']));
    a.city = asStr(firstNonEmptyKey(raw, ['city', 'City']));
    a.zip = asStr(firstNonEmptyKey(raw, ['zip', 'Zip']));
    a.state = asStr(firstNonEmptyKey(raw, ['state', 'State']));
    a.country = asStr(firstNonEmptyKey(raw, ['country', 'Country']));

    const addressTypeId = asNum(firstNonEmptyKey(raw, ['addressType', 'AddressType']));
    if (addressTypeId !== undefined) {
        a.addressType = addressTypeId;
        a.addressTypeLabel = getAddressTypeName(addressTypeId);
    }

    for (const [k, v] of Object.entries(raw)) {
        if (!(k in a)) a[k] = v;
    }
    return a;
}

// ============================================================================
// DEEP FINDERS
// ============================================================================

function findAddressDeep(node: any): any | undefined {
    if (!node || typeof node !== 'object') return undefined;

    if (node.Address && typeof node.Address === 'object') return node.Address;
    if (node.address && typeof node.address === 'object') return node.address;

    if (isLikelyAddress(node)) return node;

    const candidates: any[] = [];
    if (node.return) candidates.push(node.return);
    for (const [k, v] of Object.entries(node)) {
        if (/result$/i.test(k) && v && typeof v === 'object') candidates.push(v);
    }
    if (node.data !== undefined) candidates.push(node.data);

    for (const c of candidates) {
        if (Array.isArray(c)) {
            for (const el of c) {
                const hit = findAddressDeep(el);
                if (hit) return hit;
            }
        } else {
            const hit = findAddressDeep(c);
            if (hit) return hit;
        }
    }

    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
            const hit = findAddressDeep(v);
            if (hit) return hit;
        }
    }
    return undefined;
}

// ============================================================================
// ARRAY PICKERS
// ============================================================================

function pickAddressArray(ret: any): any[] {
    const out: any[] = [];

    const data = ret?.data;
    if (Array.isArray(data)) {
        for (const d of data) {
            const maybe = findAddressDeep(d);
            if (maybe) out.push(maybe);
        }
    } else if (data && typeof data === 'object') {
        const maybe = findAddressDeep(data);
        if (maybe) out.push(maybe);
    }

    const addresses = ret?.Addresses ?? ret?.addresses;
    if (Array.isArray(addresses)) {
        for (const a of addresses) {
            const maybe = findAddressDeep(a);
            if (maybe) out.push(maybe);
        }
    }

    if (out.length === 0) {
        const single = findAddressDeep(ret);
        if (single) out.push(single);
    }

    return out;
}

// ============================================================================
// MAIN PARSERS
// ============================================================================

export function parseAddressResult(xml: string): ResultBase & { address?: AddressDTO } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const node = findAddressDeep(ret) ?? findAddressDeep(body);
    const address = node ? coerceAddress(node) : undefined;
    return { ...base, address };
}

export function parseAddressListResult(xml: string): ResultBase & { addresses: AddressDTO[] } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const nodes = pickAddressArray(ret);
    const addresses = nodes.map(coerceAddress);
    return { ...base, addresses };
}
