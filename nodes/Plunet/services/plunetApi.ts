import { IExecuteFunctions, IDataObject, INodeProperties } from 'n8n-workflow';
import { Creds, Service } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { extractStatusMessage, extractUuid, parseValidate } from '../core/xml';
import { ensureSession, getSession, saveSession, clearSession } from '../core/session';

const RESOURCE = 'PlunetAPI';

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

async function loginOp(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    _baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
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

    const uuid = extractUuid(body);
    if (!uuid) throw new Error('Could not find UUID in SOAP response');

    saveSession(ctx, creds, uuid);
    const statusMessage = extractStatusMessage(body);
    const result: IDataObject = { uuid };
    if (statusMessage) result.statusMessage = statusMessage;
    return result;
}

async function validateOp(
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
        uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);
    }

    const username = (creds.username ?? '').trim();
    const password = (creds.password ?? '').trim();
    if (!username || !password) {
        throw new Error('Username and Password are required for validate() but were not found in credentials.');
    }

    const env11 = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:validate>
      <UUID>${escapeXml(uuid)}</UUID>
      <Username>${escapeXml(username)}</Username>
      <Password>${escapeXml(password)}</Password>
    </api:validate>
  </soapenv:Body>
</soapenv:Envelope>`;

    const body = await sendSoapWithFallback(ctx, url, env11, 'http://API.Integration/validate', timeoutMs);

    const valid = parseValidate(body);
    const statusMessage = extractStatusMessage(body);
    const result: IDataObject = { valid, uuid };
    if (statusMessage) result.statusMessage = statusMessage;
    return result;
}

async function logoutOp(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    _baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
): Promise<IDataObject> {
    const useStored = ctx.getNodeParameter('useStoredSession', itemIndex, true) as boolean;
    let uuid = (ctx.getNodeParameter('uuid', itemIndex, '') as string).trim();

    if (useStored && !uuid) {
        const stored = getSession(ctx, creds);
        if (!stored) throw new Error('No stored session UUID to logout');
        uuid = stored;
    }

    const env11 = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:logout>
      <UUID>${escapeXml(uuid)}</UUID>
    </api:logout>
  </soapenv:Body>
</soapenv:Envelope>`;

    const body = await sendSoapWithFallback(ctx, url, env11, 'http://API.Integration/logout', timeoutMs);

    clearSession(ctx, creds);
    const statusMessage = extractStatusMessage(body);
    const result: IDataObject = { uuid };
    if (statusMessage) result.statusMessage = statusMessage;
    return result;
}

export const PlunetApiService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'PlunetAPI (Auth / Misc)',
    resourceDescription: 'Authentication & utility endpoints',
    endpoint: 'PlunetAPI',
    operationOptions: [
        { name: 'Login', value: 'login', action: 'Log in to Plunet', description: 'Authenticate and obtain a session UUID' },
        { name: 'Validate', value: 'validate', action: 'Validate Plunet session', description: 'Check whether a UUID is valid' },
        { name: 'Logout', value: 'logout', action: 'Log out of Plunet', description: 'Invalidate a session UUID' },
    ],
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        if (operation === 'login') return loginOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
        if (operation === 'validate') return validateOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
        if (operation === 'logout') return logoutOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
        throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
    },
};
