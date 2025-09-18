// nodes/Plunet/core/parsers/customer.ts
import type { FormOfAddressName } from '../../enums/form-of-address';
import { idToFormOfAddressName } from '../../enums/form-of-address';
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
    idToCustomerStatusName,
} from './common';

// ============================================================================
// DTO TYPES
// ============================================================================

export type CustomerDTO = {
    customerID?: number;
    externalID?: string;
    fullName?: string;
    name1?: string;
    name2?: string;
    email?: string;
    phone?: string;
    fax?: string;
    mobilePhone?: string;
    website?: string;
    currency?: string;
    status?: string;
    statusId?: number;
    accountID?: number;
    projectManagerID?: number;
    accountManagerID?: number;
    formOfAddress?: number;
    formOfAddressName?: FormOfAddressName;
    academicTitle?: string;
    opening?: string;
    skypeID?: string;
    costCenter?: string;
    dateOfInitialContact?: string;
    sourceOfContact?: string;
    dossier?: string;
    [k: string]: unknown;
};

// ============================================================================
// ENTITY DETECTORS
// ============================================================================

function isLikelyCustomer(x: any): boolean {
    if (!x || typeof x !== 'object') return false;
    return (
        'customerID' in x ||
        'CustomerID' in x ||
        'fullName' in x ||
        'FullName' in x ||
        'name1' in x ||
        'Name1' in x ||
        'email' in x ||
        'EMail' in x
    );
}

// ============================================================================
// ENTITY COERCERS
// ============================================================================

function coerceCustomer(raw: any): CustomerDTO {
    const c: CustomerDTO = {};
    c.customerID = asNum(firstNonEmptyKey(raw, ['customerID', 'CustomerID', 'id', 'ID']));
    c.externalID = asStr(firstNonEmptyKey(raw, ['externalID', 'ExternalID']));
    c.fullName = asStr(firstNonEmptyKey(raw, ['fullName', 'FullName']));
    c.name1 = asStr(firstNonEmptyKey(raw, ['name1', 'Name1']));
    c.name2 = asStr(firstNonEmptyKey(raw, ['name2', 'Name2']));
    c.email = asStr(firstNonEmptyKey(raw, ['email', 'EMail']));
    c.phone = asStr(firstNonEmptyKey(raw, ['phone', 'Phone']));
    c.fax = asStr(firstNonEmptyKey(raw, ['fax', 'Fax']));
    c.mobilePhone = asStr(firstNonEmptyKey(raw, ['mobilePhone', 'MobilePhone']));
    c.website = asStr(firstNonEmptyKey(raw, ['website', 'Website']));
    c.currency = asStr(firstNonEmptyKey(raw, ['currency', 'Currency']));
    c.accountID = asNum(firstNonEmptyKey(raw, ['accountID', 'AccountID']));
    c.projectManagerID = asNum(firstNonEmptyKey(raw, ['projectManagerID', 'ProjectManagerID']));
    c.accountManagerID = asNum(firstNonEmptyKey(raw, ['accountManagerID', 'AccountManagerID']));
    c.academicTitle = asStr(firstNonEmptyKey(raw, ['academicTitle', 'AcademicTitle']));
    c.opening = asStr(firstNonEmptyKey(raw, ['opening', 'Opening']));
    c.skypeID = asStr(firstNonEmptyKey(raw, ['skypeID', 'SkypeID']));
    c.costCenter = asStr(firstNonEmptyKey(raw, ['costCenter', 'CostCenter']));
    c.dateOfInitialContact = asStr(firstNonEmptyKey(raw, ['dateOfInitialContact', 'DateOfInitialContact']));
    c.sourceOfContact = asStr(firstNonEmptyKey(raw, ['sourceOfContact', 'SourceOfContact']));
    c.dossier = asStr(firstNonEmptyKey(raw, ['dossier', 'Dossier']));

    const foaRaw = firstNonEmptyKey(raw, ['formOfAddress', 'FormOfAddress', 'formOfAddressId', 'FormOfAddressId']);
    const foaId = asNum(foaRaw);
    if (foaId !== undefined) {
        c.formOfAddress = foaId;
        const foaName = idToFormOfAddressName(foaId);
        if (foaName) c.formOfAddressName = foaName;
    } else {
        const foaName = typeof foaRaw === 'string' ? foaRaw : undefined;
        if (foaName) c.formOfAddressName = foaName as FormOfAddressName;
    }

    const statusId = asNum(firstNonEmptyKey(raw, ['status', 'Status'])) ?? asNum(firstNonEmptyKey(raw, ['statusId', 'statusID', 'StatusID']));
    if (statusId !== undefined) {
        c.statusId = statusId;
        const name = idToCustomerStatusName(statusId);
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

// ============================================================================
// DEEP FINDERS
// ============================================================================

function findCustomerDeep(node: any): any | undefined {
    if (!node || typeof node !== 'object') return undefined;

    if (node.Customer && typeof node.Customer === 'object') return node.Customer;
    if (node.customer && typeof node.customer === 'object') return node.customer;

    if (isLikelyCustomer(node)) return node;

    const candidates: any[] = [];
    if (node.return) candidates.push(node.return);
    for (const [k, v] of Object.entries(node)) {
        if (/result$/i.test(k) && v && typeof v === 'object') candidates.push(v);
    }
    if (node.data !== undefined) candidates.push(node.data);

    for (const c of candidates) {
        if (Array.isArray(c)) {
            for (const el of c) {
                const hit = findCustomerDeep(el);
                if (hit) return hit;
            }
        } else {
            const hit = findCustomerDeep(c);
            if (hit) return hit;
        }
    }

    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
            const hit = findCustomerDeep(v);
            if (hit) return hit;
        }
    }
    return undefined;
}

// ============================================================================
// ARRAY PICKERS
// ============================================================================

function pickCustomerArray(ret: any): any[] {
    const out: any[] = [];

    const data = ret?.data;
    if (Array.isArray(data)) {
        for (const d of data) {
            const maybe = findCustomerDeep(d);
            if (maybe) out.push(maybe);
        }
    } else if (data && typeof data === 'object') {
        const maybe = findCustomerDeep(data);
        if (maybe) out.push(maybe);
    }

    const customers = ret?.Customers ?? ret?.customers;
    if (Array.isArray(customers)) {
        for (const c of customers) {
            const maybe = findCustomerDeep(c);
            if (maybe) out.push(maybe);
        }
    }

    if (out.length === 0) {
        const single = findCustomerDeep(ret);
        if (single) out.push(single);
    }

    return out;
}

// ============================================================================
// MAIN PARSERS
// ============================================================================

export function parseCustomerResult(xml: string): ResultBase & { customer?: CustomerDTO } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const node = findCustomerDeep(ret) ?? findCustomerDeep(body);
    const customer = node ? coerceCustomer(node) : undefined;
    return { ...base, customer };
}

export function parseCustomerListResult(xml: string): ResultBase & { customers: CustomerDTO[] } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const nodes = pickCustomerArray(ret);
    const customers = nodes.map(coerceCustomer);
    return { ...base, customers };
}
