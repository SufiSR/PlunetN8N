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
    parseResourceResult, parseResourceListResult, parsePricelistListResult, parsePaymentInfoResult,
} from '../core/parsers';

import { ResourceStatusOptions, idToResourceStatusName } from '../enums/resource-status';
import { ResourceTypeOptions, idToResourceTypeName } from '../enums/resource-type';
import { FormOfAddressOptions, idToFormOfAddressName } from '../enums/form-of-address';
import { TaxTypeOptions, idToTaxTypeName } from '../enums/tax-type';

const RESOURCE = 'DataResource30Misc';
const ENDPOINT = 'DataResource30';

/** WorkingStatus (1=INTERNAL, 2=EXTERNAL) */
const WorkingStatusOptions: INodePropertyOptions[] = [
    { name: 'Internal (1)', value: 1, description: 'INTERNAL' },
    { name: 'External (2)', value: 2, description: 'EXTERNAL' },
];

/** Operations → parameters */
const PARAM_ORDER: Record<string,string[]> = {
    // lookups / search
    seekByExternalID: ['ExternalID'],

    // pricelists
    getPricelists: ['resourceID'],
    getPricelists2: ['sourcelanguage','targetlanguage','resourceID'],

    // payment info
    getPaymentInformation: ['resourceID'],
    setPaymentInformation: [
        'resourceID','accountHolder','accountID','BIC','contractNumber',
        'debitAccount','IBAN','paymentMethodID','preselectedTaxID','salesTaxID',
    ],
    getAvailableAccountIDList: [],
    getAvailablePaymentMethodList: [],
    getPaymentMethodDescription: ['paymentMethodID','systemLanguageCode'],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Resource'|'ResourceList'|'PricelistList'|'PaymentInfo';
const RETURN_TYPE: Record<string,R> = {
    seekByExternalID: 'Integer',
    getPricelists: 'PricelistList',
    getPricelists2: 'PricelistList',
    getPaymentInformation: 'PaymentInfo',
    setPaymentInformation: 'Void',
    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getPaymentMethodDescription: 'String',
};

/** UI */
function labelize(op: string) {
    if (op.includes('_')) return op.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
    return op.replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/\b\w/g,(m)=>m.toUpperCase());
}
function asNonEmpty<T>(arr: T[]): [T,...T[]] { if(!arr.length) throw new Error('Expected non-empty'); return arr as any; }

const FRIENDLY_LABEL: Record<string,string> = {
    seekByExternalID: 'Search by External ID',
    getPricelists2: 'Get Pricelists (Language Pair)',
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    Object.keys(PARAM_ORDER).sort().map((op) => {
        const label = FRIENDLY_LABEL[op] ?? labelize(op);
        return { name: label, value: op, action: label, description: `Call ${label} on ${ENDPOINT}` };
    }),
);

// enum detectors
const isStatusParam = (p: string) => p === 'Status' || p === 'status';
const isWorkingStatusParam = (p: string) => p === 'WorkingStatus' || p === 'workingStatus';
const isResourceTypeParam = (p: string) => p === 'ResourceType' || p === 'resourceType';
const isFormOfAddressParam = (p: string) => p === 'FormOfAddress' || p === 'formOfAddress';

const extraProperties: INodeProperties[] =
    Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params.map<INodeProperties>((p) => {
            if (isStatusParam(p)) {
                return {
                    displayName: 'Status',
                    name: p, type: 'options', options: ResourceStatusOptions, default: 1,
                    description: `${p} parameter for ${op} (ResourceStatus enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (isWorkingStatusParam(p)) {
                return {
                    displayName: 'Working Status',
                    name: p, type: 'options', options: WorkingStatusOptions, default: 1,
                    description: `${p} parameter for ${op} (1=INTERNAL, 2=EXTERNAL)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (isResourceTypeParam(p)) {
                return {
                    displayName: 'Resource Type',
                    name: p, type: 'options', options: ResourceTypeOptions, default: 0,
                    description: `${p} parameter for ${op} (ResourceType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (isFormOfAddressParam(p)) {
                return {
                    displayName: 'Form of Address',
                    name: p, type: 'options', options: FormOfAddressOptions, default: 3,
                    description: `${p} parameter for ${op} (FormOfAddressType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (p === 'preselectedTaxID') {
                return {
                    displayName: 'Preselected Tax',
                    name: p, type: 'options', options: TaxTypeOptions, default: 0,
                    description: `${p} parameter for ${op} (TaxType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            return {
                displayName: p, name: p, type: 'string', default: '',
                description: `${p} parameter for ${op}`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }),
    );

/** SOAP */
function buildEnvelope(op: string, childrenXml: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/><soapenv:Body>
    <api:${op}>
${childrenXml.split('\n').map((l)=>l?`      ${l}`:l).join('\n')}
    </api:${op}>
  </soapenv:Body>
</soapenv:Envelope>`;
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

async function runOp(
    ctx: IExecuteFunctions, creds: Creds, url: string, baseUrl: string, timeoutMs: number,
    itemIndex: number, op: string, paramNames: string[],
): Promise<IDataObject> {
    const uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);
    const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];

    for (const name of paramNames) {
        const raw = ctx.getNodeParameter(name, itemIndex, '') as string|number|boolean;
        const val = typeof raw==='string' ? raw.trim() : typeof raw==='number' ? String(raw) : raw ? 'true' : 'false';
        if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }

    const env11 = buildEnvelope(op, parts.join('\n'));
    const body = await sendSoapWithFallback(ctx, url, env11, `http://API.Integration/${op}`, timeoutMs);

    throwIfSoapOrStatusError(ctx, itemIndex, body, op);

    const rt = RETURN_TYPE[op] as R|undefined;
    let payload: IDataObject;

    switch (rt) {
        case 'Resource': {
            const r = parseResourceResult(body);
            payload = { resource: r.resource, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'ResourceList': {
            const r = parseResourceListResult(body);
            payload = { resources: r.resources, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'PricelistList': {
            const r = parsePricelistListResult(body);
            payload = { pricelists: r.pricelists, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'PaymentInfo': {
            const r = parsePaymentInfoResult(body);
            const idNum = r.paymentInfo?.preselectedTaxID != null ? Number(r.paymentInfo.preselectedTaxID) : undefined;
            const taxName = Number.isFinite(idNum as number) ? idToTaxTypeName(idNum as number) : undefined;
            const paymentInfo = r.paymentInfo ? { ...r.paymentInfo, ...(taxName ? { preselectedTaxName: taxName } : {}) } : undefined;
            payload = { paymentInfo, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'String': {
            const r = parseStringResult(body);
            payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Integer': {
            const r = parseIntegerResult(body);
            if (op === 'getWorkingStatus') {
                const name = r.value === 1 ? 'INTERNAL' : r.value === 2 ? 'EXTERNAL' : undefined;
                payload = { workingStatusId: r.value ?? null, workingStatus: name ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
            } else if (op === 'getStatus') {
                const name = idToResourceStatusName(r.value ?? undefined);
                payload = { statusId: r.value ?? null, status: name ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
            } else if (op === 'getResourceType') {
                const name = idToResourceTypeName(r.value ?? undefined);
                payload = { resourceTypeId: r.value ?? null, resourceType: name ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
            } else if (op === 'getFormOfAddress') {
                const name = idToFormOfAddressName(r.value ?? undefined);
                payload = { formOfAddressId: r.value ?? null, formOfAddress: name ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
            if (!r.ok) {
                const msg = r.statusMessage || 'Operation failed';
                throw new NodeOperationError(ctx.getNode(), `${op}: ${msg}${r.statusCode!==undefined?` [${r.statusCode}]`:''}`, { itemIndex });
            }
            payload = { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        default: {
            payload = { statusMessage: extractStatusMessage(body), rawResponse: body };
        }
    }
    return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
}

/** Service export */
export const DataResource30MiscService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Resources (Fields/Misc)',
    resourceDescription: 'Non-core operations for DataResource30',
    endpoint: ENDPOINT,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramNames = PARAM_ORDER[operation];
        if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
        return runOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation, paramNames);
    },
};
