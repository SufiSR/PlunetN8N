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
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}
export function asStr(v: unknown): string | undefined {
    return typeof v === 'string' ? v : v == null ? undefined : String(v);
}
export function toArray<T>(v: T | T[] | undefined | null): T[] {
    if (v === undefined || v === null) return [];
    return Array.isArray(v) ? v : [v];
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
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

    // Pick the response/result wrapper (e.g., setFaxResponse, getFooResult, etc.)
    const respKey = (keys.find((k) => /(response|result)$/i.test(k)) ?? keys[0]) as string;
    const wrapperUnknown = (body as Record<string, unknown>)[respKey];
    const wrapper =
        wrapperUnknown && typeof wrapperUnknown === 'object'
            ? (wrapperUnknown as Record<string, unknown>)
            : {};

    // 1) Explicit <return>
    const returnKey = Object.keys(wrapper).find((k) => k.toLowerCase() === 'return');
    if (returnKey) {
        const ret = (wrapper as any)[returnKey];
        if (ret && typeof ret === 'object') return ret as Record<string, unknown>;
        // if it's a primitive (e.g., login UUID), keep parsing paths that expect objects
    }

    // 2) Nested <Result> or typed *Result (StringResult, IntegerArrayResult, etc.)
    const resultKey = Object.keys(wrapper).find((k) => /(^result$|result$)/i.test(k));
    if (resultKey) {
        const ret = (wrapper as any)[resultKey];
        if (ret && typeof ret === 'object') return ret as Record<string, unknown>;
    }

    // 3) Fallback: return the wrapper itself
    return wrapper;
}

/** Some endpoints nest payload in <data> while others put it directly */
export function getDataNode(xml: string): unknown {
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body);
    if ('data' in ret) return (ret as any).data;
    return ret;
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
        } else if (typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean') {
            const hit = pred('', cur);
            if (hit !== undefined) return hit;
        }
    }
    return undefined;
}

/** -------- SOAP Fault detection (1.1 and 1.2) -------- */
export function extractSoapFault(xml: string): { message: string; code?: string } | null {
    const body = getBodyRoot(xml) as Record<string, any>;

    // Direct Fault node (common)
    let fault: any = (body as any).Fault ?? (body as any).fault;

    // Sometimes the Fault node is nested under a namespace key
    if (!fault) {
        const faultKey = Object.keys(body).find((k) => /fault$/i.test(k));
        if (faultKey) fault = (body as any)[faultKey];
    }
    if (!fault) return null;

    // SOAP 1.1 fields
    const faultcode = asStr(fault.faultcode);
    const faultstring = asStr(fault.faultstring);

    // SOAP 1.2 fields
    const codeVal = asStr(fault?.Code?.Value);
    const reasonText =
        asStr(fault?.Reason?.Text) ??
        // Some servers embed reason in array of Texts
        (Array.isArray(fault?.Reason?.Text) ? asStr(fault?.Reason?.Text[0]) : undefined);

    const message = faultstring ?? reasonText ?? 'SOAP Fault';
    const code = faultcode ?? codeVal ?? undefined;

    return { message, code };
}

/** -------- Status extractors -------- */
export function extractResultBase(xml: string): ResultBase {
    const ret = getReturnNode(getBodyRoot(xml));
    const statusCode = asNum((ret as any).statusCode ?? (ret as any).StatusCode);
    const statusCodeAlphanumeric = asStr((ret as any).statusCodeAlphanumeric ?? (ret as any).StatusCodeAlphanumeric);
    const statusMessage = asStr((ret as any).statusMessage ?? (ret as any).StatusMessage);

    const warn = (ret as any).warning_StatusCodeList ?? (ret as any).Warning_StatusCodeList;
    const list = (warn?.int ?? warn) as any;
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

/** -------- Primitive Result Parsers --------
 * NOTE: By request, StringResult and IntegerArrayResult both expose { data: ... }.
 */
export function parseStringResult(xml: string): ResultBase & { data?: string } {
    const base = extractResultBase(xml);

    // Prefer the explicit <data> node under <return>
    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    let dataVal: unknown = ret?.data;

    // Self-closing <data/> may parse as '' or as {}, depending on server/options
    if (dataVal !== undefined && isPlainObject(dataVal)) {
        if (Object.keys(dataVal).length === 0) dataVal = ''; // treat empty object as empty string
    }

    // If not found, search for string-ish content under common keys
    if (dataVal === undefined) {
        dataVal =
            deepFind<string>(ret, (k, v) => {
                if (k === 'data' && (typeof v === 'string' || typeof v === 'number')) return String(v);
                return;
            }) ??
            deepFind<string>(ret, (k, v) => {
                if ((k === 'value' || k === 'string') && (typeof v === 'string' || typeof v === 'number')) return String(v);
                return;
            }) ??
            (typeof ret === 'string' || typeof ret === 'number' ? String(ret) : undefined);
    }

    const data = asStr(dataVal);
    return { ...base, data };
}

export function parseIntegerResult(xml: string): ResultBase & { value?: number } {
    const base = extractResultBase(xml);
    const data = getDataNode(xml) as any;

    // Common integer field names we’ve seen across installs
    const direct =
        asNum(data?.value) ??
        asNum(data?.int) ??
        asNum(data?.data) ??              // allow <data>42</data>
        asNum(data?.status) ??
        asNum(data?.Status) ??
        asNum(data?.statusId) ??
        asNum(data?.statusID) ??
        asNum((typeof data === 'number' || typeof data === 'string') ? data : undefined);

    if (direct !== undefined) return { ...base, value: direct };

    // Fallback: deep search under data for the first numeric at known keys
    const found = deepFind<number>(data, (k, v) => {
        const num = asNum(v);
        if (num === undefined) return;
        if (/^(value|int|data|status|Status|statusId|statusID|id|Id|ID)$/i.test(k)) return num;
        return;
    });

    return { ...base, value: found };
}

/** Returns { data: number[] } for IntegerArrayResult. Handles multiple <data> items. */
export function parseIntegerArrayResult(xml: string): ResultBase & { data: number[] } {
    const base = extractResultBase(xml);

    const body = getBodyRoot(xml);
    const ret = getReturnNode(body) as any;

    // 1) Most common Plunet shape: multiple <data> elements side-by-side
    let arr = toArray<any>(ret?.data);

    // 2) Other commonly seen keys (<int>, <ids>, <idList>, <integerList>, <Integers>)
    if (arr.length === 0) {
        const dn = getDataNode(xml) as any;
        arr = [
            ...toArray<any>(dn?.data),
            ...toArray<any>(dn?.int),
            ...toArray<any>(dn?.ids),
            ...toArray<any>(dn?.idList),
            ...toArray<any>(dn?.integerList),
            ...toArray<any>(dn?.Integers),
        ];
    }

    // 3) Deep fallback: find all numbers under any of the list keys above
    if (arr.length === 0) {
        const acc: any[] = [];
        deepFind<void>(ret, (k, v) => {
            if (/^(data|int|ids|idList|integerList|Integers)$/i.test(k)) {
                acc.push(...toArray<any>(v));
            }
            return;
        });
        arr = acc;
    }

    const data = arr
        .map(asNum)
        .filter((n): n is number => n !== undefined);

    return { ...base, data };
}

/** Many setters/void results: OK when statusCode is 0 or missing */
export function parseVoidResult(xml: string): ResultBase & { ok: boolean } {
    const base = extractResultBase(xml);
    const ok = (base.statusCode ?? 0) === 0;
    return { ...base, ok };
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
