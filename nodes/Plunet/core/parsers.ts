import {
    asNum,
    asStr,
    toArray,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
} from './xml';
import type { FormOfAddressName } from '../enums/form-of-address';
import { idToFormOfAddressName } from '../enums/form-of-address';

/** ─────────────────────────────────────────────────────────────────────────────
 *  Customer status enum mapping (local to avoid extra imports)
 *  https://apidoc.plunet.com/latest/BM/API/SOAP/Enum/CustomerStatus.html
 *  ─────────────────────────────────────────────────────────────────────────── */
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
function idToCustomerStatusName(id?: number | null): string | undefined {
    if (id == null) return undefined;
    return CustomerStatusNameById[id];
}

/** ─────────────────────────────────────────────────────────────────────────────
 *  DTO types (extend as needed)
 *  ─────────────────────────────────────────────────────────────────────────── */
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
    status?: string;          // enum name (mapped)
    statusId?: number;        // numeric id
    accountID?: number;
    projectManagerID?: number;
    accountManagerID?: number;
    formOfAddress?: number;
    formOfAddressName?: FormOfAddressName;  // <-- NEW
    academicTitle?: string;
    opening?: string;
    skypeID?: string;
    costCenter?: string;
    dateOfInitialContact?: string;
    sourceOfContact?: string;
    dossier?: string;
    [k: string]: unknown;
};

export type PaymentInfoDTO = {
    accountHolder?: string;
    accountID?: string;
    BIC?: string;
    contractNumber?: string;
    debitAccount?: string;
    IBAN?: string;
    paymentMethodID?: number;
    preselectedTaxID?: string;
    salesTaxID?: string;
    [k: string]: unknown;
};

export type AccountDTO = {
    accountID?: number;
    costCenter?: string;
    currency?: string;
    [k: string]: unknown;
};

export type WorkflowDTO = {
    id?: number;
    name?: string;
    [k: string]: unknown;
};

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
    statusId?: number;          // numeric ResourceStatus
    workingStatusId?: number;   // numeric WorkingStatus (1=INTERNAL, 2=EXTERNAL)
    resourceTypeId?: number;    // numeric ResourceType
    supervisor1?: string;
    supervisor2?: string;
    [k: string]: unknown;
};

export type PricelistDTO = {
    adminPriceListId?: number;
    adminPriceListPartnerType?: number;
    currency?: string;
    isWithWhiteSpace?: boolean;
    memo?: string;
    pricelistNameEN?: string;
    resourcePriceListID?: number; // deprecated in docs, still present in some installs
    [k: string]: unknown;
};

/** ─────────────────────────────────────────────────────────────────────────────
 *  Generic helpers
 *  ─────────────────────────────────────────────────────────────────────────── */
function firstNonEmptyKey(obj: Record<string, any>, keys: string[]) {
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

/** ---------------------- CUSTOMERS ---------------------- */
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

    const foaRaw =
        firstNonEmptyKey(raw, ['formOfAddress', 'FormOfAddress', 'formOfAddressId', 'FormOfAddressId']);
    const foaId = asNum(foaRaw);
    if (foaId !== undefined) {
        c.formOfAddress = foaId;
        const foaName = idToFormOfAddressName(foaId);
        if (foaName) c.formOfAddressName = foaName;
    } else {
        // If server already returned a string name (rare), keep it
        const foaName = typeof foaRaw === 'string' ? foaRaw : undefined;
        if (foaName) c.formOfAddressName = foaName as FormOfAddressName;
    }

    // status mapping: keep both
    const statusId =
        asNum(firstNonEmptyKey(raw, ['status', 'Status'])) ??
        asNum(firstNonEmptyKey(raw, ['statusId', 'statusID', 'StatusID']));
    if (statusId !== undefined) {
        c.statusId = statusId;
        const name = idToCustomerStatusName(statusId);
        if (name) c.status = name;
    } else {
        // if it already came as string, keep it
        const s = asStr(firstNonEmptyKey(raw, ['status', 'Status']));
        if (s) c.status = s;
    }

    // copy any unknowns (non-destructive)
    for (const [k, v] of Object.entries(raw)) {
        if (!(k in c)) c[k] = v;
    }
    return c;
}

/** Deeply find the first object that looks like a Customer or is under a Customer key. */
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

/** ---------------------- RESOURCES ---------------------- */
function isLikelyResource(x: any): boolean {
    if (!x || typeof x !== 'object') return false;
    return (
        'resourceID' in x || 'ResourceID' in x ||
        'fullName' in x || 'FullName' in x ||
        'name1' in x || 'Name1' in x ||
        'email' in x || 'EMail' in x
    );
}

function coerceResource(raw: any): ResourceDTO {
    const r: ResourceDTO = {};
    r.resourceID = asNum(firstNonEmptyKey(raw, ['resourceID', 'ResourceID', 'id', 'ID']));
    r.externalID = asStr(firstNonEmptyKey(raw, ['externalID', 'ExternalID']));
    r.fullName  = asStr(firstNonEmptyKey(raw, ['fullName', 'FullName']));
    r.name1     = asStr(firstNonEmptyKey(raw, ['name1', 'Name1']));
    r.name2     = asStr(firstNonEmptyKey(raw, ['name2', 'Name2']));
    r.email     = asStr(firstNonEmptyKey(raw, ['email', 'EMail']));
    r.phone     = asStr(firstNonEmptyKey(raw, ['phone', 'Phone']));
    r.fax       = asStr(firstNonEmptyKey(raw, ['fax', 'Fax']));
    r.mobilePhone = asStr(firstNonEmptyKey(raw, ['mobilePhone', 'MobilePhone']));
    r.website   = asStr(firstNonEmptyKey(raw, ['website', 'Website']));
    r.currency  = asStr(firstNonEmptyKey(raw, ['currency', 'Currency']));
    r.costCenter = asStr(firstNonEmptyKey(raw, ['costCenter', 'CostCenter']));
    // r.formOfAddress = asNum(firstNonEmptyKey(raw, ['formOfAddress', 'FormOfAddress']));
    r.academicTitle = asStr(firstNonEmptyKey(raw, ['academicTitle', 'AcademicTitle']));
    r.opening   = asStr(firstNonEmptyKey(raw, ['opening', 'Opening']));
    r.skypeID   = asStr(firstNonEmptyKey(raw, ['skypeID', 'SkypeID']));
    r.userId    = asNum(firstNonEmptyKey(raw, ['userId', 'UserId']));

    // enum-like numeric fields (names kept as *Id to avoid implying string names)
    r.statusId        = asNum(firstNonEmptyKey(raw, ['status', 'Status', 'statusId', 'statusID', 'StatusID']));
    r.workingStatusId = asNum(firstNonEmptyKey(raw, ['workingStatus', 'WorkingStatus', 'workingStatusId', 'WorkingStatusID']));
    r.resourceTypeId  = asNum(firstNonEmptyKey(raw, ['resourceType', 'ResourceType', 'resourceTypeId', 'ResourceTypeID']));

    r.supervisor1 = asStr(firstNonEmptyKey(raw, ['supervisor1', 'Supervisor1']));
    r.supervisor2 = asStr(firstNonEmptyKey(raw, ['supervisor2', 'Supervisor2']));

    const foaRaw =
        firstNonEmptyKey(raw, ['formOfAddress', 'FormOfAddress', 'formOfAddressId', 'FormOfAddressId']);
    const foaId = asNum(foaRaw);
    if (foaId !== undefined) {
        r.formOfAddress = foaId;
        const foaName = idToFormOfAddressName(foaId);
        if (foaName) r.formOfAddressName = foaName;
    } else {
        // If server already returned a string name (rare), keep it
        const foaName = typeof foaRaw === 'string' ? foaRaw : undefined;
        if (foaName) r.formOfAddressName = foaName as FormOfAddressName;
    }

    for (const [k, v] of Object.entries(raw)) {
        if (!(k in r)) (r as any)[k] = v;
    }
    return r;
}

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

/** ---------------------- PRICELISTS ---------------------- */
function isLikelyPricelist(x: any): boolean {
    if (!x || typeof x !== 'object') return false;
    return (
        'adminPriceListId' in x || 'AdminPriceListId' in x ||
        'pricelistNameEN' in x || 'PricelistNameEN' in x ||
        'currency' in x || 'Currency' in x
    );
}
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

/** ─────────────────────────────────────────────────────────────────────────────
 *  Parsers
 *  ─────────────────────────────────────────────────────────────────────────── */
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

export function parsePaymentInfoResult(xml: string): ResultBase & { paymentInfo?: PaymentInfoDTO } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const node =
        ret?.PaymentInformation ??
        ret?.paymentInformation ??
        ret?.PaymentInfo ??
        ret?.paymentInfo ??
        ret?.data;

    if (!node || typeof node !== 'object') return { ...base, paymentInfo: undefined };

    const out: PaymentInfoDTO = {
        accountHolder: asStr(node.accountHolder ?? node.AccountHolder),
        accountID: asStr(node.accountID ?? node.AccountID),
        BIC: asStr(node.BIC),
        contractNumber: asStr(node.contractNumber ?? node.ContractNumber),
        debitAccount: asStr(node.debitAccount ?? node.DebitAccount),
        IBAN: asStr(node.IBAN),
        paymentMethodID: asNum(node.paymentMethodID ?? node.PaymentMethodID),
        preselectedTaxID: asStr(node.preselectedTaxID ?? node.PreselectedTaxID),
        salesTaxID: asStr(node.salesTaxID ?? node.SalesTaxID),
    };

    for (const [k, v] of Object.entries(node)) {
        if (!(k in out)) (out as any)[k] = v;
    }

    return { ...base, paymentInfo: out };
}

export function parseAccountResult(xml: string): ResultBase & { account?: AccountDTO } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const node = ret?.Account ?? ret?.account ?? ret?.data;
    if (!node || typeof node !== 'object') return { ...base, account: undefined };

    const out: AccountDTO = {
        accountID: asNum(node.accountID ?? node.AccountID),
        costCenter: asStr(node.costCenter ?? node.CostCenter),
        currency: asStr(node.currency ?? node.Currency),
    };

    for (const [k, v] of Object.entries(node)) {
        if (!(k in out)) (out as any)[k] = v;
    }

    return { ...base, account: out };
}

export function parseWorkflowListResult(xml: string): ResultBase & { workflows: WorkflowDTO[] } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    let items: any[] = [];

    const dataArr = toArray<any>(ret?.data);
    if (dataArr.length) {
        for (const d of dataArr) {
            const wf = d?.Workflow ?? d?.workflow ?? d;
            items.push(wf);
        }
    } else {
        const wfArr = toArray<any>(ret?.Workflow ?? ret?.workflow ?? []);
        if (wfArr.length) items = wfArr;
    }

    const workflows: WorkflowDTO[] = items.map((x) => ({
        id: asNum(x?.id ?? x?.ID),
        name: asStr(x?.name ?? x?.Name),
        ...x,
    }));

    return { ...base, workflows };
}

/** -------- Resources -------- */
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

/** -------- Pricelists -------- */
export function parsePricelistListResult(xml: string): ResultBase & { pricelists: PricelistDTO[] } {
    const base = extractResultBase(xml);
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    const nodes = pickPricelistArray(ret);
    const pricelists = nodes.map(coercePricelist);
    return { ...base, pricelists };
}