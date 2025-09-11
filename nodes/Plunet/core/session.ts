import { IExecuteFunctions, NodeOperationError } from 'n8n-workflow';
import { Creds, SessionMap } from './types';
import { escapeXml, sendSoapWithFallback } from './soap';
import { extractUuid } from './xml';

function staticKeyForCreds(creds: Creds) {
    const scheme = creds.useHttps ? 'https' : 'http';
    return `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
}

export function getSession(ctx: IExecuteFunctions, creds: Creds): string | null {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    const key = staticKeyForCreds(creds);
    return sd.plunetSessions?.[key]?.uuid ?? null;
}

export function saveSession(ctx: IExecuteFunctions, creds: Creds, uuid: string): void {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    if (!sd.plunetSessions) sd.plunetSessions = {};
    const key = staticKeyForCreds(creds);
    sd.plunetSessions[key] = { uuid, issuedAt: Date.now() };
}

export function clearSession(ctx: IExecuteFunctions, creds: Creds): void {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    if (!sd.plunetSessions) return;
    const key = staticKeyForCreds(creds);
    delete sd.plunetSessions[key];
}

/** Ensure a UUID is available; if none in static data, auto-login (and store). */
export async function ensureSession(
    ctx: IExecuteFunctions,
    creds: Creds,
    urlPlunetAPI: string,
    timeoutMs: number,
    itemIndex: number,
): Promise<string> {
    const cached = getSession(ctx, creds);
    if (cached) return cached;

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

    const body = await sendSoapWithFallback(ctx, urlPlunetAPI, env11, 'http://API.Integration/login', timeoutMs);
    const uuid = extractUuid(body);
    if (!uuid) {
        throw new NodeOperationError(ctx.getNode(), 'Auto-login succeeded but UUID not found', { itemIndex });
    }

    saveSession(ctx, creds, uuid);
    return uuid;
}
