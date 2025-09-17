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
    parseResourceResult,
    parseResourceListResult,
    parsePricelistListResult,
    parsePaymentInfoResult,
} from '../core/parsers';

// NEW: enums
import { ResourceStatusOptions, idToResourceStatusName } from '../enums/resource-status';
import { ResourceTypeOptions, idToResourceTypeName } from '../enums/resource-type';
import { FormOfAddressOptions, idToFormOfAddressName } from '../enums/form-of-address';
import { TaxTypeOptions, idToTaxTypeName } from '../enums/tax-type';

const RESOURCE = 'DataResource30';

/** ─────────────────────────────────────────────────────────────────────────────
 *  WorkingStatus (1=INTERNAL, 2=EXTERNAL)
 *  ─────────────────────────────────────────────────────────────────────────── */
const WorkingStatusOptions: INodePropertyOptions[] = [
    { name: 'Internal (1)', value: 1, description: 'INTERNAL' },
    { name: 'External (2)', value: 2, description: 'EXTERNAL' },
];

/** ─────────────────────────────────────────────────────────────────────────────
 *  ResourceIN fields (from API docs)
 *  https://apidoc.plunet.com/latest/BM/Partner/API/SOAP/DTO/Input/ResourceIN.html
 *  ─────────────────────────────────────────────────────────────────────────── */
const RESOURCE_IN_FIELDS_CREATE = [
    'academicTitle',
    'costCenter',
    'currency',
    'email',
    'externalID',
    'fax',
    'formOfAddress',   // enum (int)
    'fullName',
    'mobilePhone',
    'name1',
    'name2',
    'opening',
    'phone',
    'resourceType',    // enum (int)
    'skypeID',
    'status',          // enum (int)
    'supervisor1',
    'supervisor2',
    'userId',
    'website',
    'workingStatus',   // enum (int)
] as const;

const RESOURCE_IN_FIELDS_UPDATE = [
    'resourceID',      // required to target the resource
    ...RESOURCE_IN_FIELDS_CREATE,
] as const;

/** ─────────────────────────────────────────────────────────────────────────────
 *  Operation → parameters (UUID is auto-included)
 *  ─────────────────────────────────────────────────────────────────────────── */
const PARAM_ORDER: Record<string, string[]> = {
    // Object ops (now expanded into individual fields)
    insertObject: [...RESOURCE_IN_FIELDS_CREATE],
    update: [...RESOURCE_IN_FIELDS_UPDATE, 'enableNullOrEmptyValues'],

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
    setPaymentInformation: [
        'resourceID',
        'accountHolder',
        'accountID',
        'BIC',
        'contractNumber',
        'debitAccount',
        'IBAN',
        'paymentMethodID',
        'preselectedTaxID',   // dropdown
        'salesTaxID',
    ],

    // Status / Type

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

    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getPaymentMethodDescription: 'String',
};

/** ─────────────────────────────────────────────────────────────────────────────
 *  UI wiring (friendly labels, dropdowns for enums)
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

// Helpers to detect enum-y params in both top-level ops and ResourceIN
const isStatusParam = (p: string) => p === 'Status' || p === 'status';
const isWorkingStatusParam = (p: string) => p === 'WorkingStatus' || p === 'workingStatus';
const isResourceTypeParam = (p: string) => p === 'ResourceType' || p === 'resourceType';
const isFormOfAddressParam = (p: string) => p === 'FormOfAddress' || p === 'formOfAddress';

const extraProperties: INodeProperties[] = Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
    params.map<INodeProperties>((p) => {
        // Dropdowns for enums
        if (isStatusParam(p)) {
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
        if (isWorkingStatusParam(p)) {
            return {
                displayName: 'Working Status',
                name: p,
                type: 'options',
                options: WorkingStatusOptions,
                default: 1, // INTERNAL
                description: `${p} parameter for ${op} (1=INTERNAL, 2=EXTERNAL)`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }
        if (isResourceTypeParam(p)) {
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
        if (isFormOfAddressParam(p)) {
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
        if (p === 'preselectedTaxID') {
            return {
                displayName: 'Preselected Tax',
                name: p,
                type: 'options',
                options: TaxTypeOptions,
                default: 0, // TAX_1 (pick a sensible default)
                description: `${p} parameter for ${op} (TaxType enum)`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }

        // Overwrite with Empty Values toggle on update
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

        // Default: plain string inputs (we keep them as strings for consistency with DataCustomer30)
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

/** Build <ResourceIN>...</ResourceIN> from provided UI fields */
function buildResourceINXml(ctx: IExecuteFunctions, itemIndex: number, fieldNames: readonly string[]): string {
    const parts: string[] = [];
    for (const name of fieldNames) {
        const raw = ctx.getNodeParameter(name, itemIndex, '') as string | number | boolean;
        let val: string;
        switch (typeof raw) {
            case 'string': val = raw.trim(); break;
            case 'number': val = String(raw); break;
            case 'boolean': val = raw ? 'true' : 'false'; break;
            default: val = '';
        }
        if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }
    return `<ResourceIN>\n${parts.map((l) => '  ' + l).join('\n')}\n</ResourceIN>`;
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

    let parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];

    if (op === 'insertObject') {
        // All params are ResourceIN subfields
        const resourceIn = buildResourceINXml(ctx, itemIndex, RESOURCE_IN_FIELDS_CREATE);
        parts.push(resourceIn);
    } else if (op === 'update') {
        // Build ResourceIN from subfields, but keep enableNullOrEmptyValues outside
        const resourceIn = buildResourceINXml(ctx, itemIndex, RESOURCE_IN_FIELDS_UPDATE);
        parts.push(resourceIn);

        const en = ctx.getNodeParameter('enableNullOrEmptyValues', itemIndex, false) as boolean;
        parts.push(`<enableNullOrEmptyValues>${en ? 'true' : 'false'}</enableNullOrEmptyValues>`);
    } else {
        // default behavior: each param is a top-level tag
        for (const name of paramNames) {
            const valRaw = ctx.getNodeParameter(name, itemIndex, '') as string | number | boolean;
            const val =
                typeof valRaw === 'string'
                    ? valRaw.trim()
                    : typeof valRaw === 'number'
                        ? String(valRaw)
                        : (valRaw ? 'true' : 'false');
            if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
        }
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
            // decorate enum fields if present
            const statusName = idToResourceStatusName((r as any)?.resource?.status ?? (r as any)?.resource?.Status);
            const typeName = idToResourceTypeName((r as any)?.resource?.resourceType ?? (r as any)?.resource?.ResourceType);
            const wsId = (r as any)?.resource?.workingStatus ?? (r as any)?.resource?.WorkingStatus;
            const wsName = wsId === 1 ? 'INTERNAL' : wsId === 2 ? 'EXTERNAL' : undefined;
            const foaName = idToFormOfAddressName((r as any)?.resource?.formOfAddress ?? (r as any)?.resource?.FormOfAddress);

            const resource = r.resource ? {
                ...r.resource,
                ...(statusName ? { status: statusName } : {}),
                ...(typeName ? { resourceType: typeName } : {}),
                ...(wsName ? { workingStatus: wsName } : {}),
                ...(foaName ? { formOfAddressName: foaName } : {}),
            } : undefined;

            payload = { resource, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'ResourceList': {
            const r = parseResourceListResult(body);
            const resources = (r.resources || []).map((res: any) => {
                const statusName = idToResourceStatusName(res?.status ?? res?.Status);
                const typeName = idToResourceTypeName(res?.resourceType ?? res?.ResourceType);
                const wsId = res?.workingStatus ?? res?.WorkingStatus;
                const wsName = wsId === 1 ? 'INTERNAL' : wsId === 2 ? 'EXTERNAL' : undefined;
                const foaName = idToFormOfAddressName(res?.formOfAddress ?? res?.FormOfAddress);
                return {
                    ...res,
                    ...(statusName ? { status: statusName } : {}),
                    ...(typeName ? { resourceType: typeName } : {}),
                    ...(wsName ? { workingStatus: wsName } : {}),
                    ...(foaName ? { formOfAddressName: foaName } : {}),
                };
            });
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

            // add a friendly name next to the id if present
            const idNum = r.paymentInfo?.preselectedTaxID != null
                ? Number(r.paymentInfo.preselectedTaxID)
                : undefined;
            const taxName = Number.isFinite(idNum as number)
                ? idToTaxTypeName(idNum as number)
                : undefined;

            const paymentInfo = r.paymentInfo
                ? { ...r.paymentInfo, ...(taxName ? { preselectedTaxName: taxName } : {}) }
                : undefined;

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
