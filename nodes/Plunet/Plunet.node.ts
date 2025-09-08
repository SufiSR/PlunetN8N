import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeConnectionType,
    IDataObject,
    ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { XMLParser } from 'fast-xml-parser';

type Creds = {
    baseHost: string;
    useHttps: boolean;
    username?: string;
    password?: string;
    timeout?: number;
};

export class Plunet implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Plunet API',
        name: 'plunet',
        icon: 'fa:plug',
        group: ['transform'],
        version: 1,
        description: 'Login & Validate for Plunet SOAP API',
        defaults: { name: 'Plunet API' },
        inputs: [NodeConnectionType.Main],
        outputs: [NodeConnectionType.Main],
        credentials: [{ name: 'plunetApi', required: true }],
        properties: [
            {
                displayName: 'Operation',
                name: 'operation',
                type: 'options',
                options: [
                    { name: 'Login', value: 'login', description: 'Authenticate and get a session UUID' },
                    { name: 'Validate', value: 'validate', description: 'Validate an existing session UUID' },
                ],
                default: 'login',
                noDataExpression: true,
            },
            {
                displayName: 'UUID',
                name: 'uuid',
                type: 'string',
                default: '',
                required: true,
                description: 'Session UUID to validate',
                displayOptions: { show: { operation: ['validate'] } },
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const out: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i) as 'login' | 'validate';
                const creds = (await this.getCredentials('plunetApi')) as ICredentialDataDecryptedObject as unknown as Creds;

                const scheme = creds.useHttps ? 'https' : 'http';
                const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
                const url = `${baseUrl}/PlunetAPI`;
                const timeoutMs = creds.timeout ?? 30000;

                if (operation === 'login') {
                    // SOAP 1.1 first
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

                    out.push({ json: { success: true, operation, uuid } as IDataObject });
                } else {
                    const uuid = this.getNodeParameter('uuid', i) as string;

                    const env11 = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:validate>
      <UUID>${escapeXml(uuid)}</UUID>
    </api:validate>
  </soapenv:Body>
</soapenv:Envelope>`;

                    let resp = await requestSoap(this, url, env11, 'http://API.Integration/validate', '1.1', timeoutMs);
                    if (!resp.ok) {
                        const env12 = env11.replace(
                            'http://schemas.xmlsoap.org/soap/envelope/',
                            'http://www.w3.org/2003/05/soap-envelope',
                        );
                        resp = await requestSoap(this, url, env12, 'http://API.Integration/validate', '1.2', timeoutMs);
                    }
                    if (!resp.ok) throw new Error(resp.error || 'Validate failed');

                    const valid = parseValidate(resp.body);
                    out.push({ json: { success: true, operation, valid, uuid } as IDataObject });
                }
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

/* helpers */

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
            ? { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${soapAction}"` }
            : { 'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"` };

    try {
        const body = (await ctx.helpers.httpRequest({
            method: 'POST',
            url,
            headers,
            body: envelope,
            timeout: timeoutMs,
        })) as string;
        return { ok: true, body };
    } catch (e: any) {
        const snippet =
            typeof e?.response?.body === 'string'
                ? e.response.body.slice(0, 200)
                : e?.message ?? 'request failed';
        return { ok: false, error: snippet, body: typeof e?.response?.body === 'string' ? e.response.body : undefined };
    }
}

function extractUuid(xml: string): string | null {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
    const parsed: any = parser.parse(xml);
    const env = parsed?.Envelope;
    const body = env?.Body;
    if (!body) return null;

    const keys: string[] = Object.keys(body);
    const respKey = keys.find((k) => /loginresponse|response|return/i.test(k)) ?? keys[0];
    const wrapper = respKey ? body[respKey] : body;
    const ret = wrapper?.return ?? wrapper;

    if (typeof ret === 'string' && isUuid(ret)) return ret;
    if (typeof ret === 'object' && ret) {
        const maybe = ret.uuid ?? ret.UUID ?? ret.token ?? ret.sessionId;
        if (typeof maybe === 'string' && isUuid(maybe)) return maybe;
    }
    return null;
}

function parseValidate(xml: string): boolean {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true });
    const parsed: any = parser.parse(xml);
    const env = parsed?.Envelope;
    const body = env?.Body ?? {};
    const keys: string[] = Object.keys(body);
    const respKey = keys.find((k) => /validate(response)?|response|return/i.test(k)) ?? keys[0];
    const wrapper = respKey ? body[respKey] : body;
    const ret = wrapper?.return ?? wrapper;

    if (typeof ret === 'boolean') return ret;
    if (typeof ret === 'string') return ret.toLowerCase() === 'true';
    const maybe = ret?.valid ?? ret?.isValid ?? ret?.value;
    if (typeof maybe === 'boolean') return maybe;
    if (typeof maybe === 'string') return maybe.toLowerCase() === 'true';
    return false;
}

function isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
