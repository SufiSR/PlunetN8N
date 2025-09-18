import type { IExecuteFunctions, IDataObject, IHttpRequestOptions } from 'n8n-workflow';
import { XMLParser } from 'fast-xml-parser';
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

    // IMPORTANT: escape angle brackets so n8n doesn't strip tags in the UI
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

// New enhanced functions for the refactored architecture
export function buildEnvelope(op: string, bodyXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:${op}>
      ${bodyXml}
    </api:${op}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export async function sendSoap(
  ctx: IExecuteFunctions,
  url: string,
  soapAction: string,
  envelope: string,
): Promise<string> {
  // Use the same approach as the working sendSoapWithFallback
  let resp = await requestSoap(ctx, url, envelope, soapAction, '1.1', 30000);
  if (!resp.ok) {
    const env12 = toSoap12Envelope(envelope);
    resp = await requestSoap(ctx, url, env12, soapAction, '1.2', 30000);
  }
  if (!resp.ok) {
    // Enhanced error logging to help debug 415 errors
    const errorDetails = {
      url,
      soapAction,
      envelope: envelope,
      error: resp.error || 'Request failed',
      responseBody: resp.body,
    };
    
    // Log error details for debugging (n8n will handle logging)
    const logMessage = `SOAP Request Failed: ${JSON.stringify(errorDetails, null, 2)}`;
    // Note: In n8n context, this will be visible in the workflow execution logs
    
    // Create a more detailed error message
    const detailedError = new Error(
      `SOAP request failed: ${errorDetails.error}\n\n` +
      `Request Details:\n` +
      `URL: ${url}\n` +
      `SOAP Action: ${soapAction}\n` +
      `Envelope:\n${envelope}\n\n` +
      `Response: ${errorDetails.responseBody || 'No response body'}`
    );
    
    throw detailedError;
  }
  return resp.body;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', textNodeName: 'text' });

export function parseXml(xml: string): any { return parser.parse(xml); }

export function extractSoapFault(xmlObj: any): string | null {
  const fault =
    xmlObj?.['soap:Envelope']?.['soap:Body']?.['soap:Fault'] ??
    xmlObj?.Envelope?.Body?.Fault;
  if (!fault) return null;
  return String(fault.faultstring || fault.faultcode || 'SOAP Fault');
}

export function extractResultBase(xmlObj: any): { statusCode?: number; statusMessage?: string } {
  const walk = (o: any): any => {
    if (!o || typeof o !== 'object') return null;
    if ('Status' in o || 'status' in o || 'StatusCode' in o || 'statusCode' in o) return o;
    for (const k of Object.keys(o)) { const found = walk(o[k]); if (found) return found; }
    return null;
  };
  const hit = walk(xmlObj);
  const statusCode = Number(hit?.Status ?? hit?.status ?? hit?.StatusCode ?? hit?.statusCode);
  const statusMessage = String(hit?.StatusMessage ?? hit?.statusMessage ?? hit?.Message ?? hit?.message ?? '');
  return { statusCode: Number.isFinite(statusCode) ? statusCode : undefined, statusMessage };
}