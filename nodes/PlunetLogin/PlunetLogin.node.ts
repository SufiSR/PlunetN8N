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
    username: string;
    password: string;
    timeout?: number;
};

export class PlunetLogin implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Plunet API: Login',
        name: 'plunetLogin',
        icon: 'fa:sign-in-alt',
        group: ['transform'],
        version: 1,
        description: 'Authenticate against Plunet SOAP API and return a session UUID',
        defaults: { name: 'Plunet Login' },
        inputs: [NodeConnectionType.Main],
        outputs: [NodeConnectionType.Main],
        credentials: [{ name: 'plunetApi', required: true }],
        properties: [
            // single action node — no additional fields
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const out: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const creds = (await this.getCredentials('plunetApi')) as ICredentialDataDecryptedObject as unknown as Creds;
                const scheme = creds.useHttps ? 'https' : 'http';
                const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
                const url = `${baseUrl}/PlunetAPI`;

                // Build SOAP 1.1 envelope (arg0/arg1)
                const envelope11 = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:login>
      <arg0>${escapeXml(creds.username || '')}</arg0>
      <arg1>${escapeXml(creds.password || '')}</arg1>
    </api:login>
  </soapenv:Body>
</soapenv:Envelope>`;

                // Try SOAP 1.1 first
                let response = await requestSoap(this, url, envelope11, 'http://API.Integration/login', '1.1', creds.timeout ?? 30000);

                // If the server clearly didn’t like it, try SOAP 1.2
                if (!response.ok) {
                    const envelope12 = envelope11.replace(
                        'http://schemas.xmlsoap.org/soap/envelope/',
                        'http://www.w3.org/2003/05/soap-envelope',
                    );
                    response = await requestSoap(this, url, envelope12, 'http://API.Integration/login', '1.2', creds.timeout ?? 30000);
                }

                if (!response.ok) {
                    throw new Error(response.error || 'Login failed');
                }

                const uuid = extractUuid(response.body);
                if (!uuid) {
                    throw new Error('Could not find UUID in SOAP response');
                }

                out.push({ json: { success: true, uuid } as IDataObject });
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

/** ---- helpers ---- */

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
        // include short snippet for debugging
        const snippet =
            typeof e?.response?.body === 'string'
                ? e.response.body.slice(0, 200)
                : e?.message ?? 'request failed';
        return { ok: false, error: snippet, body: typeof e?.response?.body === 'string' ? e.response.body : undefined };
    }
}

function extractUuid(xml: string): string | null {
    const parser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        trimValues: true,
    });
    const parsed = parser.parse(xml);

    // Expect Envelope>Body>loginResponse>return
    const env = (parsed as any).Envelope;
    const body = env?.Body;
    if (!body) return null;

    // Find a key that looks like a response wrapper
    const keys: string[] = Object.keys(body);
    const respKey = keys.find((k) => /loginresponse|response|return/i.test(k)) ?? keys[0];
    const wrapper = respKey ? body[respKey] : body;
    const ret = wrapper?.return ?? wrapper;

    // Possible shapes: string UUID, { uuid: '...' }, { UUID: '...' }
    if (typeof ret === 'string' && isUuid(ret)) return ret;
    if (typeof ret === 'object' && ret) {
        const maybe = (ret as any).uuid ?? (ret as any).UUID ?? (ret as any).token ?? (ret as any).sessionId;
        if (typeof maybe === 'string' && isUuid(maybe)) return maybe;
    }

    return null;
}

function isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
