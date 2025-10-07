import {
    asNum,
    asStr,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
    findFirstTag,
    findFirstTagBlock,
    firstNonEmptyKey,
} from './common';
import { ContactPersonStatusDef } from '../../enums/contact-person-status';
import { idToName } from '../../enums/types';

export type CustomerContactDTO = {
    addressID?: number;
    costCenter?: string;
    customerContactID?: number;
    customerID?: number;
    email?: string;
    externalID?: string;
    fax?: string;
    mobilePhone?: string;
    name1?: string;
    name2?: string;
    phone?: string;
    status?: string; // friendly enum name
    statusId?: number;
    userId?: number;
    [k: string]: unknown;
};

function isLikelyContact(x: any): boolean {
    if (!x || typeof x !== 'object') return false;
    return (
        'customerContactID' in x ||
        'CustomerContactID' in x ||
        'addressID' in x ||
        'AddressID' in x ||
        'email' in x ||
        'EMail' in x
    );
}

function coerceContact(raw: any): CustomerContactDTO {
    const c: CustomerContactDTO = {};
    c.addressID = asNum(firstNonEmptyKey(raw, ['addressID', 'AddressID']));
    c.customerContactID = asNum(firstNonEmptyKey(raw, ['customerContactID', 'CustomerContactID', 'contactID', 'ContactID']));
    c.customerID = asNum(firstNonEmptyKey(raw, ['customerID', 'CustomerID']));
    c.email = asStr(firstNonEmptyKey(raw, ['email', 'EMail']));
    c.externalID = asStr(firstNonEmptyKey(raw, ['externalID', 'ExternalID']));
    c.fax = asStr(firstNonEmptyKey(raw, ['fax', 'Fax']));
    c.mobilePhone = asStr(firstNonEmptyKey(raw, ['mobilePhone', 'MobilePhone']));
    c.name1 = asStr(firstNonEmptyKey(raw, ['name1', 'Name1']));
    c.name2 = asStr(firstNonEmptyKey(raw, ['name2', 'Name2']));
    c.phone = asStr(firstNonEmptyKey(raw, ['phone', 'Phone']));
    c.userId = asNum(firstNonEmptyKey(raw, ['userId', 'UserId', 'UserID']));

    const statusId = asNum(firstNonEmptyKey(raw, ['status', 'Status'])) ?? asNum(firstNonEmptyKey(raw, ['statusId', 'statusID', 'StatusID']));
    if (statusId !== undefined) {
        c.statusId = statusId;
        const name = idToName(ContactPersonStatusDef, statusId);
        if (name) c.status = name;
    } else {
        const s = asStr(firstNonEmptyKey(raw, ['status', 'Status']));
        if (s) c.status = s;
    }

    for (const [k, v] of Object.entries(raw)) {
        if (!(k in c)) c[k] = v;
    }
    return c;
}

function findContactDeep(node: any): any | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (node.CustomerContact && typeof node.CustomerContact === 'object') return node.CustomerContact;
    if (node.customerContact && typeof node.customerContact === 'object') return node.customerContact;
    if (isLikelyContact(node)) return node;

    const candidates: any[] = [];
    if (node.return) candidates.push(node.return);
    for (const [k, v] of Object.entries(node)) {
        if (/result$/i.test(k) && v && typeof v === 'object') candidates.push(v);
    }
    if (node.data !== undefined) candidates.push(node.data);

    for (const c of candidates) {
        if (Array.isArray(c)) {
            for (const el of c) {
                const hit = findContactDeep(el);
                if (hit) return hit;
            }
        } else {
            const hit = findContactDeep(c);
            if (hit) return hit;
        }
    }

    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
            const hit = findContactDeep(v);
            if (hit) return hit;
        }
    }
    return undefined;
}

function pickContactArray(ret: any): any[] {
    const out: any[] = [];
    const data = ret?.data;
    if (Array.isArray(data)) {
        for (const d of data) {
            const maybe = findContactDeep(d);
            if (maybe) out.push(maybe);
        }
    } else if (data && typeof data === 'object') {
        const maybe = findContactDeep(data);
        if (maybe) out.push(maybe);
    }
    if (out.length === 0) {
        const single = findContactDeep(ret);
        if (single) out.push(single);
    }
    return out;
}

export function parseCustomerContactResult(xml: string): ResultBase & { contact?: CustomerContactDTO } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;
    const node = findContactDeep(ret) ?? findContactDeep(body);
    const contact = node ? coerceContact(node) : undefined;
    return { ...base, contact };
}

export function parseCustomerContactListResult(xml: string): ResultBase & { contacts: CustomerContactDTO[] } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;
    const nodes = pickContactArray(ret);
    const contacts = nodes.map(coerceContact);
    return { ...base, contacts };
}


