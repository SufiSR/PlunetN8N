import { XMLParser } from 'fast-xml-parser';

/** Common status fields present on Plunet Result types */
export type ResultBase = {
    statusCode?: number;
    statusCodeAlphanumeric?: string;
    statusMessage?: string;
    warningStatusCodeList?: number[];
};

export const xmlParser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
});

/** Utils exported so parsers can reuse them */
export function asNum(v: unknown): number | undefined {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
export function asStr(v: unknown): string | undefined {
    return typeof v === 'string' ? v : v == null ? undefined : String(v);
}
export function toArray<T>(v: T | T[] | undefined | null): T[] {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}

/** Envelope/Body helpers */
export function getBodyRoot(xml: string): Record<string, unknown> {
    const p = xmlParser.parse(xml) as Record<string, unknown>;
    const env = (p?.Envelope ?? {}) as Record<string, unknown>;
    const body = (env?.Body ?? {}) as Record<string, unknown>;
    return body;
}

/** Find the <return> (or equivalent) object of the response element. */
export function getReturnNode(body: Record<string, unknown>): Record<string, unknown> {
    const keys = Object.keys(body);
    if (!keys.length) return {};
    // accept ...Response or ...Result (some stacks use "...Result")
    const respKey = (keys.find((k) => /(response|result)$/i.test(k)) ?? keys[0]) as string;
    const wrapper = (body[respKey] ?? {}) as Record<string, unknown>;
    const ret = (wrapper['return'] ?? wrapper) as Record<string, unknown>;
    return typeof ret === 'object' && ret !== null ? ret : {};
}

/** Some endpoints nest payload in <data> while others put it directly */
export function getDataNode(xml: string): unknown {
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body);
    if ('data' in ret) return (ret as any).data;
    return ret;
}

/** Status extractors */
export function extractResultBase(xml: string): ResultBase {
    const ret = getReturnNode(getBodyRoot(xml));
    const statusCode = asNum((ret as any).statusCode);
    const statusCodeAlphanumeric = asStr((ret as any).statusCodeAlphanumeric);
    const statusMessage = asStr((ret as any).statusMessage);

    const warn = (ret as any).warning_StatusCodeList;
    const list = warn?.int ?? warn;
    const warningStatusCodeList = toArray<number>(list)
        .map((x: any) => Number(x))
        .filter((n) => Number.isFinite(n));

    const base: ResultBase = {};
    if (statusCode !== undefined) base.statusCode = statusCode;
    if (statusCodeAlphanumeric) base.statusCodeAlphanumeric = statusCodeAlphanumeric;
    if (statusMessage) base.statusMessage = statusMessage;
    if (warningStatusCodeList.length) base.warningStatusCodeList = warningStatusCodeList;
    return base;
}

export function extractStatusMessage(xml: string): string | undefined {
    return extractResultBase(xml).statusMessage;
}

/** -------- Primitive Result Parsers -------- */
export function parseStringResult(xml: string): ResultBase & { value?: string } {
    const base = extractResultBase(xml);
    const data = getDataNode(xml) as any;
    const value = asStr(data?.value ?? data?.string ?? data);
    return { ...base, value };
}
export function parseIntegerResult(xml: string): ResultBase & { value?: number } {
    const base = extractResultBase(xml);
    const data = getDataNode(xml) as any;
    const raw = data?.value ?? data?.int ?? data;
    const value = asNum(raw);
    return { ...base, value };
}
export function parseIntegerArrayResult(xml: string): ResultBase & { value: number[] } {
    const base = extractResultBase(xml);
    const data = getDataNode(xml) as any;
    const arr = toArray<number>(data?.int ?? data);
    const value = arr.map((x: any) => Number(x)).filter((n) => Number.isFinite(n));
    return { ...base, value };
}
/** Many setters/void results: OK when statusCode is 0 or missing */
export function parseVoidResult(xml: string): ResultBase & { ok: boolean } {
    const base = extractResultBase(xml);
    const ok = (base.statusCode ?? 0) === 0;
    return { ...base, ok };
}

/** -------- Robust deep-search helpers -------- */
function isUuid(s: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
function deepFind<T = unknown>(node: unknown, pred: (k: string, v: unknown) => T | undefined): T | undefined {
    const seen = new Set<unknown>();
    const stack: unknown[] = [node];
    while (stack.length) {
        const cur = stack.pop();
        if (cur && typeof cur === 'object') {
            if (seen.has(cur)) continue;
            seen.add(cur);
            for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
                const hit = pred(k, v);
                if (hit !== undefined) return hit;
                if (v && typeof v === 'object') stack.push(v);
            }
        } else if (typeof cur === 'string') {
            const hit = pred('', cur);
            if (hit !== undefined) return hit;
        }
    }
    return undefined;
}

/** -------- Back-compat helpers used by session/plunetApi -------- */

/** Extracts a UUID from typical & atypical Plunet login responses */
export function extractUuid(xml: string): string | null {
    const body = getBodyRoot(xml);

    // 1) Preferred: common fields anywhere under Body
    const viaKey = deepFind<string>(body, (k, v) => {
        if (typeof v !== 'string') return;
        if (/^(uuid|UUID|token|sessionId|sessionID|value)$/i.test(k) && isUuid(v)) return v;
        return;
    });
    if (viaKey) return viaKey;

    // 2) Any string value that LOOKS like a UUID anywhere under Body
    const anyString = deepFind<string>(body, (_k, v) => {
        if (typeof v === 'string' && isUuid(v)) return v;
        return;
    });
    if (anyString) return anyString;

    // 3) Fallback: look inside the conventional <return> object too
    const ret = getReturnNode(body) as unknown;
    const fromReturn = deepFind<string>(ret, (k, v) => {
        if (typeof v !== 'string') return;
        if (/^(uuid|UUID|token|sessionId|sessionID|value)$/i.test(k) && isUuid(v)) return v;
        if (isUuid(v)) return v;
        return;
    });
    return fromReturn ?? null;
}

/** Parses validate responses into a boolean (handles many shapes) */
export function parseValidate(xml: string): boolean {
    const body = getBodyRoot(xml);

    // Look for canonical flags first
    const viaKey = deepFind<boolean>(body, (k, v) => {
        if (/^(valid|isValid)$/i.test(k)) {
            if (typeof v === 'boolean') return v;
            if (typeof v === 'string') return v.toLowerCase() === 'true';
            if (typeof v === 'number') return v !== 0;
        }
        return;
    });
    if (viaKey !== undefined) return viaKey;

    // Accept generic truthy/falsey values under "value"/"return"
    const generic = deepFind<boolean>(body, (k, v) => {
        if (/^(value|return)$/i.test(k)) {
            if (typeof v === 'boolean') return v;
            if (typeof v === 'string') return v.toLowerCase() === 'true';
            if (typeof v === 'number') return v !== 0;
        }
        return;
    });
    if (generic !== undefined) return generic;

    // Last resort: any boolean-looking string/number anywhere
    const anyBool = deepFind<boolean>(body, (_k, v) => {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') {
            const s = v.trim().toLowerCase();
            if (s === 'true' || s === 'false') return s === 'true';
            if (s === '1' || s === '0') return s === '1';
        }
        if (typeof v === 'number') return v !== 0;
        return;
    });
    return anyBool ?? false;
}
