import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { buildEnvelope, sendSoap, parseXml, extractResultBase } from './soap';
import { throwForSoapFaultOrStatus } from './errors';
import { toSoapParamValue } from './utils';
import { DebugManager } from './debug';
import { Creds } from './types';

export type ParamOrder = Record<string, string[]>;
export type NumericBoolSet = Set<string>;
export interface ExecuteConfig {
  url: string;
  soapActionFor: (op: string) => string;
  paramOrder: ParamOrder;
  numericBooleans?: NumericBoolSet;
  buildCustomBodyXml?: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => string | null;
  parseResult: (xml: string, op: string) => IDataObject | IDataObject[];
  getSessionId: (ctx: IExecuteFunctions, itemIndex: number) => Promise<string>;
  creds?: Creds; // Add credentials for debug mode
  resource?: string; // Add resource name for error context
}

export async function executeOperation(
  ctx: IExecuteFunctions,
  op: string,
  itemParams: IDataObject,
  cfg: ExecuteConfig,
  itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
  const sessionId = await cfg.getSessionId(ctx, itemIndex);
  const bodyXml =
    cfg.buildCustomBodyXml?.(op, itemParams, sessionId, ctx, itemIndex) ??
    defaultBodyXml(op, itemParams, sessionId, cfg.paramOrder, cfg.numericBooleans);

  const envelope = buildEnvelope(op, bodyXml);
  const soapAction = cfg.soapActionFor(op);
  
  try {
    const xml = await sendSoap(ctx, cfg.url, soapAction, envelope);
    const xmlObj = parseXml(xml);
    const { statusCode, statusMessage } = extractResultBase(xmlObj);
    
    // Pass resource name to error handler
    throwForSoapFaultOrStatus(xmlObj, op, cfg.url, soapAction, envelope, statusCode, statusMessage, cfg.resource);

    const result = cfg.parseResult(xml, op);
    
    // Add debug information if debug mode is enabled
    if (cfg.creds && DebugManager.shouldDebug(cfg.creds)) {
      const debugOutput = DebugManager.createDebugOutput(envelope, soapAction, cfg.url, xml);
      if (Array.isArray(result)) {
        // If result is an array, add debug info to first item
        if (result.length > 0 && result[0]) {
          Object.assign(result[0], debugOutput);
        }
      } else if (result) {
        // If result is a single object, add debug info
        Object.assign(result, debugOutput);
      }
    }

    return result;
  } catch (error) {
    // If debug mode is enabled and this is a PlunetOperationError, add debug info
    if (cfg.creds && DebugManager.shouldDebug(cfg.creds) && error instanceof Error) {
      const debugOutput = DebugManager.createDebugOutput(envelope, soapAction, cfg.url, '');
      
      // Create enhanced error with debug information
      const enhancedError = new Error(`${error.message}\n\nDebug Information:\n${JSON.stringify(debugOutput, null, 2)}`);
      enhancedError.name = error.name;
      enhancedError.stack = error.stack;
      throw enhancedError;
    }
    
    // Re-throw the original error if debug mode is not enabled
    throw error;
  }
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
