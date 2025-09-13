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
export function getReturnNode(body: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(body);
  if (!keys.length) return {};
  const respKey = keys.find((k) => /response$/i.test(k)) ?? keys[0];
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
