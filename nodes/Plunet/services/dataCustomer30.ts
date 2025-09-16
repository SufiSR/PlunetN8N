import {
    IExecuteFunctions,
    IDataObject,
    INodeProperties,
    INodePropertyOptions,
    NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { ensureSession } from '../core/session';
import {
    extractResultBase,
    extractStatusMessage,
    extractSoapFault,
    parseStringResult,
    parseIntegerResult,
    parseIntegerArrayResult,
    parseVoidResult,
} from '../core/xml';
import {
    parseCustomerResult,
    parseCustomerListResult,
    parsePaymentInfoResult,
    parseAccountResult,
    parseWorkflowListResult,
} from '../core/parsers';

const RESOURCE = 'DataCustomer30';

/** ─────────────────────────────────────────────────────────────────────────────
 *  CustomerStatus enum (LOCAL copy)
 *  ─────────────────────────────────────────────────────────────────────────── */
type CustomerStatusName =
    | 'ACTIVE'
    | 'NOT_ACTIVE'
    | 'CONTACTED'
    | 'NEW'
    | 'BLOCKED'
    | 'AQUISITION_ADDRESS'
    | 'NEW_AUTO'
    | 'DELETION_REQUESTED';

const CustomerStatusIdByName: Record<CustomerStatusName, number> = {
    ACTIVE: 1,
    NOT_ACTIVE: 2,
    CONTACTED: 3,
    NEW: 4,
    BLOCKED: 5,
    AQUISITION_ADDRESS: 6,
    NEW_AUTO: 7,
    DELETION_REQUESTED: 8,
};
const CustomerStatusNameById: Record<number, CustomerStatusName> = Object.fromEntries(
    Object.entries(CustomerStatusIdByName).map(([k, v]) => [v, k as CustomerStatusName]),
) as Record<number, CustomerStatusName>;

function idToCustomerStatusName(id?: number | null): CustomerStatusName | undefined {
    if (id == null) return undefined;
    return CustomerStatusNameById[id];
}
function prettyStatusLabel(name: CustomerStatusName): string {
    switch (name) {
        case 'NOT_ACTIVE': return 'Not active';
        case 'AQUISITION_ADDRESS': return 'Acquisition address';
        case 'NEW_AUTO': return 'New (auto)';
        case 'DELETION_REQUESTED': return 'Deletion requested';
        default: return name.charAt(0) + name.slice(1).toLowerCase(); // Active, Contacted, New, Blocked
    }
}
const CustomerStatusOptions: INodePropertyOptions[] = (Object.keys(CustomerStatusIdByName) as CustomerStatusName[])
    .sort((a, b) => CustomerStatusIdByName[a] - CustomerStatusIdByName[b])
    .map((name) => ({
        name: `${prettyStatusLabel(name)} (${CustomerStatusIdByName[name]})`,
        value: CustomerStatusIdByName[name],
        description: name,
    }));

/** ─────────────────────────────────────────────────────────────────────────────
 *  Operation → parameters (order matters). UUID is auto-included.
 *  ─────────────────────────────────────────────────────────────────────────── */
const PARAM_ORDER: Record<string, string[]> = {
    // --- getters / finders ---
    delete: ['customerID'],
    getAcademicTitle: ['customerID'],
    getAccount: ['AccountID'],
    getAccountManagerID: ['customerID'],
    getAllCustomerObjects: ['Status'],
    // getAllCustomerObjects2: removed
    getAvailableAccountIDList: [],
    getAvailablePaymentMethodList: [],
    getAvailableWorkflows: ['customerID'],
    getCreatedByResourceID: ['customerID'],
    getCurrency: ['customerID'],
    getCustomerObject: ['customerID'],
    getDateOfInitialContact: ['customerID'],
    getDossier: ['customerID'],
    getEmail: ['customerID'],
    getExternalID: ['customerID'],
    getFax: ['customerID'],
    getFormOfAddress: ['customerID'],
    getFullName: ['customerID'],
    getMobilePhone: ['customerID'],
    getName1: ['customerID'],
    getName2: ['customerID'],
    getOpening: ['customerID'],
    getPaymentInformation: ['customerID'],
    getPaymentMethodDescription: ['paymentMethodID', 'systemLanguageCode'],
    getPhone: ['customerID'],
    getProjectManagerID: ['customerID'],
    getSkypeID: ['customerID'],
    getSourceOfContact: ['customerID'],
    getStatus: ['customerID'],
    getWebsite: ['customerID'],

    // --- create/update (insert removed) ---
    insert2: [
        'academicTitle', 'costCenter', 'currency', 'customerID', 'email',
        'externalID', 'fax', 'formOfAddress', 'fullName', 'mobilePhone',
        'name1', 'name2', 'opening', 'phone', 'skypeID', 'status', 'userId', 'website',
    ],
    update: [
        'academicTitle', 'costCenter', 'currency', 'customerID', 'email',
        'externalID', 'fax', 'formOfAddress', 'fullName',
        'mobilePhone', 'name1', 'name2', 'opening', 'phone', 'skypeID',
        'status', 'userId', 'website', 'enableNullOrEmptyValues',
    ],

    search: ['SearchFilter'],
    seekByExternalID: ['ExternalID'],

    // --- setters normalized: VALUE first, then customerID (and correct casing) ---
    setAcademicTitle: ['academicTitle', 'customerID'],
    setAccountManagerID: ['resourceID', 'customerID'],
    setDateOfInitialContact: ['dateInitialContact', 'customerID'],
    setDossier: ['dossier', 'customerID'],
    setEmail: ['EMail', 'customerID'],            // EMail per API
    setExternalID: ['ExternalID', 'customerID'],
    setFax: ['Fax', 'customerID'],
    setFormOfAddress: ['FormOfAddress', 'customerID'],
    setMobilePhone: ['PhoneNumber', 'customerID'],// PhoneNumber per API
    setName1: ['Name', 'customerID'],
    setName2: ['Name', 'customerID'],
    setOpening: ['Opening', 'customerID'],
    setPaymentInformation: [
        // For this one the API expects customerID first; keep as-is unless your env needs otherwise.
        'customerID', 'accountHolder', 'accountID', 'BIC', 'contractNumber',
        'debitAccount', 'IBAN', 'paymentMethodID', 'preselectedTaxID', 'salesTaxID',
    ],
    setPhone: ['PhoneNumber', 'customerID'],      // PhoneNumber per API
    setProjectManagerID: ['resourceID', 'customerID'],
    setSkypeID: ['skypeID', 'customerID'],
    setSourceOfContact: ['sourceOfContact', 'customerID'],
    setStatus: ['Status', 'customerID'],          // Status (capital S) before customerID
    setWebsite: ['website', 'customerID'],
};

/** Return types (so we can dispatch to typed parsers) */
type R =
    | 'Void' | 'String' | 'Integer' | 'IntegerArray'
    | 'Customer' | 'CustomerList' | 'PaymentInfo' | 'Account' | 'WorkflowList';

const RETURN_TYPE: Record<string, R> = {
    delete: 'Void',
    getAcademicTitle: 'String',
    getAccount: 'Account',
    getAccountManagerID: 'Integer',
    getAllCustomerObjects: 'CustomerList',
    // getAllCustomerObjects2: removed
    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getAvailableWorkflows: 'WorkflowList',
    getCreatedByResourceID: 'Integer',
    getCurrency: 'String',
    getCustomerObject: 'Customer',
    getDateOfInitialContact: 'String',
    getDossier: 'String',
    getEmail: 'String',
    getExternalID: 'String',
    getFax: 'String',
    getFormOfAddress: 'Integer',
    getFullName: 'String',
    getMobilePhone: 'String',
    getName1: 'String',
    getName2: 'String',
    getOpening: 'String',
    getPaymentInformation: 'PaymentInfo',
    getPaymentMethodDescription: 'String',
    getPhone: 'String',
    getProjectManagerID: 'Integer',
    getSkypeID: 'String',
    getSourceOfContact: 'String',
    getStatus: 'Integer',
    getWebsite: 'String',
    // insert: removed
    insert2: 'Integer',
    update: 'Void',
    search: 'IntegerArray',
    seekByExternalID: 'Integer',
    setAcademicTitle: 'Void',
    setAccountManagerID: 'Void',
    setDateOfInitialContact: 'Void',
    setDossier: 'Void',
    setEmail: 'Void',
    setExternalID: 'Void',
    setFax: 'Void',
    setFormOfAddress: 'Void',
    setMobilePhone: 'Void',
    setName1: 'Void',
    setName2: 'Void',
    setOpening: 'Void',
    setPaymentInformation: 'Void',
    setPhone: 'Void',
    setProjectManagerID: 'Void',
    setSkypeID: 'Void',
    setSourceOfContact: 'Void',
    setStatus: 'Void',
    setWebsite: 'Void',
};

/** ─────────────────────────────────────────────────────────────────────────────
 *  UI wiring
 *  ─────────────────────────────────────────────────────────────────────────── */
function labelize(op: string): string {
    if (op.includes('_')) return op.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    return op.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/\b\w/g, (m) => m.toUpperCase());
}
function asNonEmpty<T>(arr: T[], err = 'Expected non-empty array'): [T, ...T[]] {
    if (arr.length === 0) throw new Error(err);
    return arr as [T, ...T[]];
}
const isStatusParam = (p: string) => p.toLowerCase() === 'status';
const isEnableEmptyParam = (op: string, p: string) =>
    op === 'update' && p.toLowerCase() === 'enablenulloremptyvalues';

// Friendly labels for the UI without changing internal op values
const FRIENDLY_LABEL: Record<string, string> = {
    insert2: 'Create Customer',
    update: 'Update Customer',
    seekByExternalID: 'Search by External ID',
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    Object.keys(PARAM_ORDER)
        .sort()
        .map((op) => {
            const label = FRIENDLY_LABEL[op] ?? labelize(op);
            return {
                name: label,
                value: op,
                action: label,
                description: `Call ${label} on ${RESOURCE}`,
            };
        }),
);

// Make every `status`/`Status` param a dropdown,
// and `update.enableNullOrEmptyValues` a boolean with a clear label.
const extraProperties: INodeProperties[] = Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
    params.map<INodeProperties>((p) => {
        // 1) Status → dropdown
        if (isStatusParam(p)) {
            return {
                displayName: 'Status',
                name: p,
                type: 'options',
                options: CustomerStatusOptions,
                default: 1, // ACTIVE
                description: `${p} parameter for ${op} (CustomerStatus enum)`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }

        // 2) enableNullOrEmptyValues → boolean
        if (isEnableEmptyParam(op, p)) {
            return {
                displayName: 'Overwrite with Empty Values',
                name: p, // must remain "enableNullOrEmptyValues" for SOAP tag
                type: 'boolean',
                default: false,
                description:
                    'If enabled, empty inputs overwrite existing values in Plunet. If disabled, empty inputs are ignored and existing values are preserved.',
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }

        // 3) default: plain string
        return {
            displayName: p,
            name: p,
            type: 'string',
            default: '',
            description: `${p} parameter for ${op}`,
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
        };
    }),
);

/** ─────────────────────────────────────────────────────────────────────────────
 *  SOAP helpers and execution
 *  ─────────────────────────────────────────────────────────────────────────── */
function buildEnvelope(op: string, childrenXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:${op}>
${childrenXml.split('\n').map((l) => (l ? '      ' + l : l)).join('\n')}
    </api:${op}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Golden rule enforcement:
 *  - SOAP Fault → throw
 *  - statusMessage present and !== "OK" → throw
 *  - statusCode present and !== 0 → throw
 */
function throwIfSoapOrStatusError(
    ctx: IExecuteFunctions,
    itemIndex: number,
    xml: string,
    op?: string,
) {
    const fault = extractSoapFault(xml);
    if (fault) {
        const prefix = op ? `${op}: ` : '';
        const code = fault.code ? ` [${fault.code}]` : '';
        throw new NodeOperationError(ctx.getNode(), `${prefix}SOAP Fault: ${fault.message}${code}`, { itemIndex });
    }

    const base = extractResultBase(xml);
    if (base.statusMessage && base.statusMessage !== 'OK') {
        const prefix = op ? `${op}: ` : '';
        const code = base.statusCode !== undefined ? ` [${base.statusCode}]` : '';
        throw new NodeOperationError(ctx.getNode(), `${prefix}${base.statusMessage}${code}`, { itemIndex });
    }
    if (base.statusCode !== undefined && base.statusCode !== 0) {
        const prefix = op ? `${op}: ` : '';
        const msg = base.statusMessage || 'Plunet returned a non-zero status code';
        throw new NodeOperationError(ctx.getNode(), `${prefix}${msg} [${base.statusCode}]`, { itemIndex });
    }
}

async function runOp(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
    op: string,
    paramNames: string[],
): Promise<IDataObject> {
    // UUID is always pulled from storage / auto-login (note the itemIndex for error context)
    const uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);

    const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];
    for (const name of paramNames) {
        const valRaw = ctx.getNodeParameter(name, itemIndex, '') as string | number | boolean;
        const val =
            typeof valRaw === 'string'
                ? valRaw.trim()
                : typeof valRaw === 'number'
                    ? String(valRaw)
                    : typeof valRaw === 'boolean'
                        ? (valRaw ? 'true' : 'false')
                        : '';
        if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }

    const env11 = buildEnvelope(op, parts.join('\n'));
    const soapAction = `http://API.Integration/${op}`;
    const body = await sendSoapWithFallback(ctx, url, env11, soapAction, timeoutMs);

    // Enforce error rules
    throwIfSoapOrStatusError(ctx, itemIndex, body, op);

    // Dispatch to proper parser / shape
    const rt = RETURN_TYPE[op] as R | undefined;
    let payload: IDataObject;

    switch (rt) {
        case 'Customer': {
            const r = parseCustomerResult(body);
            payload = { customer: r.customer, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'CustomerList': {
            const r = parseCustomerListResult(body);
            payload = { customers: r.customers, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'PaymentInfo': {
            const r = parsePaymentInfoResult(body);
            payload = { paymentInfo: r.paymentInfo, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Account': {
            const r = parseAccountResult(body);
            payload = { account: r.account, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'WorkflowList': {
            const r = parseWorkflowListResult(body);
            payload = { workflows: r.workflows, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'String': {
            const r = parseStringResult(body);
            payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Integer': {
            const r = parseIntegerResult(body);
            if (op === 'getStatus') {
                const name = idToCustomerStatusName(r.value ?? undefined);
                payload = {
                    status: name ?? null,            // enum name like "ACTIVE"
                    statusId: r.value ?? null,       // numeric id
                    statusMessage: r.statusMessage,
                    statusCode: r.statusCode,
                };
            } else {
                payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
            }
            break;
        }
        case 'IntegerArray': {
            const r = parseIntegerArrayResult(body);
            payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Void': {
            const r = parseVoidResult(body);
            // Additional guard so setters can't silently pass
            if (!r.ok) {
                const msg = r.statusMessage || 'Operation failed';
                throw new NodeOperationError(
                    ctx.getNode(),
                    `${op}: ${msg}${r.statusCode !== undefined ? ` [${r.statusCode}]` : ''}`,
                    { itemIndex },
                );
            }
            payload = { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        default: {
            // Fallback: still give status + raw
            payload = { statusMessage: extractStatusMessage(body), rawResponse: body };
        }
    }

    return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
}

/** ─────────────────────────────────────────────────────────────────────────────
 *  Service export
 *  ─────────────────────────────────────────────────────────────────────────── */
export const DataCustomer30Service: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Customers (DataCustomer30)',
    resourceDescription: 'Customer-related endpoints',
    endpoint: 'DataCustomer30',
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramNames = PARAM_ORDER[operation];
        if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
        return runOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation, paramNames);
    },
};
