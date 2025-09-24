import {
  IExecuteFunctions,
  IDataObject,
  INodeProperties,
  INodePropertyOptions,
  NodeOperationError,
  IBinaryData,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import { extractStatusMessage, parseStringArrayResult, parseFileResult } from '../core/xml';
import { FolderTypeOptions, getMainIdFieldName } from '../enums/folder-types';
import { generateOperationOptionsFromRegistry } from '../core/service-utils';

const RESOURCE = 'DataDocument30';
const ENDPOINT = 'DataDocument30';
const RESOURCE_DISPLAY_NAME = 'Files';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
  getFileList: {
    soapAction: 'getFileList',
    endpoint: ENDPOINT,
    uiName: 'Get File List',
    subtitleName: 'get file list: files',
    titleName: 'Get File List',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Retrieve files for a defined folder',
    returnType: 'StringArray',
    paramOrder: ['folderType', 'mainID'],
    active: true,
  },
  downloadDocument: {
    soapAction: 'download_Document',
    endpoint: ENDPOINT,
    uiName: 'Download Document',
    subtitleName: 'download document: files',
    titleName: 'Download Document',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Download a specific document from a folder',
    returnType: 'File',
    paramOrder: ['folderType', 'mainID', 'filePathName'],
    active: true,
  },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
  Object.values(OPERATION_REGISTRY)
    .filter(op => op.active)
    .map(op => [op.soapAction, op.paramOrder])
);

type R = 'StringArray' | 'File';
const RETURN_TYPE: Record<string, R> = Object.fromEntries(
  Object.values(OPERATION_REGISTRY)
    .filter(op => op.active)
    .map(op => [op.soapAction, op.returnType as R])
);

/** ────────────────────────────────────────────────────────────────────────────
 * UI wiring
 * ─────────────────────────────────────────────────────────────────────────── */
const operationOptions: NonEmptyArray<INodePropertyOptions> =
  generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

const extraProperties: INodeProperties[] = [
  // Folder Type selection
  {
    displayName: 'Folder Type',
    name: 'folderType',
    type: 'options',
    options: FolderTypeOptions,
    default: 1,
    description: 'Select the type of folder to get files from',
    displayOptions: { show: { resource: [RESOURCE], operation: ['getFileList', 'download_Document'] } },
  },
  // Dynamic Main ID field based on folder type
  {
    displayName: 'Main ID (Job ID, Order ID, Customer ID, etc.)',
    name: 'mainID',
    type: 'number',
    default: 0,
    typeOptions: { minValue: 0, step: 1 },
    description: 'The main ID for the selected folder type. The label changes based on folder type: Job ID for Order Job Out, Order ID for Order Reference, Customer ID for Customer, etc.',
    displayOptions: { show: { resource: [RESOURCE], operation: ['getFileList', 'download_Document'] } },
  },
  // File Path Name for download
  {
    displayName: 'File Path Name',
    name: 'filePathName',
    type: 'string',
    default: '',
    description: 'The path and name of the file to download (e.g., \\test.txt)',
    displayOptions: { show: { resource: [RESOURCE], operation: ['download_Document'] } },
  },
];

function toSoapParamValue(raw: unknown, paramName: string): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'boolean') return NUMERIC_BOOLEAN_PARAMS.has(paramName) ? (raw ? '1' : '0') : raw ? 'true' : 'false';
  return String(raw);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
  return {
    url,
    soapActionFor: (op: string) => `http://API.Integration/${op}`,
    paramOrder: PARAM_ORDER,
    numericBooleans: NUMERIC_BOOLEAN_PARAMS,
    getSessionId: async (ctx: IExecuteFunctions) => ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0),
    buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
      if (op === 'getFileList') {
        const folderType = itemParams.folderType as number;
        const mainID = itemParams.mainID as number;
        
        return `<UUID>${escapeXml(sessionId)}</UUID>
<MainID>${escapeXml(String(mainID))}</MainID>
<FolderType>${escapeXml(String(folderType))}</FolderType>`;
      } else if (op === 'download_Document') {
        const folderType = itemParams.folderType as number;
        const mainID = itemParams.mainID as number;
        const filePathName = itemParams.filePathName as string;
        
        return `<UUID>${escapeXml(sessionId)}</UUID>
<MainID>${escapeXml(String(mainID))}</MainID>
<FolderType>${escapeXml(String(folderType))}</FolderType>
<FilePathName>${escapeXml(filePathName)}</FilePathName>`;
      }
      return null;
    },
    parseResult: (xml: string, op: string) => {
      const rt = RETURN_TYPE[op] as R | undefined;
      let payload: IDataObject;

      switch (rt) {
        case 'StringArray': {
          const r = parseStringArrayResult(xml);
          payload = { files: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
          break;
        }
        case 'File': {
          const r = parseFileResult(xml);
          payload = { 
            fileContent: r.fileContent, 
            fileSize: r.fileSize, 
            filename: r.filename, 
            statusMessage: r.statusMessage, 
            statusCode: r.statusCode 
          };
          break;
        }
        default: {
          payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
        }
      }

      return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
    },
  };
}

/** ─ Service export ─ */
export const DataDocument30Service: Service = {
  resource: RESOURCE,
  resourceDisplayName: RESOURCE_DISPLAY_NAME,
  resourceDescription: 'File and document operations',
  endpoint: ENDPOINT,
  operationRegistry: OPERATION_REGISTRY,
  operationOptions,
  extraProperties,
  async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
    const paramNames = PARAM_ORDER[operation];
    if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
    const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
    const itemParams: IDataObject = {};
    for (const paramName of paramNames) itemParams[paramName] = ctx.getNodeParameter(paramName, itemIndex, '');
    const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
    return Array.isArray(result) ? result[0] || {} : result;
  },
};
