import {
    IExecuteFunctions,
    IDataObject,
    INodeProperties,
    INodePropertyOptions,
    NodeOperationError,
  } from 'n8n-workflow';
  import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
  import { ensureSession } from '../core/session';
  import { executeOperation, type ExecuteConfig } from '../core/executor';
  import { labelize } from '../core/utils';
  import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
  import { extractStatusMessage } from '../core/xml';
  import { parsePriceLineResult, parsePriceLineListResult, parsePriceUnitResult, parsePriceUnitListResult } from '../core/parsers/job';
  import { parsePricelistResult, parsePricelistListResult, parsePricelistEntryListResult } from '../core/parsers/pricelist';
  import { CurrencyTypeOptions } from '../enums/currency-type';
  import { ProjectTypeOptions } from '../enums/project-type';
  import { TaxTypeOptions } from '../enums/tax-type';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  
  const RESOURCE = 'DataItem30Prices';
  const ENDPOINT = 'DataItem30';
  const RESOURCE_DISPLAY_NAME = 'Item Prices';
  
  /** ─ Centralized Operation Registry ─ */
  const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // ── Active ops ──
    getPriceLines: {
      soapAction: 'getPriceLine_List',
      endpoint: ENDPOINT,
      uiName: 'Get Price Lines',
      subtitleName: 'get price lines: item',
      titleName: 'Get Price Lines',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve price lines for an item',
      returnType: 'PriceLineList',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    getPriceLinesByCurrency: {
      soapAction: 'getPriceLine_ListByCurrency',
      endpoint: ENDPOINT,
      uiName: 'Get Price Lines (by Currency)',
      subtitleName: 'get price lines by currency: item',
      titleName: 'Get Price Lines by Currency',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve price lines for an item by currency type',
      returnType: 'PriceLineList',
      paramOrder: ['itemID', 'projectType', 'currencyType'],
      active: true,
    },
    insertPriceLine: {
      soapAction: 'insertPriceLine',
      endpoint: ENDPOINT,
      uiName: 'Create Price Line',
      subtitleName: 'create price line: item',
      titleName: 'Create Price Line',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create a new price line in an item',
      returnType: 'PriceLine',
      paramOrder: ['itemID', 'projectType', 'amount', 'amount_perUnit', 'priceUnitID', 'unit_price', 'taxType', 'createAsFirstItem'],
      active: true,
    },
    updatePriceLine: {
      soapAction: 'updatePriceLine',
      endpoint: ENDPOINT,
      uiName: 'Update Price Line',
      subtitleName: 'update price line: item',
      titleName: 'Update Price Line',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update an existing price line',
      returnType: 'PriceLine',
      paramOrder: ['itemID', 'projectType', 'priceLineID', 'amount', 'amount_perUnit', 'priceUnitID', 'unit_price', 'taxType'],
      active: true,
    },
    deletePriceLine: {
      soapAction: 'deletePriceLine',
      endpoint: ENDPOINT,
      uiName: 'Delete Price Line',
      subtitleName: 'delete price line: item',
      titleName: 'Delete Price Line',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Delete a price line from an item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType', 'priceLineID'],
      active: true,
    },
    getPricelist: {
      soapAction: 'getPricelist',
      endpoint: ENDPOINT,
      uiName: 'Get Pricelist',
      subtitleName: 'get pricelist: item',
      titleName: 'Get Pricelist',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve the pricelist for an item',
      returnType: 'Pricelist',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    setPricelist: {
      soapAction: 'setPricelist',
      endpoint: ENDPOINT,
      uiName: 'Update Pricelist ID',
      subtitleName: 'update pricelistid: item',
      titleName: 'Update Pricelist ID',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update the pricelist ID for an item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType', 'priceListID'],
      active: true,
    },
    getPricelists: {
      soapAction: 'getPricelist_List',
      endpoint: ENDPOINT,
      uiName: 'Get all available Pricelists (Item)',
      subtitleName: 'get availablepricelists item: item',
      titleName: 'Get all available Pricelists for Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all available pricelists for an item',
      returnType: 'PricelistList',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    getPricelistEntries: {
      soapAction: 'getPricelistEntry_List',
      endpoint: ENDPOINT,
      uiName: 'Get all Pricelist Entries',
      subtitleName: 'get all pricelist entries: item',
      titleName: 'Get all Pricelist Entries',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all pricelist entries for a pricelist',
      returnType: 'PricelistEntryList',
      paramOrder: ['pricelistID', 'sourceLanguage', 'targetLanguage'],
      active: true,
    },
    getPriceUnits: {
      soapAction: 'getPriceUnit_List',
      endpoint: ENDPOINT,
      uiName: 'Get all available Price Units',
      subtitleName: 'get all available price units: item',
      titleName: 'Get all available Price Units',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all available price units',
      returnType: 'PriceUnitList',
      paramOrder: ['languageCode', 'service'],
      active: true,
    },
    getPriceUnit: {
      soapAction: 'getPriceUnit',
      endpoint: ENDPOINT,
      uiName: 'Get Price Unit',
      subtitleName: 'get price unit: item',
      titleName: 'Get Price Unit',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve a specific price unit',
      returnType: 'PriceUnit',
      paramOrder: ['PriceUnitID', 'languageCode'],
      active: true,
    },
    updatePrices: {
      soapAction: 'updatePrices',
      endpoint: ENDPOINT,
      uiName: 'Update Prices from Pricelist',
      subtitleName: 'update prices from pricelist: item',
      titleName: 'Update Prices from Pricelist',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Apply prices from the pricelist currently set in the item to all price lines of the item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
  };
  
  /** ─ Derived mappings (actives only) ─ */
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
  );
  
  type R =
    | 'Void'
    | 'PriceLine'
    | 'PriceLineList'
    | 'PriceUnit'
    | 'PriceUnitList'
    | 'Pricelist'
    | 'PricelistList'
    | 'PricelistEntryList';
  
  const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType as R])
  );
  
  /** ─ UI wiring (lean) ─ */
  const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
  const isCurrencyTypeParam = (op: string, p: string) => op === 'getPriceLine_ListByCurrency' && p === 'currencyType';
  const isTaxTypeParam = (op: string, p: string) => (op === 'insertPriceLine' || op === 'updatePriceLine') && p === 'taxType';
  const isBooleanFlagParam = (op: string, p: string) => op === 'insertPriceLine' && p === 'createAsFirstItem';
  const NUMERIC_PARAM_NAMES = new Set(['itemID', 'projectID', 'resourceID', 'priceLineID', 'priceUnitID', 'priceListID', 'pricelistID', 'projectId']);
  const isNumericParam = (p: string) => NUMERIC_PARAM_NAMES.has(p);
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    // Standard properties for all ops
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      params.map<INodeProperties>(p => {
        if (isProjectTypeParam(p))
          return { displayName: 'Project Type', name: p, type: 'options', options: ProjectTypeOptions, default: 3, description: `${p} parameter for ${op} (ProjectType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isCurrencyTypeParam(op, p))
          return { displayName: 'Currency Type', name: p, type: 'options', options: CurrencyTypeOptions, default: 1, description: `${p} parameter for ${op} (CurrencyType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isTaxTypeParam(op, p))
          return { displayName: 'Tax Type', name: p, type: 'options', options: TaxTypeOptions, default: 0, description: `${p} parameter for ${op} (TaxType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isBooleanFlagParam(op, p))
          return { displayName: p, name: p, type: 'boolean', default: false, description: `${p} parameter for ${op} (boolean)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (p === 'languageCode')
          return { displayName: 'Language Code', name: p, type: 'string', default: 'EN', description: `${p} parameter for ${op} (defaults to EN)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isNumericParam(p))
          return { displayName: p, name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
      })
    ),
  
    // Collections for price line ops only
    ...(['insertPriceLine', 'updatePriceLine'] as const).map(op => ({
      displayName: 'Additional Fields',
      name: 'additionalFields',
      type: 'collection' as const,
      placeholder: 'Add Field',
      default: {},
      options: (op === 'insertPriceLine'
        ? [
            { displayName: labelize('memo'), name: 'memo', type: 'string' as const, default: '' },
            { displayName: labelize('priceLineID'), name: 'priceLineID', type: 'number' as const, default: 0, typeOptions: { minValue: 0, step: 1 } },
            { displayName: labelize('time_perUnit'), name: 'time_perUnit', type: 'string' as const, default: '' },
          ]
        : [
            { displayName: labelize('memo'), name: 'memo', type: 'string' as const, default: '' },
            { displayName: labelize('time_perUnit'), name: 'time_perUnit', type: 'string' as const, default: '' },
          ]
      ),
      description: 'Additional price line fields (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
    })),
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
        if (op === 'insertPriceLine') {
          const itemID = itemParams.itemID as number;
          const projectType = itemParams.projectType as number;
          const amount = itemParams.amount as number;
          const amount_perUnit = itemParams.amount_perUnit as number;
          const priceUnitID = itemParams.priceUnitID as number;
          const unit_price = itemParams.unit_price as number;
          const taxType = itemParams.taxType as number;
          const createAsFirstItem = itemParams.createAsFirstItem as boolean;
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          const selected = Object.keys(additionalFields).filter(k => additionalFields[k] !== '' && additionalFields[k] != null);
          let priceLineInXml = '<priceLineIN>';
          priceLineInXml += `<amount>${escapeXml(String(amount))}</amount>`;
          priceLineInXml += `<amount_perUnit>${escapeXml(String(amount_perUnit))}</amount_perUnit>`;
          priceLineInXml += `<priceUnitID>${escapeXml(String(priceUnitID))}</priceUnitID>`;
          priceLineInXml += `<taxType>${escapeXml(String(taxType))}</taxType>`;
          priceLineInXml += `<unit_price>${escapeXml(String(unit_price))}</unit_price>`;
          selected.forEach(key => {
            const value = additionalFields[key];
            const xmlValue = toSoapParamValue(value, key);
            priceLineInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
          });
          priceLineInXml += '</priceLineIN>';
          return `<UUID>${escapeXml(sessionId)}</UUID>\n<itemID>${escapeXml(String(itemID))}</itemID>\n<projectType>${escapeXml(String(projectType))}</projectType>\n${priceLineInXml}\n<createAsFirstItem>${createAsFirstItem ? '1' : '0'}</createAsFirstItem>`;
        }
        if (op === 'updatePriceLine') {
          const itemID = itemParams.itemID as number;
          const projectType = itemParams.projectType as number;
          const priceLineID = itemParams.priceLineID as number;
          const amount = itemParams.amount as number;
          const amount_perUnit = itemParams.amount_perUnit as number;
          const priceUnitID = itemParams.priceUnitID as number;
          const unit_price = itemParams.unit_price as number;
          const taxType = itemParams.taxType as number;
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          const selected = Object.keys(additionalFields).filter(k => additionalFields[k] !== '' && additionalFields[k] != null);
          let priceLineInXml = '<priceLineIN>';
          priceLineInXml += `<priceLineID>${escapeXml(String(priceLineID))}</priceLineID>`;
          priceLineInXml += `<amount>${escapeXml(String(amount))}</amount>`;
          priceLineInXml += `<amount_perUnit>${escapeXml(String(amount_perUnit))}</amount_perUnit>`;
          priceLineInXml += `<priceUnitID>${escapeXml(String(priceUnitID))}</priceUnitID>`;
          priceLineInXml += `<taxType>${escapeXml(String(taxType))}</taxType>`;
          priceLineInXml += `<unit_price>${escapeXml(String(unit_price))}</unit_price>`;
          selected.forEach(key => {
            const value = additionalFields[key];
            const xmlValue = toSoapParamValue(value, key);
            priceLineInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
          });
          priceLineInXml += '</priceLineIN>';
          return `<UUID>${escapeXml(sessionId)}</UUID>\n<itemID>${escapeXml(String(itemID))}</itemID>\n<projectType>${escapeXml(String(projectType))}</projectType>\n${priceLineInXml}`;
        }
        return null;
      },
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op] as R | undefined;
        let payload: IDataObject;
        switch (rt) {
          case 'PriceLine': {
            const r = parsePriceLineResult(xml);
            payload = { priceLine: r.priceLine, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'PriceLineList': {
            const r = parsePriceLineListResult(xml);
            payload = { priceLines: r.priceLines, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'PriceUnit': {
            const r = parsePriceUnitResult(xml);
            payload = { priceUnit: r.priceUnit, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'PriceUnitList': {
            const r = parsePriceUnitListResult(xml);
            payload = { priceUnits: r.priceUnits, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'Pricelist': {
            const r = parsePricelistResult(xml);
            payload = { pricelist: r.pricelist, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'PricelistList': {
            const r = parsePricelistListResult(xml);
            payload = { pricelists: r.pricelists, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'PricelistEntryList': {
            const r = parsePricelistEntryListResult(xml);
            payload = { pricelistEntries: r.entries, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'Void': {
            const ok = /<StatusCode>\s*0\s*<\/StatusCode>/.test(xml);
            if (!ok) {
              const msg = extractStatusMessage(xml) || 'Operation failed';
              throw new NodeOperationError({} as any, `${op}: ${msg}`, { itemIndex: 0 });
            }
            payload = { ok, statusMessage: extractStatusMessage(xml) };
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
  export const DataItem30PricesService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Non-Core operations for Prices in DataItem30',
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
