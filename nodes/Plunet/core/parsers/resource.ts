// nodes/Plunet/core/parsers/resource.ts
import type { FormOfAddressName } from '../../enums/form-of-address';
import { idToFormOfAddressName } from '../../enums/form-of-address';
import {
    asNum,
    asStr,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
    firstNonEmptyKey,
} from './common';

// ============================================================================
// DTO TYPES
// ============================================================================

export type ResourceDTO = {
    resourceID?: number;
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
    costCenter?: string;
    formOfAddress?: number;
    academicTitle?: string;
    opening?: string;
    skypeID?: string;
    userId?: number;
    statusId?: number;
    workingStatusId?: number;
    resourceTypeId?: number;
    supervisor1?: string;
    supervisor2?: string;
    [k: string]: unknown;
};

// ============================================================================
// ENTITY DETECTORS
// ============================================================================

function isLikelyResource(x: any): boolean {
    if (!x || typeof x !== 'object') return false;
    return (
        'resourceID' in x || 'ResourceID' in x ||
        'fullName' in x || 'FullName' in x ||
        'name1' in x || 'Name1' in x ||
        'email' in x || 'EMail' in x
    );
}

// ============================================================================
// ENTITY COERCERS
// ============================================================================

function coerceResource(raw: any): ResourceDTO {
    const r: ResourceDTO = {};
    r.resourceID = asNum(firstNonEmptyKey(raw, ['resourceID', 'ResourceID', 'id', 'ID']));
    r.externalID = asStr(firstNonEmptyKey(raw, ['externalID', 'ExternalID']));
    r.fullName = asStr(firstNonEmptyKey(raw, ['fullName', 'FullName']));
    r.name1 = asStr(firstNonEmptyKey(raw, ['name1', 'Name1']));
    r.name2 = asStr(firstNonEmptyKey(raw, ['name2', 'Name2']));
    r.email = asStr(firstNonEmptyKey(raw, ['email', 'EMail']));
    r.phone = asStr(firstNonEmptyKey(raw, ['phone', 'Phone']));
    r.fax = asStr(firstNonEmptyKey(raw, ['fax', 'Fax']));
    r.mobilePhone = asStr(firstNonEmptyKey(raw, ['mobilePhone', 'MobilePhone']));
    r.website = asStr(firstNonEmptyKey(raw, ['website', 'Website']));
    r.currency = asStr(firstNonEmptyKey(raw, ['currency', 'Currency']));
    r.costCenter = asStr(firstNonEmptyKey(raw, ['costCenter', 'CostCenter']));
    r.academicTitle = asStr(firstNonEmptyKey(raw, ['academicTitle', 'AcademicTitle']));
    r.opening = asStr(firstNonEmptyKey(raw, ['opening', 'Opening']));
    r.skypeID = asStr(firstNonEmptyKey(raw, ['skypeID', 'SkypeID']));
    r.userId = asNum(firstNonEmptyKey(raw, ['userId', 'UserId']));

    r.statusId = asNum(firstNonEmptyKey(raw, ['status', 'Status', 'statusId', 'statusID', 'StatusID']));
    r.workingStatusId = asNum(firstNonEmptyKey(raw, ['workingStatus', 'WorkingStatus', 'workingStatusId', 'WorkingStatusID']));
    r.resourceTypeId = asNum(firstNonEmptyKey(raw, ['resourceType', 'ResourceType', 'resourceTypeId', 'ResourceTypeID']));

    r.supervisor1 = asStr(firstNonEmptyKey(raw, ['supervisor1', 'Supervisor1']));
    r.supervisor2 = asStr(firstNonEmptyKey(raw, ['supervisor2', 'Supervisor2']));

    const foaRaw = firstNonEmptyKey(raw, ['formOfAddress', 'FormOfAddress', 'formOfAddressId', 'FormOfAddressId']);
    const foaId = asNum(foaRaw);
    if (foaId !== undefined) {
        r.formOfAddress = foaId;
        const foaName = idToFormOfAddressName(foaId);
        if (foaName) r.formOfAddressName = foaName;
    } else {
        const foaName = typeof foaRaw === 'string' ? foaRaw : undefined;
        if (foaName) r.formOfAddressName = foaName as FormOfAddressName;
    }

    for (const [k, v] of Object.entries(raw)) {
        if (!(k in r)) (r as any)[k] = v;
    }
    return r;
}

// ============================================================================
// DEEP FINDERS
// ============================================================================

function findResourceDeep(node: any): any | undefined {
    if (!node || typeof node !== 'object') return undefined;

    if (node.Resource && typeof node.Resource === 'object') return node.Resource;
    if (node.resource && typeof node.resource === 'object') return node.resource;

    if (isLikelyResource(node)) return node;

    const candidates: any[] = [];
    if (node.return) candidates.push(node.return);
    for (const [k, v] of Object.entries(node)) {
        if (/result$/i.test(k) && v && typeof v === 'object') candidates.push(v);
    }
    if (node.data !== undefined) candidates.push(node.data);

    for (const c of candidates) {
        if (Array.isArray(c)) {
            for (const el of c) {
                const hit = findResourceDeep(el);
                if (hit) return hit;
            }
        } else {
            const hit = findResourceDeep(c);
            if (hit) return hit;
        }
    }

    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
            const hit = findResourceDeep(v);
            if (hit) return hit;
        }
    }
    return undefined;
}

// ============================================================================
// ARRAY PICKERS
// ============================================================================

function pickResourceArray(ret: any): any[] {
    const out: any[] = [];

    const data = ret?.data;
    if (Array.isArray(data)) {
        for (const d of data) {
            const maybe = findResourceDeep(d);
            if (maybe) out.push(maybe);
        }
    } else if (data && typeof data === 'object') {
        const maybe = findResourceDeep(data);
        if (maybe) out.push(maybe);
    }

    const resources = ret?.Resources ?? ret?.resources;
    if (Array.isArray(resources)) {
        for (const r of resources) {
            const maybe = findResourceDeep(r);
            if (maybe) out.push(maybe);
        }
    }

    if (out.length === 0) {
        const single = findResourceDeep(ret);
        if (single) out.push(single);
    }

    return out;
}

// ============================================================================
// MAIN PARSERS
// ============================================================================

export function parseResourceResult(xml: string): ResultBase & { resource?: ResourceDTO } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const node = findResourceDeep(ret) ?? findResourceDeep(body);
    const resource = node ? coerceResource(node) : undefined;
    return { ...base, resource };
}

export function parseResourceListResult(xml: string): ResultBase & { resources: ResourceDTO[] } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const nodes = pickResourceArray(ret);
    const resources = nodes.map(coerceResource);
    return { ...base, resources };
}
