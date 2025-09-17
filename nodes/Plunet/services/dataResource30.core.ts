import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { ensureSession } from '../core/session';
import {
    extractResultBase,
    extractStatusMessage,
    extractSoapFault,
    parseIntegerResult,
    parseIntegerArrayResult,
    parseVoidResult,
} from '../core/xml';
import { parseResourceResult } from '../core/parsers';

import { ResourceStatusOptions, idToResourceStatusName } from '../enums/resource-status';
import { ResourceTypeOptions, idToResourceTypeName } from '../enums/resource-type';
import { FormOfAddressOptions, idToFormOfAddressName } from '../enums/form-of-address';

const RESOURCE = 'DataResource30Core';
const ENDPOINT = 'DataResource30';

/** WorkingStatus (1=INTERNAL, 2=EXTERNAL) */
const WorkingStatusOptions: INodePropertyOptions[] = [
    { name: 'Internal (1)', value: 1, description: 'INTERNAL' },
    { name: 'External (2)', value: 2, description: 'EXTERNAL' },
];

/** ResourceIN fields for create/update */
const RESOURCE_IN_FIELDS_CREATE = [
    'academicTitle','costCenter','currency','email','externalID','fax','formOfAddress',
    'fullName','mobilePhone','name1','name2','opening','phone','resourceType','skypeID',
    'status','supervisor1','supervisor2','userId','website','workingStatus',
] as const;

const RESOURCE_IN_FIELDS_UPDATE = [
    'resourceID', ...RESOURCE_IN_FIELDS_CREATE,
] as const;

/** Operations → parameters (UUID auto-included) */
const PARAM_ORDER: Record<string,string[]> = {
    getResourceObject: ['resourceID'],
    insertObject: [...RESOURCE_IN_FIELDS_CREATE],
    update: [...RESOURCE_IN_FIELDS_UPDATE, 'enableNullOrEmptyValues'],
    delete: ['resourceID'],
    search: ['SearchFilterResource'],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Resource';
const RETURN_TYPE: Record<string,R> = {
    getResourceObject: 'Resource',
    insertObject: 'Integer',
    update: 'Void',
    delete: 'Void',
    search: 'IntegerArray',
};

/** UI wiring */
function labelize(op: string) {
    if (op.includes('_')) return op.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
    return op.replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/\b\w/g,(m)=>m.toUpperCase());
}
function asNonEmpty<T>(arr: T[]): [T,...T[]] { if(!arr.length) throw new Error('Expected non-empty'); return arr as any; }

const FRIENDLY_LABEL: Record<string,string> = {
    getResourceObject: 'Get Resource',
    insertObject: 'Create Resource',
    update: 'Update Resource',
    delete: 'Delete Resource',
    search: 'Search',
};

const OP_ORDER = ['getResourceObject','insertObject','update','delete','search'] as const;

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    [...OP_ORDER].map((op) => {
        const label = FRIENDLY_LABEL[op] ?? labelize(op);
        return { name: label, value: op, action: label, description: `Call ${label} on ${ENDPOINT}` };
    }),
);

// enum helpers
const isStatusParam = (p: string) => p === 'Status' || p === 'status';
const isWorkingStatusParam = (p: string) => p === 'WorkingStatus' || p === 'workingStatus';
const isResourceTypeParam = (p: string) => p === 'ResourceType' || p === 'resourceType';
const isFormOfAddressParam = (p: string) => p === 'FormOfAddress' || p === 'formOfAddress';

const extraProperties: INodeProperties[] =
    Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params.map<INodeProperties>((p) => {
            // dropdowns for enum params
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
            // toggle on update
            if (op === 'update' && p === 'enableNullOrEmptyValues') {
                return {
                    displayName: 'Overwrite with Empty Values',
                    name: p, type: 'boolean', default: false,
                    description: 'Empty inputs overwrite existing values (otherwise they’re ignored).',
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            // default: string
            return {
                displayName: p, name: p, type: 'string', default: '',
                description: `${p} parameter for ${op}`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }),
    );

/** SOAP helpers */
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

function buildResourceINXml(ctx: IExecuteFunctions, itemIndex: number, fieldNames: readonly string[]): string {
    const parts: string[] = [];
    for (const name of fieldNames) {
        const raw = ctx.getNodeParameter(name, itemIndex, '') as string|number|boolean;
        const val = typeof raw==='string' ? raw.trim() : typeof raw==='number' ? String(raw) : raw ? 'true' : 'false';
        if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }
    return `<ResourceIN>\n${parts.map((l)=>'  '+l).join('\n')}\n</ResourceIN>`;
}

async function runOp(
    ctx: IExecuteFunctions, creds: Creds, url: string, baseUrl: string, timeoutMs: number,
    itemIndex: number, op: string, paramNames: string[],
): Promise<IDataObject> {
    const uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);

    const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];

    if (op === 'insertObject') {
        parts.push(buildResourceINXml(ctx, itemIndex, RESOURCE_IN_FIELDS_CREATE));
    } else if (op === 'update') {
        const resourceIn = buildResourceINXml(ctx, itemIndex, RESOURCE_IN_FIELDS_UPDATE);
        parts.push(resourceIn);
        const en = ctx.getNodeParameter('enableNullOrEmptyValues', itemIndex, false) as boolean;
        parts.push(`<enableNullOrEmptyValues>${en ? 'true' : 'false'}</enableNullOrEmptyValues>`);
    } else {
        for (const name of paramNames) {
            const raw = ctx.getNodeParameter(name, itemIndex, '') as string|number|boolean;
            const val = typeof raw==='string' ? raw.trim() : typeof raw==='number' ? String(raw) : raw ? 'true' : 'false';
            if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
        }
    }

    const env11 = buildEnvelope(op, parts.join('\n'));
    const body = await sendSoapWithFallback(ctx, url, env11, `http://API.Integration/${op}`, timeoutMs);

    throwIfSoapOrStatusError(ctx, itemIndex, body, op);

    const rt = RETURN_TYPE[op] as R|undefined;
    let payload: IDataObject;

    switch (rt) {
        case 'Resource': {
            const r = parseResourceResult(body);
            const res = (r as any).resource || undefined;
            const statusName = idToResourceStatusName(res?.status ?? res?.Status);
            const typeName = idToResourceTypeName(res?.resourceType ?? res?.ResourceType);
            const wsId = res?.workingStatus ?? res?.WorkingStatus;
            const wsName = wsId === 1 ? 'INTERNAL' : wsId === 2 ? 'EXTERNAL' : undefined;
            const foaName = idToFormOfAddressName(res?.formOfAddress ?? res?.FormOfAddress);
            const resource = res ? {
                ...res,
                ...(statusName ? { status: statusName } : {}),
                ...(typeName ? { resourceType: typeName } : {}),
                ...(wsName ? { workingStatus: wsName } : {}),
                ...(foaName ? { formOfAddressName: foaName } : {}),
            } : undefined;
            payload = { resource, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Integer': {
            const r = parseIntegerResult(body);
            payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
export const DataResource30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Resources (Core)',
    resourceDescription: 'Core operations for DataResource30',
    endpoint: ENDPOINT,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramNames = PARAM_ORDER[operation];
        if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
        return runOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation, paramNames);
    },
};
