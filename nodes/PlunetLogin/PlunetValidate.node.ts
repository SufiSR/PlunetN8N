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

export class PlunetValidate implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Plunet API: Validate',
        name: 'plunetValidate',
        icon: 'fa:check-circle',
        group: ['transform'],
        version: 1,
        description: 'Validate a Plunet session UUID',
        defaults: { name: 'Plunet Validate' },
        inputs: [NodeConnectionType.Main],
        outputs: [NodeConnectionType.Main],
        credentials: [{ name: 'plunetApi', required: true }],
        properties: [
            {
                displayName: 'UUID',
                name: 'uuid',
                type: 'string',
                required: true,
                default: '',
                description: 'Session UUID returned by login',
            },
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const out: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const uuid = this.getNodeParameter('uuid', i) as string;

                const creds = (await this.getCredentials('plunetApi')) as ICredentialDataDecryptedObject as unknown as Creds;
                const scheme = creds.useHttps ? 'https' : 'http';
                const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
                const url = `${baseUrl}/PlunetAPI`;
                const timeoutMs = creds.timeout ?? 30000;

                // SOAP 1.1 envelope (preferred first)
                const env11 = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:validate>
      <UUID>${escapeXml(uuid)}</UUID>
    </api:validate>
  </soapenv:Body>
</soapenv:Envelope>`;

                let response = await requestSoap(this, url, env11, 'http://API.Integration/validate', '1.1', timeoutMs);
                if (!response.ok) {
                    // fallback to SOAP 1.2
                    const env12 = env11.replace(
                        'http://schemas.xmlsoap.org/soap/envelope/',
                        'http://www.w3.org/2003/05/soap-envelope',
                    );
                    response = await requestSoap(this, url, env12, 'http://API.Integration/validate', '1.2', timeoutMs);
                }

                if (!response.ok) {
                    throw new Error(response.error || 'Validate request failed');
                }

                const valid = parseValidate(response.body);
                out.push({ json: { success: true, valid, uuid } as IDataObject });
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
        const snippet =
            typeof e?.response?.body === 'string'
                ? e.response.body.slice(0, 200)
                : e?.message ?? 'request failed';
        return { ok: false, error: snippet, body: typeof e?.response?.body === 'string' ? e.response.body : undefined };
    }
}

function parseValidate(xml: string): boolean {
    const parser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        trimValues: true,
    });
    const parsed: any = parser.parse(xml);
    const env = parsed?.Envelope;
    const body = env?.Body ?? {};
    // Try to find wrapper like validateResponse / Response / Return
    const keys: string[] = Object.keys(body);
    const respKey = keys.find((k) => /validate(response)?|response|return/i.test(k)) ?? keys[0];
    const wrapper = respKey ? body[respKey] : body;
    const ret = wrapper?.return ?? wrapper;

    if (typeof ret === 'boolean') return ret;
    if (typeof ret === 'string') return ret.toLowerCase() === 'true';
    // sometimes nested, try common fields
    const maybe = ret?.valid ?? ret?.isValid ?? ret?.value;
    if (typeof maybe === 'boolean') return maybe;
    if (typeof maybe === 'string') return maybe.toLowerCase() === 'true';
    // default conservative
    return false;
}
