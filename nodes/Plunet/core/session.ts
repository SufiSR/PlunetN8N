import type { IExecuteFunctions } from 'n8n-workflow';
import type { Creds } from './types';
import { escapeXml, sendSoapWithFallback } from './soap';
import { extractUuid } from './xml';

/** In-workflow global cache for sessions keyed by base host (scheme+host). */
type SessionMap = Record<string, { uuid: string; issuedAt: number }>;

function staticKeyForCreds(creds: Creds) {
    const scheme = creds.useHttps ? 'https' : 'http';
    return `${scheme}://${(creds.baseHost || '').replace(/\/$/, '')}`;
}

/** Read a cached UUID for these credentials, if present. */
export function getSession(ctx: IExecuteFunctions, creds: Creds): string | null {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    const key = staticKeyForCreds(creds);
    return sd.plunetSessions?.[key]?.uuid ?? null;
}

/** Save a UUID for these credentials. */
export function saveSession(ctx: IExecuteFunctions, creds: Creds, uuid: string): void {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    if (!sd.plunetSessions) sd.plunetSessions = {};
    const key = staticKeyForCreds(creds);
    sd.plunetSessions[key] = { uuid, issuedAt: Date.now() };
}

/** Clear a cached session for these credentials. */
export function clearSession(ctx: IExecuteFunctions, creds: Creds): void {
    const sd = ctx.getWorkflowStaticData('global') as unknown as { plunetSessions?: SessionMap };
    if (!sd.plunetSessions) return;
    const key = staticKeyForCreds(creds);
    delete sd.plunetSessions[key];
}

/**
 * Ensure a UUID is available for these credentials.
 * If none is cached, performs a login against the provided PlunetAPI URL and stores it.
 *
 * @param urlPlunetAPI Fully-qualified PlunetAPI endpoint (e.g., https://host/PlunetAPI)
 * @param itemIndex    Passed through for parity with callers; not used here
 */
export async function ensureSession(
    ctx: IExecuteFunctions,
    creds: Creds,
    urlPlunetAPI: string,
    timeoutMs: number,
    _itemIndex: number,
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

    const soapAction = 'http://API.Integration/login';

    const body = await sendSoapWithFallback(ctx, urlPlunetAPI, env11, soapAction, timeoutMs);

    const uuid = extractUuid(body);
    if (!uuid) {
        const { PlunetErrorFactory } = await import('./errors');
        throw PlunetErrorFactory.createNetworkError(
            'login',
            'PlunetAPI',
            'Auto-login succeeded but UUID not found in SOAP response'
        );
    }

    saveSession(ctx, creds, uuid);
    return uuid;
}
