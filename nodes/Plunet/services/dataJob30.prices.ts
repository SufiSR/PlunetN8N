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
  import { extractStatusMessage, parseVoidResult } from '../core/xml';
  import { parseJobMetricResult, parsePriceLineResult, parsePriceLineListResult, parsePriceUnitResult, parsePriceUnitListResult } from '../core/parsers/job';
  import { parsePricelistResult, parsePricelistListResult, parsePricelistEntryListResult } from '../core/parsers/pricelist';
  import { CurrencyTypeOptions } from '../enums/currency-type';
  import { ProjectTypeOptions } from '../enums/project-type';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  
  const RESOURCE = 'DataJob30Prices';
  const ENDPOINT = 'DataJob30';
  const RESOURCE_DISPLAY_NAME = 'Job Prices';
  
  /** ─ Centralized Operation Registry ─ */
  const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // ── Active ops ──
    getJobMetrics: {
      soapAction: 'getJobMetrics',
      endpoint: ENDPOINT,
      uiName: 'Get Job Metrics',
      subtitleName: 'get job metrics: job',
      titleName: 'Get Job Metrics',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve metrics for a job',
      returnType: 'JobMetric',
      paramOrder: ['jobID', 'projectType', 'languageCode'],
      active: true,
    },
    getPriceLines: {
      soapAction: 'getPriceLine_List',
      endpoint: ENDPOINT,
      uiName: 'Get Price Lines',
      subtitleName: 'get price lines: job',
      titleName: 'Get Price Lines',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve price lines for a job',
      returnType: 'PriceLineList',
      paramOrder: ['jobID', 'projectType'],
      active: true,
    },
    getPriceLinesByCurrency: {
      soapAction: 'getPriceLine_ListByCurrencyType',
      endpoint: ENDPOINT,
      uiName: 'Get Price Lines (by Currency)',
      subtitleName: 'get price lines by currency: job',
      titleName: 'Get Price Lines by Currency',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve price lines for a job by currency type',
      returnType: 'PriceLineList',
      paramOrder: ['jobID', 'projectType', 'currencyType'],
      active: true,
    },
    insertPriceLine: {
      soapAction: 'insertPriceLine',
      endpoint: ENDPOINT,
      uiName: 'Create Price Line',
      subtitleName: 'create price line: job',
      titleName: 'Create Price Line',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create a new price line in a job',
      returnType: 'PriceLine',
      paramOrder: ['jobID', 'projectType', 'amount', 'amount_perUnit', 'priceUnitID', 'unit_price', 'taxType', 'createAsFirstItem'],
      active: true,
    },
    updatePriceLine: {
      soapAction: 'updatePriceLine',
      endpoint: ENDPOINT,
      uiName: 'Update Price Line',
      subtitleName: 'update price line: job',
      titleName: 'Update Price Line',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update an existing price line',
      returnType: 'PriceLine',
      paramOrder: ['jobID', 'projectType', 'priceLineID', 'amount', 'amount_perUnit', 'priceUnitID', 'unit_price', 'taxType'],
      active: true,
    },
    deletePriceLine: {
      soapAction: 'deletePriceLine',
      endpoint: ENDPOINT,
      uiName: 'Delete Price Line',
      subtitleName: 'delete price line: job',
      titleName: 'Delete Price Line',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Delete a price line from a job',
      returnType: 'Void',
      paramOrder: ['jobID', 'projectType', 'priceLineID'],
      active: true,
    },
    getPricelist: {
      soapAction: 'getPricelist',
      endpoint: ENDPOINT,
      uiName: 'Get Pricelist',
      subtitleName: 'get pricelist: job',
      titleName: 'Get Pricelist',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve the pricelist for a job',
      returnType: 'Pricelist',
      paramOrder: ['jobID', 'projectType'],
      active: true,
    },
    setPricelist: {
      soapAction: 'setPricelist',
      endpoint: ENDPOINT,
      uiName: 'Update Pricelist ID',
      subtitleName: 'update pricelistid: job',
      titleName: 'Update Pricelist ID',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update the pricelist ID for a job',
      returnType: 'Void',
      paramOrder: ['jobID', 'projectType', 'priceListID'],
      active: true,
    },
    getPricelists: {
      soapAction: 'getPricelist_List',
      endpoint: ENDPOINT,
      uiName: 'Get all available Pricelists (Job)',
      subtitleName: 'get availablepricelists job: job',
      titleName: 'Get all available Pricelists for Job',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all available pricelists for a job',
      returnType: 'PricelistList',
      paramOrder: ['jobID', 'projectType'],
      active: true,
    },
    getPricelistEntries: {
      soapAction: 'getPricelistEntry_List',
      endpoint: ENDPOINT,
      uiName: 'Get all Pricelist Entries',
      subtitleName: 'get all pricelist entries: job',
      titleName: 'Get all Pricelist Entries',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all pricelist entries for a pricelist',
      returnType: 'PricelistEntryList',
      paramOrder: ['PricelistID', 'SourceLanguage', 'TargetLanguage'],
      active: true,
    },
    getPriceUnits: {
      soapAction: 'getPriceUnit_List',
      endpoint: ENDPOINT,
      uiName: 'Get all available Price Units',
      subtitleName: 'get all available price units: job',
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
      subtitleName: 'get price unit: job',
      titleName: 'Get Price Unit',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve a specific price unit',
      returnType: 'PriceUnit',
      paramOrder: ['PriceUnitID', 'languageCode'],
      active: true,
    },
  
    // ── Inactive ops (kept for reference) ──
    setPricelistById: {
      // Deprecated in API
      soapAction: 'setPriceListeID',
      endpoint: ENDPOINT,
      uiName: 'Update PricelistID',
      subtitleName: 'update pricelistid: job',
      titleName: 'Update PricelistID',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update the pricelist for a job by ID',
      returnType: 'Void',
      paramOrder: ['projectType', 'priceListID', 'jobID'],
      active: false,
    },
    getServices: {
      soapAction: 'getServices_List',
      endpoint: ENDPOINT,
      uiName: 'Get all available Services',
      subtitleName: 'get all available services: job',
      titleName: 'Get all available Services',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all available services',
      returnType: 'StringArray',
      paramOrder: ['languageCode'],
      active: true,
  },
  };
  
  /** ─ Derived mappings (actives only) ─ */
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
  );
  
  type R =
    | 'Void'
    | 'JobMetric'
    | 'PriceLine'
    | 'PriceLineList'
    | 'PriceUnit'
    | 'PriceUnitList'
    | 'Pricelist'
    | 'PricelistList'
    | 'PricelistEntryList'
    | 'StringArray';
  
  const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType as R])
  );
  
  /** ─ UI wiring (lean) ─ */
  const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
  const isCurrencyTypeParam = (op: string, p: string) => op === 'getPriceLine_ListByCurrencyType' && p === 'currencyType';
  const isBooleanFlagParam = (op: string, p: string) => op === 'insertPriceLine' && p === 'createAsFirstItem';
  const NUMERIC_PARAM_NAMES = new Set(['jobID', 'projectID', 'resourceID', 'itemID', 'userID', 'contactID', 'priceLineID', 'PriceUnitID', 'priceListID', 'PricelistID', 'projectId']);
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
        if (isBooleanFlagParam(op, p))
          return { displayName: p, name: p, type: 'boolean', default: false, description: `${p} parameter for ${op} (boolean)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (p === 'languageCode')
          return { displayName: 'Language Code', name: p, type: 'string', default: 'EN', description: `${p} parameter for ${op} (defaults to EN)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isNumericParam(p))
          return { displayName: p, name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
      })
    ),

    // Extended Object option for getPriceLines
    {
      displayName: 'Extended Object',
      name: 'extendedObject',
      type: 'boolean',
      default: false,
      description: 'When enabled, enriches each price line with description and service from the price unit',
      displayOptions: { show: { resource: [RESOURCE], operation: ['getPriceLine_List'] } },
    },
  
    // Collections for price line ops only
    ...(['insertPriceLine', 'updatePriceLine'] as const).map(op => ({
      displayName: 'Additional Fields',
      name: 'additionalFields',
      type: 'collection' as const,
      placeholder: 'Add Field',
      default: {},
      options: (
        op === 'insertPriceLine'
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
          const jobID = itemParams.jobID as number;
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
          return `<UUID>${escapeXml(sessionId)}</UUID>\n<jobID>${escapeXml(String(jobID))}</jobID>\n<projectType>${escapeXml(String(projectType))}</projectType>\n${priceLineInXml}\n<createAsFirstItem>${createAsFirstItem ? '1' : '0'}</createAsFirstItem>`;
        }
        if (op === 'updatePriceLine') {
          const jobID = itemParams.jobID as number;
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
          return `<UUID>${escapeXml(sessionId)}</UUID>\n<jobID>${escapeXml(String(jobID))}</jobID>\n<projectType>${escapeXml(String(projectType))}</projectType>\n${priceLineInXml}`;
        }
        return null;
      },
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op] as R | undefined;
        let payload: IDataObject;
        switch (rt) {
          case 'JobMetric': {
            const r = parseJobMetricResult(xml);
            payload = { jobMetric: r.jobMetric, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
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
          case 'StringArray': {
            // used by getServices_List
            const data = (xml.match(/<data>([\s\S]*?)<\/data>/)?.[1] || '') as any; // keep generic; actual parser exists elsewhere if needed
            payload = { data, statusMessage: extractStatusMessage(xml) };
            break;
          }
          case 'Void': {
            const r = parseVoidResult(xml);
            if (!r.ok) {
              const msg = r.statusMessage || 'Operation failed';
              throw new NodeOperationError({} as any, `${op}: ${msg}${r.statusCode !== undefined ? ` [${r.statusCode}]` : ''}`, { itemIndex: 0 });
            }
            payload = { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
  export const DataJob30PricesService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Non-Core operations for Prices in DataJob30',
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
      
      // Handle extended object enrichment for getPriceLine_List
      if (operation === 'getPriceLine_List') {
        const extendedObject = ctx.getNodeParameter('extendedObject', itemIndex, false) as boolean;
        const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
        const finalResult = Array.isArray(result) ? result[0] || {} : result;
        
        if (extendedObject && finalResult.priceLines && Array.isArray(finalResult.priceLines)) {
          // Enrich each price line with price unit details
          const enrichedPriceLines = await Promise.all(
            finalResult.priceLines.map(async (priceLine: any) => {
              if (priceLine.PriceUnitID) {
                try {
                  // Create a new config for getPriceUnit call
                  const priceUnitConfig = createExecuteConfig(creds, url, baseUrl, timeoutMs);
                  const priceUnitParams = {
                    PriceUnitID: priceLine.PriceUnitID,
                    languageCode: 'EN'
                  };
                  
                  // Call getPriceUnit to get additional details
                  const priceUnitResult = await executeOperation(ctx, 'getPriceUnit', priceUnitParams, priceUnitConfig, itemIndex);
                  const priceUnitData = Array.isArray(priceUnitResult) ? priceUnitResult[0] || {} : priceUnitResult;
                  
                  // Add description and service to the price line
                  if (priceUnitData.priceUnit && typeof priceUnitData.priceUnit === 'object') {
                    const priceUnit = priceUnitData.priceUnit as IDataObject;
                    return {
                      ...priceLine,
                      description: priceUnit.description || '',
                      service: priceUnit.service || ''
                    };
                  }
                } catch (error) {
                  // If price unit fetch fails, return original price line
                  // Log error for debugging but don't throw
                }
              }
              return priceLine;
            })
          );
          
          return {
            ...finalResult,
            priceLines: enrichedPriceLines
          };
        }
        
        return finalResult;
      }
      
      const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
      return Array.isArray(result) ? result[0] || {} : result;
    },
  };
  