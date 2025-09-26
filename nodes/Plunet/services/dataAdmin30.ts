import {
  IExecuteFunctions,
  IDataObject,
  INodeProperties,
  INodePropertyOptions,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import { extractStatusMessage, parseStringArrayResult } from '../core/xml';
import { PropertyUsageAreaOptions } from '../enums/property-usage-area';
import { TextModuleUsageAreaOptions } from '../enums/text-module-usage-area';
import { getWorkflowTypeName } from '../enums/workflow-type';
import { getWorkflowStatusName } from '../enums/workflow-status';
import { generateOperationOptionsFromRegistry } from '../core/service-utils';

const RESOURCE = 'DataAdmin30';
const ENDPOINT = 'DataAdmin30';
const RESOURCE_DISPLAY_NAME = 'Admin';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
  getAvailableProperties: {
    soapAction: 'getAvailableProperties',
    endpoint: ENDPOINT,
    uiName: 'Get Available Properties',
    subtitleName: 'get available properties: admin',
    titleName: 'Get Available Properties',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get available custom properties for a specific usage area and main ID',
    returnType: 'StringArray',
    paramOrder: ['PropertyUsageArea', 'MainID'],
    active: true,
  },
  getAvailableTextModules: {
    soapAction: 'getAvailableTextModules',
    endpoint: ENDPOINT,
    uiName: 'Get Available Text Modules',
    subtitleName: 'get available text modules: admin',
    titleName: 'Get Available Text Modules',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get available text modules for a specific usage area and main ID',
    returnType: 'StringArray',
    paramOrder: ['textModuleUsageArea', 'MainID', 'languageCode'],
    active: true,
  },
  getAvailableCountries: {
    soapAction: 'getAvailableCountries',
    endpoint: ENDPOINT,
    uiName: 'Get Available Countries',
    subtitleName: 'get available countries: admin',
    titleName: 'Get Available Countries',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get available countries list',
    returnType: 'StringArray',
    paramOrder: ['languageCode'],
    active: true,
  },
  getAvailableLanguages: {
    soapAction: 'getAvailableLanguages',
    endpoint: ENDPOINT,
    uiName: 'Get Available Languages',
    subtitleName: 'get available languages: admin',
    titleName: 'Get Available Languages',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get available languages list',
    returnType: 'StringArray',
    paramOrder: ['languageCode'],
    active: true,
  },
  getAvailableWorkflows: {
    soapAction: 'getAvailableWorkflows',
    endpoint: ENDPOINT,
    uiName: 'Get Available Workflows',
    subtitleName: 'get available workflows: admin',
    titleName: 'Get Available Workflows',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get available workflows list',
    returnType: 'StringArray',
    paramOrder: [],
    active: true,
  },
  getSystemCurrencies: {
    soapAction: 'getSystemCurrencies',
    endpoint: ENDPOINT,
    uiName: 'Get System Currencies',
    subtitleName: 'get system currencies: admin',
    titleName: 'Get System Currencies',
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    description: 'Get system currencies list',
    returnType: 'StringArray',
    paramOrder: [],
    active: true,
  },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
  Object.values(OPERATION_REGISTRY)
    .filter(op => op.active)
    .map(op => [op.soapAction, op.paramOrder])
);

type R = 'StringArray';
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
  // Property Usage Area
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
        operation: ['getAvailableProperties'] 
      } 
    },
  },
  // Text Module Usage Area
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
        operation: ['getAvailableTextModules'] 
      } 
    },
  },
  // Main ID field
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
        operation: ['getAvailableProperties', 'getAvailableTextModules'] 
      } 
    },
  },
  // Language Code for text modules, countries, and languages
  {
    displayName: 'Language Code',
    name: 'languageCode',
    type: 'string',
    default: 'EN',
    description: 'The language code for text modules, countries, and languages (e.g., EN, DE, FR)',
    displayOptions: { 
      show: { 
        resource: [RESOURCE], 
        operation: ['getAvailableTextModules', 'getAvailableCountries', 'getAvailableLanguages'] 
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
          if (op === 'getAvailableProperties') {
            payload = parsePropertyNamesArray(xml);
          } else if (op === 'getAvailableTextModules') {
            payload = parseTextModuleFlagsArray(xml);
          } else if (op === 'getAvailableCountries') {
            payload = parseCountriesArray(xml);
          } else if (op === 'getAvailableLanguages') {
            payload = parseLanguagesArray(xml);
          } else if (op === 'getAvailableWorkflows') {
            payload = parseWorkflowsArray(xml);
          } else if (op === 'getSystemCurrencies') {
            payload = parseCurrenciesArray(xml);
          } else {
            payload = parseStringArrayResult(xml);
          }
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

// Parse PropertyListResult to extract property names as StringArray
function parsePropertyNamesArray(xml: string): IDataObject {
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
    
    // Return as StringArray format (same as parseStringArrayResult)
    return {
        data: propertyNames,
        statusMessage: base.statusMessage,
        statusCode: base.statusCode
    };
}

// Parse TextmoduleListResult to extract text module flags and labels
function parseTextModuleFlagsArray(xml: string): IDataObject {
    const base = extractResultBase(xml);
    
    // Look for TextmoduleListResult scope
    const textmoduleListResultScope = findFirstTagBlock(xml, 'TextmoduleListResult');
    if (!textmoduleListResultScope) {
        return { statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    // Extract all data blocks
    const dataMatches = textmoduleListResultScope.match(/<data>[\s\S]*?<\/data>/g);
    if (!dataMatches) {
        return { statusMessage: base.statusMessage, statusCode: base.statusCode };
    }
    
    const textModuleOptions: string[] = [];
    
    dataMatches.forEach(dataBlock => {
        const flagMatch = dataBlock.match(/<flag>(.*?)<\/flag>/);
        const labelMatch = dataBlock.match(/<textModuleLabel>(.*?)<\/textModuleLabel>/);
        
        if (flagMatch && flagMatch[1] && labelMatch && labelMatch[1]) {
            const flag = flagMatch[1];
            const label = labelMatch[1];
            // Format: "[Textmodule2] - Nickname"
            textModuleOptions.push(`${flag} - ${label}`);
        }
    });
    
    // Return as StringArray format
    return {
        data: textModuleOptions,
        statusMessage: base.statusMessage,
        statusCode: base.statusCode
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

// Parse CountryListResult to extract countries as structured data
function parseCountriesArray(xml: string): IDataObject {
  const base = extractResultBase(xml);
  
  // Look for CountryListResult scope
  const countryListResultScope = findFirstTagBlock(xml, 'CountryListResult');
  if (!countryListResultScope) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  // Extract all data blocks
  const dataMatches = countryListResultScope.match(/<data>[\s\S]*?<\/data>/g);
  if (!dataMatches) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  const countries: Array<{ID: number, isoCode: string, name: string}> = [];
  
  dataMatches.forEach(dataBlock => {
    const idMatch = dataBlock.match(/<ID>(.*?)<\/ID>/);
    const isoCodeMatch = dataBlock.match(/<isoCode>(.*?)<\/isoCode>/);
    const nameMatch = dataBlock.match(/<name>(.*?)<\/name>/);
    
    if (idMatch && idMatch[1] && nameMatch && nameMatch[1]) {
      countries.push({
        ID: parseInt(idMatch[1], 10),
        isoCode: isoCodeMatch && isoCodeMatch[1] ? isoCodeMatch[1] : '',
        name: nameMatch[1]
      });
    }
  });
  
  return {
    statusMessage: base.statusMessage,
    statusCode: base.statusCode,
    countries: countries
  };
}

// Parse LanguageListResult to extract languages as structured data
function parseLanguagesArray(xml: string): IDataObject {
  const base = extractResultBase(xml);
  
  // Look for LanguageListResult scope
  const languageListResultScope = findFirstTagBlock(xml, 'LanguageListResult');
  if (!languageListResultScope) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  // Extract all data blocks
  const dataMatches = languageListResultScope.match(/<data>[\s\S]*?<\/data>/g);
  if (!dataMatches) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  const languages: Array<{
    active: boolean,
    favorite: boolean,
    folderName: string,
    id: number,
    isoCode: string,
    name: string
  }> = [];
  
  dataMatches.forEach(dataBlock => {
    const activeMatch = dataBlock.match(/<active>(.*?)<\/active>/);
    const favoriteMatch = dataBlock.match(/<favorite>(.*?)<\/favorite>/);
    const folderNameMatch = dataBlock.match(/<folderName>(.*?)<\/folderName>/);
    const idMatch = dataBlock.match(/<id>(.*?)<\/id>/);
    const isoCodeMatch = dataBlock.match(/<isoCode>(.*?)<\/isoCode>/);
    const nameMatch = dataBlock.match(/<name>(.*?)<\/name>/);
    
    if (idMatch && idMatch[1] && nameMatch && nameMatch[1]) {
      languages.push({
        active: activeMatch && activeMatch[1] ? activeMatch[1].toLowerCase() === 'true' : false,
        favorite: favoriteMatch && favoriteMatch[1] ? favoriteMatch[1].toLowerCase() === 'true' : false,
        folderName: folderNameMatch && folderNameMatch[1] ? folderNameMatch[1] : '',
        id: parseInt(idMatch[1], 10),
        isoCode: isoCodeMatch && isoCodeMatch[1] ? isoCodeMatch[1] : '',
        name: nameMatch[1]
      });
    }
  });
  
  return {
    statusMessage: base.statusMessage,
    statusCode: base.statusCode,
    languages: languages
  };
}

// Parse WorkflowListResult to extract workflows as structured data
function parseWorkflowsArray(xml: string): IDataObject {
  const base = extractResultBase(xml);
  
  // Look for WorkflowListResult scope
  const workflowListResultScope = findFirstTagBlock(xml, 'WorkflowListResult');
  if (!workflowListResultScope) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  // Extract all data blocks
  const dataMatches = workflowListResultScope.match(/<data>[\s\S]*?<\/data>/g);
  if (!dataMatches) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  const workflows: Array<{
    description: string,
    name: string,
    status: number,
    statusLabel: string,
    type: number,
    typeLabel: string,
    workflowId: number
  }> = [];
  
  dataMatches.forEach(dataBlock => {
    const descriptionMatch = dataBlock.match(/<description>(.*?)<\/description>/);
    const nameMatch = dataBlock.match(/<name>(.*?)<\/name>/);
    const statusMatch = dataBlock.match(/<status>(.*?)<\/status>/);
    const typeMatch = dataBlock.match(/<type>(.*?)<\/type>/);
    const workflowIdMatch = dataBlock.match(/<workflowId>(.*?)<\/workflowId>/);
    
    if (nameMatch && nameMatch[1] && workflowIdMatch && workflowIdMatch[1]) {
      const status = statusMatch && statusMatch[1] ? parseInt(statusMatch[1], 10) : 0;
      const type = typeMatch && typeMatch[1] ? parseInt(typeMatch[1], 10) : 0;
      
      workflows.push({
        description: descriptionMatch && descriptionMatch[1] ? descriptionMatch[1] : '',
        name: nameMatch[1],
        status: status,
        statusLabel: getWorkflowStatusName(status),
        type: type,
        typeLabel: getWorkflowTypeName(type),
        workflowId: parseInt(workflowIdMatch[1], 10)
      });
    }
  });
  
  return {
    statusMessage: base.statusMessage,
    statusCode: base.statusCode,
    workflows: workflows
  };
}

// Parse CurrencyListResult to extract currencies as structured data
function parseCurrenciesArray(xml: string): IDataObject {
  const base = extractResultBase(xml);
  
  // Look for CurrencyListResult scope
  const currencyListResultScope = findFirstTagBlock(xml, 'CurrencyListResult');
  if (!currencyListResultScope) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  // Extract all data blocks
  const dataMatches = currencyListResultScope.match(/<data>[\s\S]*?<\/data>/g);
  if (!dataMatches) {
    return { statusMessage: base.statusMessage, statusCode: base.statusCode };
  }
  
  const currencies: Array<{
    currencyID: number,
    description: string,
    isoCode: string
  }> = [];
  
  dataMatches.forEach(dataBlock => {
    const currencyIDMatch = dataBlock.match(/<currencyID>(.*?)<\/currencyID>/);
    const descriptionMatch = dataBlock.match(/<description>(.*?)<\/description>/);
    const isoCodeMatch = dataBlock.match(/<isoCode>(.*?)<\/isoCode>/);
    
    if (currencyIDMatch && currencyIDMatch[1] && descriptionMatch && descriptionMatch[1]) {
      currencies.push({
        currencyID: parseInt(currencyIDMatch[1], 10),
        description: descriptionMatch[1],
        isoCode: isoCodeMatch && isoCodeMatch[1] ? isoCodeMatch[1] : ''
      });
    }
  });
  
  return {
    statusMessage: base.statusMessage,
    statusCode: base.statusCode,
    currencies: currencies
  };
}

export const DataAdmin30Service: Service = {
  resource: RESOURCE,
  resourceDisplayName: RESOURCE_DISPLAY_NAME,
  resourceDescription: 'Admin operations for property discovery',
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
