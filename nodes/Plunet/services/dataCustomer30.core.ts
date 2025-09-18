import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { escapeXml, sendSoapWithFallback, buildErrorDescription } from '../core/soap';
import { ensureSession } from '../core/session';
import {
    extractResultBase, extractStatusMessage, extractSoapFault, parseIntegerResult, parseIntegerArrayResult, parseVoidResult,
} from '../core/xml';
import { parseCustomerResult } from '../core/parsers';

const RESOURCE = 'DataCustomer30Core';
const ENDPOINT = 'DataCustomer30';

/** ─ CustomerStatus enum (local, same mapping you already use) ─ */
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
            name: `${name.replace(/_/g, ' ').replace(/\b\w/g,(m)=>m.toUpperCase())} (${CustomerStatusIdByName[name]})`,
            value: CustomerStatusIdByName[name],
            description: name,
        }));

/** ─ Params per operation (UUID auto-included) ─ */
const PARAM_ORDER: Record<string, string[]> = {
    insert2: [
        'academicTitle','costCenter','currency','customerID','email',
        'externalID','fax','formOfAddress','fullName','mobilePhone',
        'name1','name2','opening','phone','skypeID','status','userId','website',
    ],
    update: [
        'customerID', 'status','userId', 'academicTitle','costCenter','currency','email',
        'externalID','fax','formOfAddress','fullName','mobilePhone',
        'name1','name2','opening','phone','skypeID','website',
        'enableNullOrEmptyValues',
    ],
    delete: ['customerID'],
    search: ['SearchFilter'],
    getCustomerObject: ['customerID'],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Customer';
const RETURN_TYPE: Record<string, R> = {
    insert2: 'Integer',
    update: 'Void',
    delete: 'Void',
    search: 'IntegerArray',
    getCustomerObject: 'Customer',
};

/** ─ UI wiring ─ */
function labelize(op: string) {
    if (op.includes('_')) return op.replace(/_/g,' ').replace(/\b\w/g,(m)=>m.toUpperCase());
    return op.replace(/([a-z])([A-Z0-9])/g,'$1 $2').replace(/\b\w/g,(m)=>m.toUpperCase());
}
function asNonEmpty<T>(arr: T[]): [T,...T[]] { if(!arr.length) throw new Error('Expected non-empty'); return arr as any; }

const FRIENDLY_LABEL: Record<string,string> = {
    insert2: 'Create Customer',
    update: 'Update Customer',
    delete: 'Delete Customer',
    getCustomerObject: 'Get Customer',
};

const OP_ORDER = ['getCustomerObject','insert2','update','delete','search'] as const;

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    [...OP_ORDER].map((op) => {
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
            if (op === 'update' && p === 'enableNullOrEmptyValues') {
                return {
                    displayName: 'Overwrite with Empty Values',
                    name: p,
                    type: 'boolean',
                    default: false,
                    required: true,
                    description: 'If enabled, empty inputs overwrite existing values in Plunet.',
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (op === 'update' && p === 'enableNullOrEmptyValues') {
                return {
                    displayName: 'Status',
                    name: p,
                    type: 'options',
                    options: CustomerStatusOptions,
                    required: true,
                    default: 1,
                    description: `${p} parameter for ${op} (CustomerStatus enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (op === 'update' && p === 'userId') {
                return {
                    displayName: 'userId',
                    name: p,
                    type: 'number',
                    default: 0,
                    required: true,
                    description: `${p} parameter for ${op}`,
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

/** ─ SOAP helpers + runner ─ */
function buildEnvelope(op: string, childrenXml: string) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/><soapenv:Body><api:${op}>
${childrenXml.split('\n').map((l)=>l?`      ${l}`:l).join('\n')}
  </api:${op}></soapenv:Body></soapenv:Envelope>`;
}

function throwIfSoapOrStatusError(
    ctx: IExecuteFunctions,
    itemIndex: number,
    xml: string,
    op?: string,
    sentEnvelope?: string,
    soapAction?: string,
) {
    const fault = extractSoapFault(xml);
    if (fault) {
        const prefix = op ? `${op}: ` : '';
        const code = fault.code ? ` [${fault.code}]` : '';
        throw new NodeOperationError(
            ctx.getNode(),
            `${prefix}SOAP Fault: ${fault.message}${code}`,
            {
                itemIndex,
                description: sentEnvelope ? buildErrorDescription(sentEnvelope, soapAction) : undefined,
            },
        );
    }

    const base = extractResultBase(xml);

    if (base.statusMessage && base.statusMessage !== 'OK') {
        const prefix = op ? `${op}: ` : '';
        const code = base.statusCode !== undefined ? ` [${base.statusCode}]` : '';
        throw new NodeOperationError(
            ctx.getNode(),
            `${prefix}${base.statusMessage}${code}`,
            {
                itemIndex,
                description: sentEnvelope ? buildErrorDescription(sentEnvelope, soapAction) : undefined,
            },
        );
    }

    if (base.statusCode !== undefined && base.statusCode !== 0) {
        const prefix = op ? `${op}: ` : '';
        const msg = base.statusMessage || 'Plunet returned a non-zero status code';
        throw new NodeOperationError(
            ctx.getNode(),
            `${prefix}${msg} [${base.statusCode}]`,
            {
                itemIndex,
                description: sentEnvelope ? buildErrorDescription(sentEnvelope, soapAction) : undefined,
            },
        );
    }
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
    const soapAction = `http://API.Integration/${op}`;
    const body = await sendSoapWithFallback(ctx, url, env11, soapAction, timeoutMs);

    throwIfSoapOrStatusError(ctx, itemIndex, body, op, env11, soapAction);

    const rt = RETURN_TYPE[op] as R|undefined;
    let payload: IDataObject;
    switch (rt) {
        case 'Customer': {
            const r = parseCustomerResult(body);
            payload = { customer: r.customer, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
                throw new NodeOperationError(
                    ctx.getNode(),
                    `${op}: ${msg}${r.statusCode !== undefined ? ` [${r.statusCode}]` : ''}`,
                    {
                        itemIndex,
                        description: buildErrorDescription(env11, soapAction),
                    },
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

/** ─ Service export ─ */
export const DataCustomer30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Customers (Core)',
    resourceDescription: 'Core operations for DataCustomer30',
    endpoint: ENDPOINT,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramNames = PARAM_ORDER[operation];
        if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
        return runOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation, paramNames);
    },
};
