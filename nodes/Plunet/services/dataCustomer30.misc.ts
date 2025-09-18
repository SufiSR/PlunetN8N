import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { ensureSession } from '../core/session';
import {
    extractResultBase, extractStatusMessage, extractSoapFault,
    parseStringResult, parseIntegerResult, parseIntegerArrayResult, parseVoidResult,
} from '../core/xml';
import {
    parseCustomerResult, parseCustomerListResult, parsePaymentInfoResult, parseAccountResult, parseWorkflowListResult,
} from '../core/parsers';
import { TaxTypeOptions, idToTaxTypeName } from '../enums/tax-type';

const RESOURCE = 'DataCustomer30Misc';
const ENDPOINT = 'DataCustomer30';

/** ─ CustomerStatus (local) ─ */
type CustomerStatusName =
    | 'ACTIVE' | 'NOT_ACTIVE' | 'CONTACTED' | 'NEW' | 'BLOCKED'
    | 'AQUISITION_ADDRESS' | 'NEW_AUTO' | 'DELETION_REQUESTED';
const CustomerStatusIdByName: Record<CustomerStatusName, number> = {
    ACTIVE: 1, NOT_ACTIVE: 2, CONTACTED: 3, NEW: 4, BLOCKED: 5,
    AQUISITION_ADDRESS: 6, NEW_AUTO: 7, DELETION_REQUESTED: 8,
};
const CustomerStatusOptions: INodePropertyOptions[] =
    (Object.keys(CustomerStatusIdByName) as CustomerStatusName[])
        .sort((a, b) => CustomerStatusIdByName[a] - CustomerStatusIdByName[b])
        .map((name) => ({
            name: `${name.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase())} (${CustomerStatusIdByName[name]})`,
            value: CustomerStatusIdByName[name],
            description: name,
        }));

/** ─ Ops kept here: everything except the five “core” ones ─ */
const PARAM_ORDER: Record<string, string[]> = {
    // finders/lists
    seekByExternalID: ['ExternalID'],
    getAllCustomerObjects: ['Status'],
    getAvailableAccountIDList: [],
    getAvailablePaymentMethodList: [],
    getAvailableWorkflows: ['customerID'],
    getAccount: ['AccountID'],
    getPaymentInformation: ['customerID'],
    getPaymentMethodDescription: ['paymentMethodID', 'systemLanguageCode'],
    getCreatedByResourceID: ['customerID'],
    getProjectManagerID: ['customerID'],
    getSourceOfContact: ['customerID'],
    getDateOfInitialContact: ['customerID'],
    getDossier: ['customerID'],

    // setters
    setPaymentInformation: [
        'customerID','accountHolder','accountID','BIC','contractNumber',
        'debitAccount','IBAN','paymentMethodID','preselectedTaxID','salesTaxID',
    ],
    setProjectManagerID: ['resourceID', 'customerID'],
    setSourceOfContact: ['sourceOfContact', 'customerID'],
    setDateOfInitialContact: ['dateInitialContact', 'customerID'],
    setDossier: ['dossier', 'customerID'],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Customer'|'CustomerList'|'PaymentInfo'|'Account'|'WorkflowList';
const RETURN_TYPE: Record<string, R> = {
    seekByExternalID: 'Integer',
    getAllCustomerObjects: 'CustomerList',
    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getAvailableWorkflows: 'WorkflowList',
    getAccount: 'Account',
    getPaymentInformation: 'PaymentInfo',
    getPaymentMethodDescription: 'String',
    getCreatedByResourceID: 'Integer',
    getProjectManagerID: 'Integer',
    getSourceOfContact: 'String',
    getDateOfInitialContact: 'String',
    getDossier: 'String',
    setPaymentInformation: 'Void',
    setProjectManagerID: 'Void',
    setSourceOfContact: 'Void',
    setDateOfInitialContact: 'Void',
    setDossier: 'Void',
};

/** ─ UI ─ */
function labelize(op: string) {
    if (op.includes('_')) return op.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
    return op.replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/\b\w/g,(m)=>m.toUpperCase());
}
function asNonEmpty<T>(arr: T[]): [T,...T[]] { if(!arr.length) throw new Error('Expected non-empty'); return arr as any; }

const FRIENDLY_LABEL: Record<string,string> = {
    seekByExternalID: 'Search by External ID',
    getAllCustomerObjects: 'Get All Customers (By Status))',
    getAvailableAccountIDList: 'Get Available Account IDs',
    getAvailablePaymentMethodList: 'Get Available Payment Methods',
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    Object.keys(PARAM_ORDER).sort().map((op) => {
        const label = FRIENDLY_LABEL[op] ?? labelize(op);
        return { name: label, value: op, action: label, description: `Call ${label} on ${ENDPOINT}` };
    }),
);

const extraProperties: INodeProperties[] =
    Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params.map<INodeProperties>((p) => {
            if (p.toLowerCase() === 'status') {
                return {
                    displayName: 'Status',
                    name: p,
                    type: 'options',
                    options: CustomerStatusOptions,
                    default: 1,
                    description: `${p} parameter for ${op} (CustomerStatus enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (p === 'preselectedTaxID') {
                return {
                    displayName: 'Preselected Tax',
                    name: p,
                    type: 'options',
                    options: TaxTypeOptions,
                    default: 0,
                    description: `${p} parameter for ${op} (TaxType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
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

/** ─ SOAP + runner ─ */
function buildEnvelope(op: string, childrenXml: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/><soapenv:Body><api:${op}>
${childrenXml.split('\n').map((l)=>l?`      ${l}`:l).join('\n')}
  </api:${op}></soapenv:Body></soapenv:Envelope>`;
}
function throwIfSoapOrStatusError(ctx: IExecuteFunctions, itemIndex: number, xml: string, op?: string) {
    const fault = extractSoapFault(xml);
    if (fault) throw new NodeOperationError(ctx.getNode(), `${op?op+': ':''}SOAP Fault: ${fault.message}${fault.code?` [${fault.code}]`:''}`, { itemIndex });
    const base = extractResultBase(xml);
    if (base.statusMessage && base.statusMessage !== 'OK')
        throw new NodeOperationError(ctx.getNode(), `${op?op+': ':''}${base.statusMessage}${base.statusCode!==undefined?` [${base.statusCode}]`:''}`, { itemIndex });
    if (base.statusCode !== undefined && base.statusCode !== 0)
        throw new NodeOperationError(ctx.getNode(), `${op?op+': ':''}${base.statusMessage || 'Plunet returned a non-zero status code'} [${base.statusCode}]`, { itemIndex });
}

const NUMERIC_BOOLEAN_PARAMS = new Set(['enableNullOrEmptyValues']);

function toSoapParamValue(raw: unknown, paramName: string): string {
    if (raw == null) return '';               // guard null/undefined
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'boolean') {
        return NUMERIC_BOOLEAN_PARAMS.has(paramName)
            ? (raw ? '1' : '0')                   // numeric boolean
            : (raw ? 'true' : 'false');           // normal boolean
    }
    return String(raw);                        // fallback
}

async function runOp(
    ctx: IExecuteFunctions, creds: Creds, url: string, baseUrl: string, timeoutMs: number,
    itemIndex: number, op: string, paramNames: string[],
): Promise<IDataObject> {
    const uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);
    const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];

    for (const name of paramNames) {
        const raw = ctx.getNodeParameter(name, itemIndex, '') as string | number | boolean;
        const val = toSoapParamValue(raw, name);
        if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }
    const env11 = buildEnvelope(op, parts.join('\n'));
    const body = await sendSoapWithFallback(ctx, url, env11, `http://API.Integration/${op}`, timeoutMs);

    throwIfSoapOrStatusError(ctx, itemIndex, body, op);

    const rt = RETURN_TYPE[op] as R|undefined;
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
            // optional: add friendly name for preselectedTaxID
            const idNum = r.paymentInfo?.preselectedTaxID != null ? Number(r.paymentInfo.preselectedTaxID) : undefined;
            const taxName = Number.isFinite(idNum as number) ? idToTaxTypeName(idNum as number) : undefined;
            const paymentInfo = r.paymentInfo ? { ...r.paymentInfo, ...(taxName ? { preselectedTaxName: taxName } : {}) } : undefined;
            payload = { paymentInfo, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
                payload = { statusId: r.value ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
            if (!r.ok) throw new NodeOperationError(ctx.getNode(), `${op}: ${r.statusMessage || 'Operation failed'}${r.statusCode!==undefined?` [${r.statusCode}]`:''}`, { itemIndex });
            payload = { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        default: {
            payload = { statusMessage: extractStatusMessage(body), rawResponse: body };
        }
    }
    return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
}

/** ─ Service export ─ */
export const DataCustomer30MiscService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Customers (Fields/Misc)',
    resourceDescription: 'Non-core operations for DataCustomer30',
    endpoint: ENDPOINT,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramNames = PARAM_ORDER[operation];
        if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
        return runOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation, paramNames);
    },
};
