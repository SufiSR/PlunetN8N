import { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { extractStatusMessage } from './xml';

export function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

type Resp = { ok: true; body: string } | { ok: false; error?: string; body?: string };

async function requestSoap(
    ctx: IExecuteFunctions,
    url: string,
    envelope: string,
    soapAction: string,
    version: '1.1' | '1.2',
    timeoutMs: number,
): Promise<Resp> {
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
        json: false,
    };

    try {
        const body = (await ctx.helpers.httpRequest(options)) as unknown as string;
        return { ok: true, body };
    } catch (e) {
        const err = e as { message?: string; response?: { body?: unknown } };
        const respBody = err?.response?.body;
        const snippet = typeof respBody === 'string' ? respBody.slice(0, 400) : err?.message ?? 'request failed';
        return { ok: false, error: snippet, body: typeof respBody === 'string' ? respBody : undefined };
    }
}

function toSoap12Envelope(env11: string): string {
    return env11.replace('http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope');
}

/** Try SOAP 1.1 then fall back to 1.2. Throws with server statusMessage appended when available. */
export async function sendSoapWithFallback(
    ctx: IExecuteFunctions,
    url: string,
    env11: string,
    soapAction: string,
    timeoutMs: number,
): Promise<string> {
    let resp = await requestSoap(ctx, url, env11, soapAction, '1.1', timeoutMs);
    if (!resp.ok) {
        const env12 = toSoap12Envelope(env11);
        resp = await requestSoap(ctx, url, env12, soapAction, '1.2', timeoutMs);
    }
    if (!resp.ok) {
        const sm = resp.body ? extractStatusMessage(resp.body) : null;
        const msg = resp.error || 'Request failed';
        throw new Error(sm ? `${msg} — ${sm}` : msg);
    }
    return resp.body;
}

const REDACT_TAGS = [
    'UUID',
    'Password',
    'FileByteStream',
    'FilePathName',
    // 'pathOrUrl',          // ← comment out if you want to see it
    'Authorization',
    'Token',
    'token',
];

export function sanitizeEnvelope(xml: string): string {
    let out = xml;
    for (const tag of REDACT_TAGS) {
        const rx = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, 'gi');
        out = out.replace(rx, (m) => {
            const open = m.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>`,'i'))?.[0] ?? `<${tag}>`;
            const close = `</${tag}>`;
            const placeholder =
                tag === 'FileByteStream' ? '[REDACTED_FILE_B64]' :
                    tag === 'UUID' ? '[REDACTED_UUID]' :
                        '[REDACTED]';
            return `${open}${placeholder}${close}`;
        });
    }
    return clip(out);
}

function clip(str: string, max = 16384): string {
    if (str.length <= max) return str;
    return str.slice(0, max) + `\n[...truncated ${str.length - max} chars]`;
}

export function buildErrorDescription(envelope: string, soapAction?: string): string {
    const safe = sanitizeEnvelope(envelope);

    // IMPORTANT: escape angle brackets so n8n doesn’t strip tags in the UI
    const escaped = safe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    return [
        soapAction ? `SOAPAction: ${soapAction}` : undefined,
        '––– Sent SOAP Envelope (sanitized) –––',
        escaped,
        '––––––––––––––––––––––––––––––––––––––',
    ].filter(Boolean).join('\n');
}