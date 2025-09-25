import {
  IExecuteFunctions,
  IDataObject,
  INodeProperties,
  INodePropertyOptions,
  ILoadOptionsFunctions,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import { extractStatusMessage, parseStringArrayResult, parseStringResult, parseVoidResult, parsePropertyResult } from '../core/xml';
import { PropertyUsageAreaOptions } from '../enums/property-usage-area';
import { TextModuleUsageAreaOptions } from '../enums/text-module-usage-area';
import { generateOperationOptionsFromRegistry } from '../core/service-utils';

const RESOURCE = 'DataCustomFields30';
const ENDPOINT = 'DataCustomFields30';
const RESOURCE_DISPLAY_NAME = 'Custom Fields (Beta)';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
  getPropertyList: {
    soapAction: 'getPropertyList',
    endpoint: ENDPOINT,
    uiName: 'Get Property List',
    subtitleName: 'get property list: custom fields',
    titleName: 'Get Property List',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Retrieve custom properties for a specific usage area',
    returnType: 'StringArray',
    paramOrder: ['usageArea'],
    active: true,
  },
  getProperty: {
    soapAction: 'getProperty',
    endpoint: ENDPOINT,
    uiName: 'Get Property',
    subtitleName: 'get property: custom fields',
    titleName: 'Get Property',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get a specific custom property value',
    returnType: 'Property',
    paramOrder: ['PropertyUsageArea', 'MainID', 'PropertyNameEnglish'],
    active: true,
  },
  getPropertyValueText: {
    soapAction: 'getPropertyValueText',
    endpoint: ENDPOINT,
    uiName: 'Get Property Value Text',
    subtitleName: 'get property value text: custom fields',
    titleName: 'Get Property Value Text',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get the text value for a specific property value ID',
    returnType: 'String',
    paramOrder: ['PropertyNameEnglish', 'PropertyValueID', 'languageCode'],
    active: true,
  },
  setPropertyValueList: {
    soapAction: 'setPropertyValueList',
    endpoint: ENDPOINT,
    uiName: 'Update Property',
    subtitleName: 'update property: custom fields',
    titleName: 'Update Property',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Update property values for a specific property',
    returnType: 'Void',
    paramOrder: ['PropertyUsageArea', 'MainID', 'PropertyNameEnglish', 'PropertyIDs'],
    active: true,
  },
  getTextModuleList: {
    soapAction: 'getTextModuleList',
    endpoint: ENDPOINT,
    uiName: 'Get Text Module List',
    subtitleName: 'get text module list: custom fields',
    titleName: 'Get Text Module List',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Retrieve text modules for a specific usage area',
    returnType: 'StringArray',
    paramOrder: ['usageArea'],
    active: true,
  },
  getTextModule: {
    soapAction: 'getTextModule',
    endpoint: ENDPOINT,
    uiName: 'Get Text Module',
    subtitleName: 'get text module: custom fields',
    titleName: 'Get Text Module',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get a specific text module content',
    returnType: 'String',
    paramOrder: ['usageArea', 'mainID', 'moduleName'],
    active: true,
  },
  setTextModule: {
    soapAction: 'setTextModule',
    endpoint: ENDPOINT,
    uiName: 'Set Text Module',
    subtitleName: 'set text module: custom fields',
    titleName: 'Set Text Module',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Set a text module content',
    returnType: 'Void',
    paramOrder: ['usageArea', 'mainID', 'moduleName', 'moduleContent'],
    active: true,
  },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
  Object.values(OPERATION_REGISTRY)
    .filter(op => op.active)
    .map(op => [op.soapAction, op.paramOrder])
);

type R = 'StringArray' | 'String' | 'Void' | 'Property';
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
  // Property Usage Area for property operations
  {
    displayName: 'Property Usage Area',
    name: 'PropertyUsageArea',
    type: 'options',
    options: PropertyUsageAreaOptions,
    default: 5,
    description: 'Select the usage area for custom properties',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getPropertyList', 'getProperty', 'setPropertyValueList'] 
      } 
    },
  },
  // Text Module Usage Area for text module operations
  {
    displayName: 'Text Module Usage Area',
    name: 'textModuleUsageArea',
    type: 'options',
    options: TextModuleUsageAreaOptions,
    default: 1,
    description: 'Select the usage area for text modules',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getTextModuleList', 'getTextModule', 'setTextModule'] 
      } 
    },
  },
  // Main ID field for operations that require it
  {
    displayName: 'Main ID',
    name: 'MainID',
    type: 'number',
    default: 0,
    typeOptions: { minValue: 0, step: 1 },
    description: 'The main ID for the selected usage area (see usage area label for ID type)',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getProperty', 'getTextModule', 'setTextModule', 'setPropertyValueList'] 
      } 
    },
  },
  // Property Name for getProperty and setPropertyValueList operations
  {
    displayName: 'Property Name',
    name: 'PropertyNameEnglish',
    type: 'options',
    typeOptions: {
      loadOptionsMethod: 'getAvailablePropertyNames',
      loadOptionsDependsOn: ['PropertyUsageArea', 'MainID'],
    },
    default: '',
    required: false,
    description: 'Select from available custom properties for the selected usage area and main ID. Make sure to set Usage Area and Main ID first.',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getProperty', 'setPropertyValueList'] 
      } 
    },
  },
  // Module Name for text module operations
  {
    displayName: 'Module Name',
    name: 'moduleName',
    type: 'string',
    default: '',
    description: 'The name of the text module',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getTextModule', 'setTextModule'] 
      } 
    },
  },
  // Module Content for set text module operation
  {
    displayName: 'Module Content',
    name: 'moduleContent',
    type: 'string',
    default: '',
    typeOptions: { rows: 4 },
    description: 'The content to set for the text module',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['setTextModule'] 
      } 
    },
  },
  // Property Name English for getPropertyValueText operation
  {
    displayName: 'Property Name English',
    name: 'PropertyNameEnglish',
    type: 'string',
    default: '',
    description: 'The English name of the property',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getPropertyValueText'] 
      } 
    },
  },
  // Property Value ID for getPropertyValueText operation
  {
    displayName: 'Property Value ID',
    name: 'PropertyValueID',
    type: 'number',
    default: 0,
    typeOptions: { minValue: 0, step: 1 },
    description: 'The ID of the property value to get text for',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getPropertyValueText'] 
      } 
    },
  },
  // Language Code for getPropertyValueText operation
  {
    displayName: 'Language Code',
    name: 'languageCode',
    type: 'string',
    default: 'EN',
    description: 'The language code for the property value text (e.g., EN, DE, FR)',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getPropertyValueText'] 
      } 
    },
  },
  // Property IDs for setPropertyValueList operation
  {
    displayName: 'Property IDs',
    name: 'PropertyIDs',
    type: 'string',
    default: '',
    typeOptions: { rows: 2 },
    description: 'Comma-separated list of property value IDs (e.g., "1,2,3,4" or single value "1")',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['setPropertyValueList'] 
      } 
    },
  },
];

function toSoapParamValue(raw: unknown, paramName: string): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'boolean') {
    return NUMERIC_BOOLEAN_PARAMS.has(paramName)
      ? (raw ? '1' : '0')
      : (raw ? 'true' : 'false');
  }
  return String(raw);
}

function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
  return {
    url,
    soapActionFor: (op: string) => `http://API.Integration/${op}`,
    paramOrder: PARAM_ORDER,
    numericBooleans: NUMERIC_BOOLEAN_PARAMS,
    getSessionId: async (ctx: IExecuteFunctions) => ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0),
    parseResult: (xml: string, op: string) => {
      const rt = RETURN_TYPE[op] as R | undefined;
      let payload: IDataObject;

      switch (rt) {
        case 'StringArray': {
          payload = parseStringArrayResult(xml);
          break;
        }
        case 'String': {
          if (op === 'getPropertyValueText') {
            // Special handling for getPropertyValueText to rename 'data' to 'PropertyValue'
            payload = parseStringResult(xml);
            if (payload.data) {
              payload.PropertyValue = payload.data;
              delete payload.data;
            }
          } else {
            payload = parseStringResult(xml);
          }
          break;
        }
        case 'Void': {
          payload = parseVoidResult(xml);
          break;
        }
        case 'Property': {
          payload = parsePropertyResult(xml);
          break;
        }
        default: {
          payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
        }
      }

      return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
    },
    // Special body XML generation for setPropertyValueList
    buildCustomBodyXml: (op: string, params: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
      if (op === 'setPropertyValueList') {
        // Parse PropertyIDs string into array
        const propertyIDsStr = String(params.PropertyIDs || '');
        const propertyIDs = propertyIDsStr
          .split(',')
          .map(id => id.trim())
          .filter(id => id && !isNaN(Number(id)))
          .map(id => Number(id));

        // Generate PropertyValueList XML
        const propertyValueListXml = propertyIDs
          .map(id => `<integerList>${id}</integerList>`)
          .join('\n');

        return `<UUID>${sessionId}</UUID>
         <PropertyNameEnglish>${toSoapParamValue(params.PropertyNameEnglish, 'PropertyNameEnglish')}</PropertyNameEnglish>
         <PropertyUsageArea>${toSoapParamValue(params.PropertyUsageArea, 'PropertyUsageArea')}</PropertyUsageArea>
         <PropertyValueList>
            ${propertyValueListXml}
         </PropertyValueList>
         <MainID>${toSoapParamValue(params.MainID, 'MainID')}</MainID>`;
      }
      return null; // Use default body XML generation
    },
  };
}

// Create execute config for DataAdmin30 service
function createAdminExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
  return {
    url,
    soapActionFor: (op: string) => `http://API.Integration/${op}`,
    paramOrder: { getAvailableProperties: ['usageArea', 'mainID'] },
    numericBooleans: NUMERIC_BOOLEAN_PARAMS,
    getSessionId: async (ctx: IExecuteFunctions) => ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0),
    parseResult: (xml: string, op: string) => {
      // Parse PropertyListResult for getAvailableProperties
      const base = extractResultBase(xml);
      
      // Look for PropertyListResult scope
      const propertyListResultScope = findFirstTagBlock(xml, 'PropertyListResult');
      if (!propertyListResultScope) {
        return { statusMessage: base.statusMessage, statusCode: base.statusCode };
      }
      
      // Extract all m_Data blocks
      const mDataMatches = propertyListResultScope.match(/<m_Data>[\s\S]*?<\/m_Data>/g);
      if (!mDataMatches) {
        return { statusMessage: base.statusMessage, statusCode: base.statusCode };
      }
      
      const propertyNames: string[] = [];
      
      mDataMatches.forEach(mDataBlock => {
        const propertyNameMatch = mDataBlock.match(/<propertyNameEnglish>(.*?)<\/propertyNameEnglish>/);
        if (propertyNameMatch && propertyNameMatch[1]) {
          propertyNames.push(propertyNameMatch[1]);
        }
      });
      
      return {
        propertyNames,
        statusMessage: base.statusMessage,
        statusCode: base.statusCode
      };
    },
  };
}

// Helper function to find first tag block
function findFirstTagBlock(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[0] : null;
}

// Helper function to extract result base
function extractResultBase(xml: string): { statusMessage?: string; statusCode?: number } {
  const statusCodeMatch = xml.match(/<statusCode>(.*?)<\/statusCode>/);
  const statusMessageMatch = xml.match(/<statusMessage>(.*?)<\/statusMessage>/);
  
  return {
    statusCode: statusCodeMatch ? parseInt(statusCodeMatch[1] || '0', 10) : undefined,
    statusMessage: statusMessageMatch ? statusMessageMatch[1] : undefined
  };
}

export const DataCustomFields30Service: Service = {
  resource: RESOURCE,
  resourceDisplayName: RESOURCE_DISPLAY_NAME,
  resourceDescription: 'Custom fields and text modules operations',
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
    
    // Add PropertyNameEnglish and PropertyValueID to result for getPropertyValueText operation
    if (operation === 'getPropertyValueText' && itemParams.PropertyNameEnglish) {
      const finalResult = Array.isArray(result) ? result[0] || {} : result;
      return { 
        ...finalResult, 
        PropertyNameEnglish: itemParams.PropertyNameEnglish,
        PropertyValueID: itemParams.PropertyValueID
      };
    }
    
    // Add PropertyNameEnglish to result for setPropertyValueList operation
    if (operation === 'setPropertyValueList' && itemParams.PropertyNameEnglish) {
      const finalResult = Array.isArray(result) ? result[0] || {} : result;
      return { 
        ...finalResult, 
        PropertyNameEnglish: itemParams.PropertyNameEnglish,
        PropertyIDs: itemParams.PropertyIDs
      };
    }
    
    return Array.isArray(result) ? result[0] || {} : result;
  },
};
