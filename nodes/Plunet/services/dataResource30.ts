// src/nodes/Plunet/services/dataResource30.ts
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
    asNum,
} from '../core/xml';
import {
    parseResourceResult,
    parseResourceListResult,
    parsePricelistListResult,
    parsePaymentInfoResult,
} from '../core/parsers';

// ✅ use your actual enum files/exports
import { idToResourceStatusName, ResourceStatusOptions } from '../enums/resource-status';
import { idToResourceTypeName, ResourceTypeOptions } from '../enums/resource-type';
import { FormOfAddressOptions } from '../enums/form-of-address';

const RESOURCE = 'DataResource30';

/** ─────────────────────────────────────────────────────────────────────────────
 *  WorkingStatus (local): 1=INTERNAL, 2=EXTERNAL
 *  ─────────────────────────────────────────────────────────────────────────── */
const WorkingStatusOptions: INodePropertyOptions[] = [
    { name: 'Internal (1)', value: 1, description: 'INTERNAL' },
    { name: 'External (2)', value: 2, description: 'EXTERNAL' },
];

/** Small helper to stringify SOAP scalars (kills the boolean typeof warning) */
function toSoapScalar(v: unknown): string {
    if (v === null || v === undefined) return '';
    return typeof v === 'string' ? v.trim() : String(v);
}

/** Map IDs → enum names on resource-like objects */
function decorateResourceEnums(r: any) {
    const statusId        = asNum(r.statusId ?? r.Status ?? r.status);
    const workingStatusId = asNum(r.workingStatusId ?? r.WorkingStatus ?? r.workingStatus);
    const resourceTypeId  = asNum(r.resourceTypeId ?? r.ResourceType ?? r.resourceType);

    const statusName        = idToResourceStatusName(statusId);
    const workingStatusName = workingStatusId != null ? (workingStatusId === 1 ? 'INTERNAL' : workingStatusId === 2 ? 'EXTERNAL' : undefined) : undefined;
    const resourceTypeName  = idToResourceTypeName(resourceTypeId);

    return {
        ...r,
        ...(statusId !== undefined ? { statusId } : {}),
        ...(statusName ? { status: statusName } : {}),
        ...(workingStatusId !== undefined ? { workingStatusId } : {}),
        ...(workingStatusName ? { workingStatus: workingStatusName } : {}),
        ...(resourceTypeId !== undefined ? { resourceTypeId } : {}),
        ...(resourceTypeName ? { resourceType: resourceTypeName } : {}),
    };
}

/** ─────────────────────────────────────────────────────────────────────────────
 *  Operation → parameters (UUID auto-included)
 *  ─────────────────────────────────────────────────────────────────────────── */
const PARAM_ORDER: Record<string, string[]> = {
    // Core object ops
    insertObject: ['ResourceIN'],
    update: ['ResourceIN', 'enableNullOrEmptyValues'],
    delete: ['resourceID'],
    search: ['SearchFilterResource'],
    seekByExternalID: ['ExternalID'],
    getResourceObject: ['resourceID'],
    getAllResourceObjects: ['WorkingStatus', 'Status'],

    // Pricelists
    getPricelists: ['resourceID'],
    getPricelists2: ['sourcelanguage', 'targetlanguage', 'resourceID'],

    // Payment info
    getPaymentInformation: ['resourceID'],
    setPaymentInformation: ['resourceID', 'paymentInfo'],

    // Status / Type
    getStatus: ['resourceID'],
    setStatus: ['Status', 'resourceID'],
    // getWorkingStatus: ['resourceID'],
    // setWorkingStatus: ['WorkingStatus', 'resourceID'],
    // getResourceType: ['resourceID'],
    // setResourceType: ['ResourceType', 'resourceID'],

    // Lookups
    getAvailableAccountIDList: [],
    getAvailablePaymentMethodList: [],
    getPaymentMethodDescription: ['paymentMethodID', 'systemLanguageCode'],
};

/** Return types */
type R =
    | 'Void' | 'String' | 'Integer' | 'IntegerArray'
    | 'Resource' | 'ResourceList' | 'PricelistList' | 'PaymentInfo';

const RETURN_TYPE: Record<string, R> = {
    insertObject: 'Integer',
    update: 'Void',
    delete: 'Void',
    search: 'IntegerArray',
    seekByExternalID: 'Integer',

    getResourceObject: 'Resource',
    getAllResourceObjects: 'ResourceList',

    getPricelists: 'PricelistList',
    getPricelists2: 'PricelistList',

    getPaymentInformation: 'PaymentInfo',
    setPaymentInformation: 'Void',

    getStatus: 'Integer',
    setStatus: 'Void',
    // getWorkingStatus: 'Integer',
    // setWorkingStatus: 'Void',
    // getResourceType: 'Integer',
    // setResourceType: 'Void',

    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getPaymentMethodDescription: 'String',
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
const FRIENDLY_LABEL: Record<string, string> = {
    insertObject: 'Create Resource',
    update: 'Update Resource',
    delete: 'Delete Resource',
    seekByExternalID: 'Search by External ID',
    getAllResourceObjects: 'Get All Resources (by status)',
    getPricelists: 'Get Pricelists',
    getPricelists2: 'Get Pricelists (Language Pair)',
    getResourceObject: 'Get Resource',
};
const OP_ORDER = [
    'getResourceObject',
    'getAllResourceObjects',
    'insertObject',
    'update',
    'delete',
    'search',
    'seekByExternalID',
    'getPricelists2',
] as const;

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    [...new Set([...OP_ORDER, ...Object.keys(PARAM_ORDER)])]
        .filter((op) => op in PARAM_ORDER)
        .map((op) => {
            const label = FRIENDLY_LABEL[op] ?? labelize(op);
            return { name: label, value: op, action: label, description: `Call ${label} on ${RESOURCE}` };
        }),
);

const extraProperties: INodeProperties[] = Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
    params.map<INodeProperties>((p) => {
        // WorkingStatus → dropdown
        if (p === 'WorkingStatus') {
            return {
                displayName: 'Working Status',
                name: p,
                type: 'options',
                options: WorkingStatusOptions,
                default: 1,
                description: `${p} parameter for ${op} (1=INTERNAL, 2=EXTERNAL)`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }
        // Status (resource status) → dropdown from your enum file
        if (p === 'Status') {
            return {
                displayName: 'Status',
                name: p,
                type: 'options',
                options: ResourceStatusOptions,
                default: 1, // ACTIVE
                description: `${p} parameter for ${op} (ResourceStatus enum)`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }
        if (p === 'ResourceType') {
            return {
                displayName: 'Resource Type',
                name: p,
                type: 'options',
                options: ResourceTypeOptions,
                default: 0, // RESOURCES
                description: `${p} parameter for ${op} (ResourceType enum)`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }
        if (p === 'FormOfAddress') {
            return {
                displayName: 'Form of Address',
                name: p,
                type: 'options',
                options: FormOfAddressOptions,
                default: 3, // COMPANY
                description: `${p} parameter for ${op} (FormOfAddressType enum)`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }
        // enableNullOrEmptyValues → boolean
        if (op === 'update' && p === 'enableNullOrEmptyValues') {
            return {
                displayName: 'Overwrite with Empty Values',
                name: p,
                type: 'boolean',
                default: false,
                description:
                    'If enabled, empty inputs overwrite existing values in Plunet. If disabled, empty inputs are ignored.',
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }
        // default: string
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
 *  SOAP helpers + execution
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
    const uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);

    const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];
    for (const name of paramNames) {
        const valRaw = ctx.getNodeParameter(name, itemIndex, '') as unknown;
        const val = toSoapScalar(valRaw);
        if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }

    const env11 = buildEnvelope(op, parts.join('\n'));
    const soapAction = `http://API.Integration/${op}`;
    const body = await sendSoapWithFallback(ctx, url, env11, soapAction, timeoutMs);

    throwIfSoapOrStatusError(ctx, itemIndex, body, op);

    const rt = RETURN_TYPE[op] as R | undefined;
    let payload: IDataObject;

    switch (rt) {
        case 'Resource': {
            const r = parseResourceResult(body);
            const resource = r.resource ? decorateResourceEnums(r.resource) : r.resource;
            payload = { resource, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'ResourceList': {
            const r = parseResourceListResult(body);
            const resources = (r.resources || []).map(decorateResourceEnums);
            payload = { resources, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'PricelistList': {
            const r = parsePricelistListResult(body);
            payload = { pricelists: r.pricelists, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'PaymentInfo': {
            const r = parsePaymentInfoResult(body);
            payload = { paymentInfo: r.paymentInfo, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
            payload = { statusMessage: extractStatusMessage(body), rawResponse: body };
        }
    }

    return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
}

/** ─────────────────────────────────────────────────────────────────────────────
 *  Service export
 *  ─────────────────────────────────────────────────────────────────────────── */
export const DataResource30Service: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Resources (DataResource30)',
    resourceDescription: 'Resource-related endpoints',
    endpoint: 'DataResource30',
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramNames = PARAM_ORDER[operation];
        if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
        return runOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation, paramNames);
    },
};
