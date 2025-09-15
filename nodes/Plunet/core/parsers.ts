import {
    asNum,
    asStr,
    toArray,
    getBodyRoot,
    getReturnNode,
    extractResultBase,
    type ResultBase,
} from './xml';

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
 *  DTO types (minimal but useful). Extend as needed.
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
    statusId?: number;        // original numeric id (optional)
    accountID?: number;
    projectManagerID?: number;
    accountManagerID?: number;
    formOfAddress?: number;
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

/** ─────────────────────────────────────────────────────────────────────────────
 *  Helpers
 *  ─────────────────────────────────────────────────────────────────────────── */

function firstNonEmptyKey(obj: Record<string, any>, keys: string[]) {
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

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
    c.formOfAddress = asNum(firstNonEmptyKey(raw, ['formOfAddress', 'FormOfAddress']));
    c.academicTitle = asStr(firstNonEmptyKey(raw, ['academicTitle', 'AcademicTitle']));
    c.opening = asStr(firstNonEmptyKey(raw, ['opening', 'Opening']));
    c.skypeID = asStr(firstNonEmptyKey(raw, ['skypeID', 'SkypeID']));
    c.costCenter = asStr(firstNonEmptyKey(raw, ['costCenter', 'CostCenter']));
    c.dateOfInitialContact = asStr(firstNonEmptyKey(raw, ['dateOfInitialContact', 'DateOfInitialContact']));
    c.sourceOfContact = asStr(firstNonEmptyKey(raw, ['sourceOfContact', 'SourceOfContact']));
    c.dossier = asStr(firstNonEmptyKey(raw, ['dossier', 'Dossier']));

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

    // Direct named container
    if (node.Customer && typeof node.Customer === 'object') return node.Customer;
    if (node.customer && typeof node.customer === 'object') return node.customer;

    // If this very node looks like a customer, take it
    if (isLikelyCustomer(node)) return node;

    // Common wrappers: return, Result/*Result, data (object or array)
    const candidates: any[] = [];
    if (node.return) candidates.push(node.return);
    // pick any key that ends with 'Result' (CustomerResult, StringResult, etc.)
    for (const [k, v] of Object.entries(node)) {
        if (/result$/i.test(k) && v && typeof v === 'object') candidates.push(v);
    }
    if (node.data !== undefined) candidates.push(node.data);

    // If data is array, inspect elements
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

    // Explore all object properties as a last resort
    for (const v of Object.values(node)) {
        if (v && typeof v === 'object') {
            const hit = findCustomerDeep(v);
            if (hit) return hit;
        }
    }

    return undefined;
}

function pickCustomerArray(ret: any): any[] {
    // Typical list shapes
    const out: any[] = [];

    // 1) <data> can be array or object
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

    // 2) Direct plural containers
    const customers = ret?.Customers ?? ret?.customers;
    if (Array.isArray(customers)) {
        for (const c of customers) {
            const maybe = findCustomerDeep(c);
            if (maybe) out.push(maybe);
        }
    }

    // 3) Fallback: a single customer somewhere inside ret
    if (out.length === 0) {
        const single = findCustomerDeep(ret);
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

    // Be generous in what we accept
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
