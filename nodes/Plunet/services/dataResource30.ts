// nodes/Plunet/services/dataResource30.ts
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
    parseAccountResult,
    parsePaymentInfoResult,
    parseResourceResult,
    parseResourceListResult,
    parsePricelistListResult,
} from '../core/parsers';

import {
    ResourceStatusOptions,
    idToResourceStatusName,
} from '../enums/resource-status';
import {
    WorkingStatusOptions,
    idToWorkingStatusName,
} from '../enums/working-status';
import {
    ResourceTypeOptions,
    idToResourceTypeName,
} from '../enums/resource-type';

const RESOURCE = 'DataResource30';

/** ─────────────────────────────────────────────────────────────────────────────
 *  Operation → parameters (order matters). UUID is auto-included.
 *  (Trimmed to the non-redundant, “Customer-like” surface)
 *  ─────────────────────────────────────────────────────────────────────────── */
const PARAM_ORDER: Record<string, string[]> = {
    // CRUD / search
    insertObject: ['ResourceIN'],
    update: ['ResourceIN', 'enableNullOrEmptyValues'],
    delete: ['resourceID'],
    search: ['SearchFilterResource'],
    seekByExternalID: ['ExternalID'],

    // Getters
    getResourceObject: ['resourceID'],
    getAllResourceObjects: ['WorkingStatus', 'Status'],
    getAvailableAccountIDList: [],
    getAvailablePaymentMethodList: [],
    getPaymentMethodDescription: ['paymentMethodID', 'systemLanguageCode'],
    getPaymentInformation: ['resourceID'],
    getAccount: ['AccountID'],
    getPricelists: ['resourceID'],
    getPricelists2: ['sourcelanguage', 'targetlanguage', 'resourceID'],

    // Setters (enums normalized first)
    setStatus: ['Status', 'resourceID'],
    getStatus: ['resourceID'],
    setWorkingStatus: ['WorkingStatus', 'resourceID'],
    getWorkingStatus: ['resourceID'],
    setResourceType: ['ResourceType', 'resourceID'],
    getResourceType: ['resourceID'],
    setPaymentInformation: ['resourceID', 'paymentInfo'],
};

type R =
    | 'Void' | 'String' | 'Integer' | 'IntegerArray'
    | 'Resource' | 'ResourceList' | 'PricelistList'
    | 'PaymentInfo' | 'Account';

const RETURN_TYPE: Record<string, R> = {
    // CRUD / search
    insertObject: 'Integer',
    update: 'Void',
    delete: 'Void',
    search: 'IntegerArray',
    seekByExternalID: 'Integer',

    // Getters
    getResourceObject: 'Resource',
    getAllResourceObjects: 'ResourceList',
    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getPaymentMethodDescription: 'String',
    getPaymentInformation: 'PaymentInfo',
    getAccount: 'Account',
    getPricelists: 'PricelistList',
    getPricelists2: 'PricelistList',

    // Setters / enum getters
    setStatus: 'Void',
    getStatus: 'Integer',
    setWorkingStatus: 'Void',
    getWorkingStatus: 'Integer',
    setResourceType: 'Void',
    getResourceType: 'Integer',
    setPaymentInformation: 'Void',
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
    getAllResourceObjects: 'Get All Resource Objects (by filters)',
    getAvailableAccountIDList: 'Get Available Account IDs',
    getAvailablePaymentMethodList: 'Get Available Payment Methods',
    getPaymentMethodDescription: 'Get Payment Method Description',
    getPricelists2: 'Get Pricelists (by language pair)',
};

const OP_ORDER = [
    'insertObject',
    'update',
    'delete',
    'search',
    'seekByExternalID',
];

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    [...new Set([...OP_ORDER, ...Object.keys(PARAM_ORDER)])]
        .filter((op) => op in PARAM_ORDER)
        .map((op) => {
            const label = FRIENDLY_LABEL[op] ?? labelize(op);
            return { name: label, value: op, action: label, description: `Call ${label} on ${RESOURCE}` };
        }),
);

// turn Status / WorkingStatus / ResourceType into dropdowns;
// update.enableNullOrEmptyValues as boolean.
const extraProperties: INodeProperties[] = Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
    params.map<INodeProperties>((p) => {
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
        if (p === 'WorkingStatus') {
            return {
                displayName: 'Working Status',
                name: p,
                type: 'options',
                options: WorkingStatusOptions,
                default: 1, // INTERNAL
                description: `${p} parameter for ${op} (WorkingStatus enum)`,
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
        if (op === 'update' && p === 'enableNullOrEmptyValues') {
            return {
                displayName: 'Overwrite with Empty Values',
                name: p,
                type: 'boolean',
                default: false,
                description:
                    'If enabled, empty inputs overwrite existing values in Plunet. If disabled, empty inputs are ignored and existing values are preserved.',
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }
        // default: free text
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

    throwIfSoapOrStatusError(ctx, itemIndex, body, op);

    const rt = RETURN_TYPE[op] as R | undefined;
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
        case 'PricelistList': {
            const r = parsePricelistListResult(body);
            payload = { pricelists: r.pricelists, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
                const name = idToResourceStatusName(r.value ?? undefined);
                payload = { status: name ?? null, statusId: r.value ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
            } else if (op === 'getWorkingStatus') {
                const name = idToWorkingStatusName(r.value ?? undefined);
                payload = { workingStatus: name ?? null, workingStatusId: r.value ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
            } else if (op === 'getResourceType') {
                const name = idToResourceTypeName(r.value ?? undefined);
                payload = { resourceType: name ?? null, resourceTypeId: r.value ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
