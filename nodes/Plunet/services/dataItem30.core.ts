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
  import { extractStatusMessage, parseStringResult, parseIntegerResult, parseVoidResult, parseDateResult } from '../core/xml';
  import { parseItemResult, parseItemListResult } from '../core/parsers/item';
  import { ProjectTypeOptions } from '../enums/project-type';
  import { ItemStatusOptions, getItemStatusName } from '../enums/item-status';
  import { TaxTypeOptions, idToTaxTypeName } from '../enums/tax-type';
  import { MANDATORY_FIELDS } from '../core/field-definitions';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  
  const RESOURCE = 'DataItem30Core';
  const ENDPOINT = 'DataItem30';
  const RESOURCE_DISPLAY_NAME = 'Item';
  
  /** ─ Active operations only ─ */
  const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // ── Active ops ──
    getItem: {
      soapAction: 'getItemObject',
      endpoint: ENDPOINT,
      uiName: 'Get Item',
      subtitleName: 'get: item',
      titleName: 'Get an Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve a single item by ID',
      returnType: 'Item',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    getAllItems: {
      soapAction: 'getAllItemObjects',
      endpoint: ENDPOINT,
      uiName: 'Get All Items',
      subtitleName: 'get all items: item',
      titleName: 'Get All Items',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all items',
      returnType: 'ItemList',
      paramOrder: ['projectID', 'projectType'],
      active: true,
    },
    updateItem: {
      soapAction: 'update',
      endpoint: ENDPOINT,
      uiName: 'Update Item',
      subtitleName: 'update: item',
      titleName: 'Update an Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update an existing item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    deleteItem: {
      soapAction: 'delete',
      endpoint: ENDPOINT,
      uiName: 'Delete Item',
      subtitleName: 'delete: item',
      titleName: 'Delete an Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Delete an item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    getItemByLanguage: {
      soapAction: 'get_ByLanguage',
      endpoint: ENDPOINT,
      uiName: 'Get Item by Language',
      subtitleName: 'get item by language: item',
      titleName: 'Get Item by Language',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Get item by project type, project ID, and language combination',
      returnType: 'Integer',
      paramOrder: ['projectType', 'projectID', 'sourceLanguage', 'targetLanguage'],
      active: true,
    },
  };
  
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
  );
  
  const RETURN_TYPE = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType])
  ) as Record<string, 'Void' | 'Integer' | 'String' | 'Item' | 'ItemList'>;
  
  /** ─ UI wiring (lean) ─ */
  const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
  const NUMERIC_PARAM_NAMES = new Set(['itemID', 'projectID', 'projectId']);
  const isNumericParam = (p: string) => NUMERIC_PARAM_NAMES.has(p);
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    // Standard properties for all operations
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      params.map<INodeProperties>(p => {
        if (isProjectTypeParam(p))
          return { displayName: 'Project Type', name: p, type: 'options', options: ProjectTypeOptions, default: 3, description: `${p} parameter for ${op} (ProjectType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isNumericParam(p))
          return { displayName: p, name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
      })
    ),
    
    // Extended object option for getItem (moved to last position)
    {
      displayName: 'Get Extended Object',
      name: 'getExtendedObject',
      type: 'boolean',
      default: false,
      description: 'If enabled, additional item fields will be retrieved (comment, default contact person, delivery date, item reference)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['getItemObject'] } },
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
  
  // Helper function to make additional API calls for extended object
  async function getExtendedItemData(ctx: IExecuteFunctions, sessionId: string, itemID: number, projectType: number, config: ExecuteConfig, itemIndex: number): Promise<IDataObject> {
    const extendedData: IDataObject = {};
    
    // Helper function to safely call an operation and return empty string on failure
    const safeCall = async (operation: string, params: IDataObject): Promise<string> => {
      try {
        const result = await executeOperation(ctx, operation, params, config, itemIndex);
        if (Array.isArray(result)) {
          const item = result[0] || {};
          // Extract data based on the operation type
          if (operation === 'getComment' || operation === 'getItemReference') {
            return String(item.data || '');
          } else if (operation === 'getDefaultContactPerson') {
            return String(item.value || '');
          } else if (operation === 'getDeliveryDate') {
            return String(item.date || '');
          }
          return String(item.data || item.value || item.date || '');
        }
        // Extract data based on the operation type
        if (operation === 'getComment' || operation === 'getItemReference') {
          return String(result.data || '');
        } else if (operation === 'getDefaultContactPerson') {
          return String(result.value || '');
        } else if (operation === 'getDeliveryDate') {
          return String(result.date || '');
        }
        return String(result.data || result.value || result.date || '');
      } catch (error) {
        return '';
      }
    };
    
    // Get comment
    try {
      const commentResult = await safeCall('getComment', { itemID, projectType });
      extendedData.comment = String(commentResult);
    } catch (error) {
      extendedData.comment = '';
    }
    
    // Get default contact person
    try {
      const contactResult = await safeCall('getDefaultContactPerson', { itemID, projectType });
      extendedData.DefaultContactPerson = String(contactResult);
    } catch (error) {
      extendedData.DefaultContactPerson = '';
    }
    
    // Get delivery date
    try {
      const deliveryDateResult = await safeCall('getDeliveryDate', { itemID, projectType });
      extendedData['Delivery Date'] = String(deliveryDateResult);
    } catch (error) {
      extendedData['Delivery Date'] = '';
    }
    
    // Get item reference
    try {
      const referenceResult = await safeCall('getItemReference', { itemID, projectType });
      extendedData['Item Reference'] = String(referenceResult);
    } catch (error) {
      extendedData['Item Reference'] = '';
    }
    
    return extendedData;
  }
  
  function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return {
      url,
      soapActionFor: (op: string) => `http://API.Integration/${op}`,
      paramOrder: PARAM_ORDER,
      numericBooleans: NUMERIC_BOOLEAN_PARAMS,
      getSessionId: async (ctx: IExecuteFunctions) => ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0),
      buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => null,
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op];
        let payload: IDataObject;
        switch (rt) {
          case 'Item': {
            const r = parseItemResult(xml);
            let item = r.item;
            
            // Add status_label and tax_type_label
            if (item.status !== undefined) {
              item.status_label = getItemStatusName(item.status);
            }
            if (item.taxType !== undefined) {
              const taxTypeName = idToTaxTypeName(item.taxType);
              item.tax_type_label = taxTypeName || `Unknown (${item.taxType})`;
            }
            
            // Handle jobIDList as array if present
            if (item.jobIDList && !Array.isArray(item.jobIDList)) {
              item.jobIDList = [item.jobIDList];
            }
            
            // Extended object functionality will be handled in the execute method
            
            payload = { item, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'ItemList': {
            const r = parseItemListResult(xml);
            // Add status_label and tax_type_label for each item
            const items = r.items.map((item: any) => {
              if (item.status !== undefined) {
                item.status_label = getItemStatusName(item.status);
              }
              if (item.taxType !== undefined) {
                const taxTypeName = idToTaxTypeName(item.taxType);
                item.tax_type_label = taxTypeName || `Unknown (${item.taxType})`;
              }
              // Handle jobIDList as array if present
              if (item.jobIDList && !Array.isArray(item.jobIDList)) {
                item.jobIDList = [item.jobIDList];
              }
              return item;
            });
            payload = { items, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'Integer': {
            const r = parseIntegerResult(xml);
            payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
          case 'String': {
            const r = parseStringResult(xml);
            payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
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
  
  export const DataItem30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core operations for DataItem30',
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
      
      // Handle extended object for getItemObject operation
      if (operation === 'getItemObject') {
        const getExtendedObject = ctx.getNodeParameter('getExtendedObject', itemIndex, false) as boolean;
        if (getExtendedObject && result && !Array.isArray(result) && result.item) {
          const itemID = itemParams.itemID as number;
          const projectType = itemParams.projectType as number;
          const sessionId = await config.getSessionId(ctx, itemIndex);
          const extendedData = await getExtendedItemData(ctx, sessionId, itemID, projectType, config, itemIndex);
          result.item = { ...(result.item as IDataObject), ...extendedData };
        }
      }
      
      return Array.isArray(result) ? result[0] || {} : result;
    },
  };
