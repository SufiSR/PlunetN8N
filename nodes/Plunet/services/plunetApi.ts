import {
    IExecuteFunctions,
    IDataObject,
    INodeProperties,
    INodePropertyOptions,
    NodeOperationError,
} from 'n8n-workflow';

import type { Creds, Service, NonEmptyArray } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { extractResultBase, extractStatusMessage, extractUuid, parseValidate } from '../core/xml';
import { ensureSession, getSession, saveSession, clearSession } from '../core/session';

const RESOURCE = 'PlunetAPI';

function labelize(op: string): string {
    if (op.includes('_')) return op.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    return op.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/\b\w/g, (m) => m.toUpperCase());
}

function asNonEmpty<T>(arr: T[], err = 'Expected non-empty array'): [T, ...T[]] {
    if (arr.length === 0) throw new Error(err);
    return arr as [T, ...T[]];
}

/** ---- Operations dropdown ---- */
const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    [
        { name: labelize('login'), value: 'login', action: 'Login', description: 'Authenticate and get a session UUID' },
        { name: labelize('validate'), value: 'validate', action: 'Validate', description: 'Validate an existing session UUID' },
        { name: labelize('logout'), value: 'logout', action: 'Logout', description: 'End a session UUID' },
    ],
);

/** ---- UI fields ---- */
const extraProperties: INodeProperties[] = [
    {
        displayName: 'Use Stored Session',
        name: 'useStoredSession',
        type: 'boolean',
        default: true,
        description:
            'Use workflow-stored UUID or auto-login if none is stored. Disable to provide a UUID manually.',
        displayOptions: { show: { resource: [RESOURCE], operation: ['validate', 'logout'] } },
    },
    {
        displayName: 'UUID',
        name: 'uuid',
        type: 'string',
        default: '',
        required: false,
        description: 'Session UUID (leave empty to use stored session when enabled)',
        displayOptions: { show: { resource: [RESOURCE], operation: ['validate', 'logout'] } },
    },
];

/** ---- SOAP envelope builder ---- */
function buildEnvelope(op: string, bodyXml: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:${op}>
${bodyXml.split('\n').map((l) => (l ? '      ' + l : l)).join('\n')}
    </api:${op}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** ---- Execute helpers ---- */
async function doLogin(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    timeoutMs: number,
): Promise<IDataObject> {
    const env11 = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:login>
      <arg0>${escapeXml(creds.username || '')}</arg0>
      <arg1>${escapeXml(creds.password || '')}</arg1>
    </api:login>
  </soapenv:Body>
</soapenv:Envelope>`;

    const body = await sendSoapWithFallback(ctx, url, env11, 'http://API.Integration/login', timeoutMs);

    /** Enforce rule: non-OK => hard error */
    const base = extractResultBase(body);

    const uuid = extractUuid(body);
    if (!uuid) throw new Error('Login succeeded but UUID not found in SOAP response');

    // Cache for subsequent calls
    saveSession(ctx, creds, uuid);

    const out: IDataObject = { success: true, resource: RESOURCE, operation: 'login', uuid };
    if (base.statusMessage) out.statusMessage = base.statusMessage;
    if (base.statusCode !== undefined) out.statusCode = base.statusCode;
    return out;
}

async function doValidate(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
): Promise<IDataObject> {
    const useStored = ctx.getNodeParameter('useStoredSession', itemIndex, true) as boolean;
    let uuid = (ctx.getNodeParameter('uuid', itemIndex, '') as string).trim();

    if (useStored && !uuid) {
        // ensure (may auto-login and cache)
        uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);
    }

    const bodyXml = [
        `<UUID>${escapeXml(uuid)}</UUID>`,
        `<Username>${escapeXml(creds.username || '')}</Username>`,
        `<Password>${escapeXml(creds.password || '')}</Password>`,
    ].join('\n');

    const env11 = buildEnvelope('validate', bodyXml);
    const body = await sendSoapWithFallback(ctx, url, env11, 'http://API.Integration/validate', timeoutMs);

    /** Enforce rule: non-OK => hard error */
    const base = extractResultBase(body);
    if (base.statusMessage && base.statusMessage !== 'OK') {
        throw new NodeOperationError(
            ctx.getNode(),
            `Plunet error (validate): ${base.statusMessage}${base.statusCode !== undefined ? ` [${base.statusCode}]` : ''}`,
            { itemIndex },
        );
    }

    const valid = parseValidate(body);
    const out: IDataObject = { success: true, resource: RESOURCE, operation: 'validate', valid, uuid };
    if (base.statusMessage) out.statusMessage = base.statusMessage;
    if (base.statusCode !== undefined) out.statusCode = base.statusCode;
    return out;
}

async function doLogout(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
): Promise<IDataObject> {
    const useStored = ctx.getNodeParameter('useStoredSession', itemIndex, true) as boolean;
    let uuid = (ctx.getNodeParameter('uuid', itemIndex, '') as string).trim();

    if (useStored && !uuid) {
        // don't auto-login for logout; just read stored
        const stored = getSession(ctx, creds);
        if (!stored) throw new Error('No stored session UUID to logout');
        uuid = stored;
    }

    const env11 = buildEnvelope('logout', `<UUID>${escapeXml(uuid)}</UUID>`);
    const body = await sendSoapWithFallback(ctx, url, env11, 'http://API.Integration/logout', timeoutMs);

    /** Enforce rule: non-OK => hard error */
    const base = extractResultBase(body);
    if (base.statusMessage && base.statusMessage !== 'OK') {
        throw new NodeOperationError(
            ctx.getNode(),
            `Plunet error (logout): ${base.statusMessage}${base.statusCode !== undefined ? ` [${base.statusCode}]` : ''}`,
            { itemIndex },
        );
    }

    // Clear cache regardless of status (avoid stale sessions)
    clearSession(ctx, creds);

    const out: IDataObject = { success: true, resource: RESOURCE, operation: 'logout', uuid };
    if (base.statusMessage) out.statusMessage = base.statusMessage;
    if (base.statusCode !== undefined) out.statusCode = base.statusCode;
    return out;
}

/** ---- Service export ---- */
export const PlunetApiService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'PlunetAPI (Auth / Misc)',
    resourceDescription: 'Authentication & utility endpoints',
    endpoint: 'PlunetAPI',

    operationOptions,
    extraProperties,

    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        switch (operation) {
            case 'login':
                return doLogin(ctx, creds, url, timeoutMs);
            case 'validate':
                return doValidate(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
            case 'logout':
                return doLogout(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
            default:
                throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
        }
    },
};
