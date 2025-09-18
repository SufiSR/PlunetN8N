import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { buildEnvelope, sendSoap, parseXml, extractResultBase } from './soap';
import { throwForSoapFaultOrStatus } from './errors';
import { toSoapParamValue } from './utils';

export type ParamOrder = Record<string, string[]>;
export type NumericBoolSet = Set<string>;
export interface ExecuteConfig {
  url: string;
  soapActionFor: (op: string) => string;
  paramOrder: ParamOrder;
  numericBooleans?: NumericBoolSet;
  buildCustomBodyXml?: (op: string, itemParams: IDataObject, sessionId: string) => string | null;
  parseResult: (xml: string, op: string) => IDataObject | IDataObject[];
  getSessionId: (ctx: IExecuteFunctions) => Promise<string>;
}

export async function executeOperation(
  ctx: IExecuteFunctions,
  op: string,
  itemParams: IDataObject,
  cfg: ExecuteConfig,
): Promise<IDataObject | IDataObject[]> {
  const sessionId = await cfg.getSessionId(ctx);
  const bodyXml =
    cfg.buildCustomBodyXml?.(op, itemParams, sessionId) ??
    defaultBodyXml(op, itemParams, sessionId, cfg.paramOrder, cfg.numericBooleans);

  const envelope = buildEnvelope(op, bodyXml);
  const soapAction = cfg.soapActionFor(op);
  const xml = await sendSoap(ctx, cfg.url, soapAction, envelope);

  const xmlObj = parseXml(xml);
  const { statusCode, statusMessage } = extractResultBase(xmlObj);
  throwForSoapFaultOrStatus(xmlObj, op, cfg.url, soapAction, envelope, statusCode, statusMessage);

  return cfg.parseResult(xml, op);
}

function defaultBodyXml(
  op: string,
  params: IDataObject,
  sessionId: string,
  order: ParamOrder,
  numericBooleans?: NumericBoolSet,
): string {
  const names = order[op] ?? Object.keys(params ?? {});
  const chunks: string[] = [];
  if (!names.includes('session') && !names.includes('UUID')) chunks.push(`<UUID>${sessionId}</UUID>`);
  for (const name of names) {
    const raw = params?.[name];
    const v = toSoapParamValue(raw, name, numericBooleans);
    chunks.push(`<${name}>${escapeXml(v)}</${name}>`);
  }
  return chunks.join('');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
