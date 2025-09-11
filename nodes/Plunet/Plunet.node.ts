import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeConnectionType,
    IDataObject,
    ICredentialDataDecryptedObject,
    NodeOperationError,
    IHttpRequestOptions,
} from 'n8n-workflow';
import { XMLParser } from 'fast-xml-parser';

type Creds = {
    baseHost: string;
    useHttps: boolean;
    username?: string;
    password?: string;
    timeout?: number; // ms
};

/** Map resource -> SOAP endpoint path (relative to base host) */
const endpointMap: Record<string, string> = {
    PlunetAPI: 'PlunetAPI',
    // Future: DataOrder30: 'DataOrder30',
    // Future: DataCustomer30: 'DataCustomer30',
};

export class Plunet implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Plunet API',
        name: 'plunet',
        icon: 'fa:plug',
        group: ['transform'],
        version: 1,
        description: 'Plunet SOAP API (Login, Validate, Logout) with session caching',
        defaults: { name: 'Plunet API' },
        inputs: [NodeConnectionType.Main],
        outputs: [NodeConnectionType.Main],
        credentials: [{ name: 'plunetApi', required: true }],
        properties: [
            /* ---------------- Resource ---------------- */
            {
                displayName: 'Resource',
                name: 'resource',
                type: 'options',
                noDataExpression: true,
                options: [
                    {
                        name: 'PlunetAPI (Auth / Misc)',
                        value: 'PlunetAPI',
                        description: 'Authentication & utility endpoints',
                    },
                    // { name: 'Orders (DataOrder30)', value: 'DataOrder30' },
                    // { name: 'Customers (DataCustomer30)', value: 'DataCustomer30' },
                ],
                default: 'PlunetAPI',
                description: 'Choose which Plunet SOAP resource to call',
            },

            /* ---------------- Operation (per resource) ---------------- */
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                noDataExpression: true,
                displayOptions: { show: { resource: ['PlunetAPI'] } },
                options: [
                    { name: 'Login', value: 'login', description: 'Authenticate and get a session UUID' },
                    { name: 'Validate', value: 'validate', description: 'Validate an existing session UUID' },
                    { name: 'Logout', value: 'logout', description: 'End a session UUID' },
                ],
                default: 'login',
            },

            /* ---------------- Session handling helpers ---------------- */
            {
                displayName: 'Use Stored Session',
                name: 'useStoredSession',
                type: 'boolean',
                default: true,
                description:
                    'Use workflow-stored UUID or auto-login if none is stored. Disable to provide a UUID manually.',
                displayOptions: { show: { resource: ['PlunetAPI'], operation: ['validate', 'logout'] } },
            },
            {
                displayName: 'UUID',
                name: 'uuid',
                type: 'string',
                default: '',
                required: false, // optional when using stored session
                description: 'Session UUID (leave empty to use stored session when enabled)',
                displayOptions: { show: { resource: ['PlunetAPI'], operation: ['validate', 'logout'] } },
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const out: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const resource = this.getNodeParameter('resource', i) as string;
                const operation = this.getNodeParameter('operation', i) as string;

                const endpoint = endpointMap[resource];
                if (!endpoint) {
                    throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, { itemIndex: i });
                }

                const creds = (await this.getCredentials('plunetApi')) as ICredentialDataDecryptedObject as unknown as Creds;
                const scheme = creds.useHttps ? 'https' : 'http';
                const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
                const url = `${baseUrl}/${endpoint}`;
                const timeoutMs = creds.timeout ?? 30000;

                /* ==================== Resource: PlunetAPI ==================== */
                if (resource === 'PlunetAPI') {
                    if (operation === 'login') {
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

                        let resp = await requestSoap(this, url, env11, 'http://API.Integration/login', '1.1', timeoutMs);
                        if (!resp.ok) {
                            const env12 = env11.replace(
                                'http://schemas.xmlsoap.org/soap/envelope/',
                                'http://www.w3.org/2003/05/soap-envelope',
                            );
                            resp = await requestSoap(this, url, env12, 'http://API.Integration/login', '1.2', timeoutMs);
                        }
                        if (!resp.ok) throw new Error(resp.error || 'Login failed');

                        const uuid = extractUuid(resp.body);
                        if (!uuid) throw new Error('Could not find UUID in SOAP response');

                        saveSession(this, creds, uuid); // store for subsequent calls

                        out.push({ json: { success: true, resource, operation, uuid } as IDataObject });
                        continue;
                    }

                    if (operation === 'validate') {
                        const useStored = this.getNodeParameter('useStoredSession', i, true) as boolean;
                        let uuid = (this.getNodeParameter('uuid', i, '') as string).trim();

                        if (useStored && !uuid) {
                            // ensure (may auto-login and cache)
                            uuid = await ensureSession(this, creds, `${baseUrl}/PlunetAPI`, timeoutMs);
                        }

                        // Pull username/password from stored credentials
                        const username = (creds.username ?? '').trim();
                        const password = (creds.password ?? '').trim();

                        if (!username || !password) {
                            throw new NodeOperationError(
                                this.getNode(),
                                'Username and Password are required for validate() but were not found in credentials.',
                                { itemIndex: i },
                            );
                        }

                        // SOAP 1.1 first, then fallback to 1.2 (your existing behavior)
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

                        let resp = await requestSoap(this, url, env11, 'http://API.Integration/validate', '1.1', timeoutMs);
                        if (!resp.ok) {
                            // Switch to SOAP 1.2 namespace and content-type+action
                            const env12 = env11.replace(
                                'http://schemas.xmlsoap.org/soap/envelope/',
                                'http://www.w3.org/2003/05/soap-envelope',
                            );
                            resp = await requestSoap(this, url, env12, 'http://API.Integration/validate', '1.2', timeoutMs);
                        }
                        if (!resp.ok) throw new Error(resp.error || 'Validate failed');

                        const valid = parseValidate(resp.body);
                        out.push({ json: { success: true, resource, operation, valid, uuid } as IDataObject });
                        continue;
                    }


                    if (operation === 'logout') {
                        const useStored = this.getNodeParameter('useStoredSession', i, true) as boolean;
                        let uuid = (this.getNodeParameter('uuid', i, '') as string).trim();

                        if (useStored && !uuid) {
                            // don't auto-login for logout; just read stored
                            const stored = getSession(this, creds);
                            if (!stored) {
                                throw new Error('No stored session UUID to logout');
                            }
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

                        let resp = await requestSoap(this, url, env11, 'http://API.Integration/logout', '1.1', timeoutMs);
                        if (!resp.ok) {
                            const env12 = env11.replace(
                                'http://schemas.xmlsoap.org/soap/envelope/',
                                'http://www.w3.org/2003/05/soap-envelope',
                            );
                            resp = await requestSoap(this, url, env12, 'http://API.Integration/logout', '1.2', timeoutMs);
                        }
                        if (!resp.ok) throw new Error(resp.error || 'Logout failed');

                        clearSession(this, creds);

                        out.push({ json: { success: true, resource, operation, uuid } as IDataObject });
                        continue;
                    }

                    throw new NodeOperationError(
                        this.getNode(),
                        `Unsupported operation for PlunetAPI: ${operation}`,
                        { itemIndex: i },
                    );
                }

                /* ==================== Other resources (future) ==================== */
                throw new NodeOperationError(
                    this.getNode(),
                    `Resource ${resource} is recognized but has no operations implemented yet.`,
                    { itemIndex: i },
                );
            } catch (err) {
                if (this.continueOnFail()) {
                    out.push({ json: { success: false, error: (err as Error).message } as IDataObject });
                } else {
                    throw err;
                }
            }
        }

        return [out];
    }
}

/* ==================== helpers ==================== */

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function requestSoap(
    ctx: IExecuteFunctions,
    url: string,
    envelope: string,
    soapAction: string,
    version: '1.1' | '1.2',
    timeoutMs: number,
): Promise<{ ok: true; body: string } | { ok: false; error?: string; body?: string }> {
    const headers =
        version === '1.1'
            ? {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: `"${soapAction}"`,
                Accept: 'text/xml, application/soap+xml, */*;q=0.8',
            }
            : {
                'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"`,
                Accept: 'application/soap+xml, text/xml, */*;q=0.8',
            };

    const options: IHttpRequestOptions = {
        method: 'POST',
        url,
        headers,
        body: envelope,
        timeout: timeoutMs,
        json: false, // ensure n8n returns raw string
    };

    try {
        const body = (await ctx.helpers.httpRequest(options)) as unknown as string;
        return { ok: true, body };
    } catch (e) {
        // Best-effort surface body snippet if present
        const err = e as { message?: string; response?: { body?: unknown } };
        const respBody = err?.response?.body;
        const snippet =
            typeof respBody === 'string'
                ? respBody.slice(0, 400)
                : err?.message ?? 'request failed';
        return {
            ok: false,
            error: snippet,
            body: typeof respBody === 'string' ? respBody : undefined,
        };
    }
}

function extractUuid(xml: string): string | null {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const env = (parsed?.Envelope ?? {}) as Record<string, unknown>;
    const body = (env?.Body ?? {}) as Record<string, unknown>;

    const keys = Object.keys(body);
    if (keys.length === 0) return null;

    const respKeyMaybe = keys.find((k) => /loginresponse|response|return/i.test(k)) ?? keys[0];
    if (!respKeyMaybe) return null; // explicit guard

    const respKey = respKeyMaybe as string; // narrow to string

    const wrapperUnknown = (body as Record<string, unknown>)[respKey];
    const wrapper =
        typeof wrapperUnknown === 'object' && wrapperUnknown !== null
            ? (wrapperUnknown as Record<string, unknown>)
            : {};

    const ret = (wrapper as Record<string, unknown>)['return'] ?? wrapper;

    if (typeof ret === 'string' && isUuid(ret)) return ret;

    if (ret && typeof ret === 'object') {
        const maybe =
            (ret as Record<string, unknown>)['uuid'] ??
            (ret as Record<string, unknown>)['UUID'] ??
            (ret as Record<string, unknown>)['token'] ??
            (ret as Record<string, unknown>)['sessionId'];
        if (typeof maybe === 'string' && isUuid(maybe)) return maybe;
    }
    return null;
}


function parseValidate(xml: string): boolean {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const env = (parsed?.Envelope ?? {}) as Record<string, unknown>;
    const body = (env?.Body ?? {}) as Record<string, unknown>;

    const keys = Object.keys(body);
    if (keys.length === 0) return false;

    const respKeyMaybe = keys.find((k) => /validate(response)?|response|return/i.test(k)) ?? keys[0];
    if (!respKeyMaybe) return false; // explicit guard

    const respKey = respKeyMaybe as string; // narrow to string

    const wrapperUnknown = (body as Record<string, unknown>)[respKey];
    const wrapper =
        typeof wrapperUnknown === 'object' && wrapperUnknown !== null
            ? (wrapperUnknown as Record<string, unknown>)
            : {};

    const ret = (wrapper as Record<string, unknown>)['return'] ?? wrapper;

    if (typeof ret === 'boolean') return ret;
    if (typeof ret === 'string') return ret.toLowerCase() === 'true';

    if (ret && typeof ret === 'object') {
        const rec = ret as Record<string, unknown>;
        const maybe = rec['valid'] ?? rec['isValid'] ?? rec['value'];
        if (typeof maybe === 'boolean') return maybe;
        if (typeof maybe === 'string') return maybe.toLowerCase() === 'true';
    }
    return false;
}

function isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/* ==================== Session in workflow static data ==================== */

type SessionMap = Record<string, { uuid: string; issuedAt: number }>;

function staticKeyForCreds(creds: Creds) {
    const scheme = creds.useHttps ? 'https' : 'http';
    return `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
}

function getSession(ctx: IExecuteFunctions, creds: Creds): string | null {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    const key = staticKeyForCreds(creds);
    return sd.plunetSessions?.[key]?.uuid ?? null;
}

function saveSession(ctx: IExecuteFunctions, creds: Creds, uuid: string): void {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    if (!sd.plunetSessions) sd.plunetSessions = {};
    const key = staticKeyForCreds(creds);
    sd.plunetSessions[key] = { uuid, issuedAt: Date.now() };
}

function clearSession(ctx: IExecuteFunctions, creds: Creds): void {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    if (!sd.plunetSessions) return;
    const key = staticKeyForCreds(creds);
    delete sd.plunetSessions[key];
}

/** Ensure a UUID is available; if none in static data, auto-login (and store) */
async function ensureSession(
    ctx: IExecuteFunctions,
    creds: Creds,
    urlPlunetAPI: string,
    timeoutMs: number,
): Promise<string> {
    const cached = getSession(ctx, creds);
    if (cached) return cached;

    // Perform a login transparently
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

    let resp = await requestSoap(ctx, urlPlunetAPI, env11, 'http://API.Integration/login', '1.1', timeoutMs);
    if (!resp.ok) {
        const env12 = env11.replace(
            'http://schemas.xmlsoap.org/soap/envelope/',
            'http://www.w3.org/2003/05/soap-envelope',
        );
        resp = await requestSoap(ctx, urlPlunetAPI, env12, 'http://API.Integration/login', '1.2', timeoutMs);
    }
    if (!resp.ok) throw new Error(resp.error || 'Auto-login failed');

    const uuid = extractUuid(resp.body);
    if (!uuid) throw new Error('Auto-login succeeded but UUID not found');
    saveSession(ctx, creds, uuid);
    return uuid;
}
