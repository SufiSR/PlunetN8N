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
import { CurrencyTypeOptions, idToCurrencyTypeName } from '../enums/currency-type';
  import { MANDATORY_FIELDS } from '../core/field-definitions';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  import { DataItem30MiscService } from './dataItem30.misc';
  
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
    insert2: {
      soapAction: 'insert2',
      endpoint: ENDPOINT,
      uiName: 'Create Item',
      subtitleName: 'create item: item',
      titleName: 'Create Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create a new item with advanced options and follow-up operations',
      returnType: 'Integer',
      paramOrder: ['projectType', 'projectID'],
      active: true,
    },
    update: {
      soapAction: 'update',
      endpoint: ENDPOINT,
      uiName: 'Update Item',
      subtitleName: 'update: item',
      titleName: 'Update Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update an existing item with advanced options and follow-up operations',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType', 'projectID', 'enableNullOrEmptyValues'],
      active: true,
    },
    getItemByLanguage: {
        // Call is currently not working
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
      active: false,
    },
    getLanguageIndependentItemObject: {
      soapAction: 'getLanguageIndependentItemObject',
      endpoint: ENDPOINT,
      uiName: 'Get Language Independent Item',
      subtitleName: 'get language independent item: item',
      titleName: 'Get Language Independent Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Get language independent item object by project type, project ID, and currency type',
      returnType: 'Item',
      paramOrder: ['projectType', 'projectID', 'currencyType'],
      active: true,
    },
    insertLanguageIndependentItem: {
      soapAction: 'insertLanguageIndependentItem',
      endpoint: ENDPOINT,
      uiName: 'Create Language Independent Item',
      subtitleName: 'create language independent item: item',
      titleName: 'Create Language Independent Item',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create a new language independent item',
      returnType: 'Integer',
      paramOrder: ['projectType', 'projectID', 'status', 'taxType', 'totalPrice'],
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
  const isCurrencyTypeParam = (p: string) => p.toLowerCase() === 'currencytype';
  const isStatusParam = (p: string) => p.toLowerCase() === 'status';
  const isTaxTypeParam = (p: string) => p.toLowerCase() === 'taxtype';
  const NUMERIC_PARAM_NAMES = new Set(['itemID', 'projectID', 'projectId', 'totalPrice']);
  const isNumericParam = (p: string) => NUMERIC_PARAM_NAMES.has(p);
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    // Standard properties for all operations
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      params.map<INodeProperties>(p => {
        if (isProjectTypeParam(p))
          return { displayName: 'Project Type', name: p, type: 'options', options: ProjectTypeOptions, default: 3, description: `${p} parameter for ${op} (ProjectType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isCurrencyTypeParam(p))
          return { displayName: 'Currency Type', name: p, type: 'options', options: CurrencyTypeOptions, default: 1, description: `${p} parameter for ${op} (CurrencyType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isStatusParam(p))
          return { displayName: 'Status', name: p, type: 'options', options: ItemStatusOptions, default: 1, description: `${p} parameter for ${op} (ItemStatus enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isTaxTypeParam(p))
          return { displayName: 'Tax Type', name: p, type: 'options', options: TaxTypeOptions, default: 0, description: `${p} parameter for ${op} (TaxType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
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
    
    // Optional fields collection for insertLanguageIndependentItem
    {
      displayName: 'Optional Fields',
      name: 'optionalFields',
      type: 'collection',
      placeholder: 'Add Field',
      default: {},
      description: 'Optional fields for the language independent item',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insertLanguageIndependentItem'] } },
      options: [
        {
          displayName: 'Brief Description',
          name: 'briefDescription',
          type: 'string',
          default: '',
          description: 'Brief description of the item',
        },
        {
          displayName: 'Comment',
          name: 'comment',
          type: 'string',
          default: '',
          description: 'Comment for the item',
        },
        {
          displayName: 'Delivery Deadline',
          name: 'deliveryDeadline',
          type: 'dateTime',
          default: '',
          description: 'Delivery deadline for the item',
        },
        {
          displayName: 'Item ID',
          name: 'itemID',
          type: 'number',
          default: 0,
          typeOptions: { minValue: 0, step: 1 },
          description: 'Item ID (optional, will be auto-generated if not provided)',
        },
        {
          displayName: 'Reference',
          name: 'reference',
          type: 'string',
          default: '',
          description: 'Reference for the item',
        },
      ],
    },
    
    // Language fields for insert2
    {
      displayName: 'Source Language',
      name: 'sourceLanguage',
      type: 'options',
      typeOptions: {
        loadOptionsMethod: 'getAvailableLanguages',
      },
      default: '',
      description: 'Source language for the item',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2'] } },
    },
    {
      displayName: 'Target Language',
      name: 'targetLanguage',
      type: 'options',
      typeOptions: {
        loadOptionsMethod: 'getAvailableLanguages',
      },
      default: '',
      description: 'Target language for the item',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2'] } },
    },
    
    // Collection for additional field operations for insert2
    {
      displayName: 'Additional Fields',
      name: 'additionalFields',
      type: 'collection',
      placeholder: 'Add Field',
      default: {},
      description: 'Additional field operations to perform after item creation',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2'] } },
      options: [
        {
          displayName: 'Brief Description',
          name: 'briefDescription',
          type: 'string',
          default: '',
          description: 'Brief description for the item',
        },
        {
          displayName: 'Comment',
          name: 'comment',
          type: 'string',
          default: '',
          description: 'Comment for the item',
        },
        {
          displayName: 'Delivery Deadline',
          name: 'deliveryDeadline',
          type: 'dateTime',
          default: '',
          description: 'Delivery deadline for the item',
        },
        {
          displayName: 'Reference',
          name: 'reference',
          type: 'string',
          default: '',
          description: 'Reference for the item',
        },
        {
          displayName: 'Status',
          name: 'status',
          type: 'options',
          options: ItemStatusOptions,
          default: '',
          description: 'Status of the item',
        },
        {
          displayName: 'Tax Type',
          name: 'taxType',
          type: 'options',
          options: TaxTypeOptions,
          default: '',
          description: 'Tax type for the item',
        },
        {
          displayName: 'Total Price',
          name: 'totalPrice',
          type: 'number',
          default: 0,
          typeOptions: { minValue: 0, step: 0.01 },
          description: 'Total price for the item',
        },
        {
          displayName: 'Default Contact Person',
          name: 'defaultContactPerson',
          type: 'string',
          default: '',
          description: 'Default contact person for the item',
        },
        {
          displayName: 'Delivery Date',
          name: 'deliveryDate',
          type: 'dateTime',
          default: '',
          description: 'Delivery date for the item',
        },
        {
          displayName: 'Item Reference',
          name: 'itemReference',
          type: 'string',
          default: '',
          description: 'Item reference for the item',
        },
      ],
    },
    
    // Enable Null or Empty Values for update
    {
      displayName: 'Enable Null or Empty Values',
      name: 'enableNullOrEmptyValues',
      type: 'boolean',
      default: false,
      description: 'Whether to enable null or empty values for the update operation',
      displayOptions: { show: { resource: [RESOURCE], operation: ['update'] } },
    },
    
    // Collection for additional field operations for update
    {
      displayName: 'Additional Fields',
      name: 'additionalFields',
      type: 'collection',
      placeholder: 'Add Field',
      default: {},
      description: 'Additional field operations to perform after item update',
      displayOptions: { show: { resource: [RESOURCE], operation: ['update'] } },
      options: [
        {
          displayName: 'Brief Description',
          name: 'briefDescription',
          type: 'string',
          default: '',
          description: 'Brief description for the item',
        },
        {
          displayName: 'Comment',
          name: 'comment',
          type: 'string',
          default: '',
          description: 'Comment for the item',
        },
        {
          displayName: 'Delivery Deadline',
          name: 'deliveryDeadline',
          type: 'dateTime',
          default: '',
          description: 'Delivery deadline for the item',
        },
        {
          displayName: 'Reference',
          name: 'reference',
          type: 'string',
          default: '',
          description: 'Reference for the item',
        },
        {
          displayName: 'Status',
          name: 'status',
          type: 'options',
          options: ItemStatusOptions,
          default: '',
          description: 'Status for the item',
        },
        {
          displayName: 'Tax Type',
          name: 'taxType',
          type: 'options',
          options: TaxTypeOptions,
          default: '',
          description: 'Tax type for the item',
        },
        {
          displayName: 'Total Price',
          name: 'totalPrice',
          type: 'number',
          default: 0,
          typeOptions: { minValue: 0, step: 0.01 },
          description: 'Total price for the item',
        },
        {
          displayName: 'Default Contact Person',
          name: 'defaultContactPerson',
          type: 'string',
          default: '',
          description: 'Default contact person for the item',
        },
        {
          displayName: 'Delivery Date',
          name: 'deliveryDate',
          type: 'dateTime',
          default: '',
          description: 'Delivery date for the item',
        },
        {
          displayName: 'Item Reference',
          name: 'itemReference',
          type: 'string',
          default: '',
          description: 'Item reference for the item',
        },
      ],
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
    
    // Helper function to safely call misc operations and return empty string on failure
    const safeCallMisc = async (operation: string, creds: Creds, url: string, baseUrl: string, timeoutMs: number): Promise<string> => {
      try {
        const result = await DataItem30MiscService.execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex);
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
    
    // Get the credentials and URL info from the context
    const creds = (await ctx.getCredentials('plunetApi')) as unknown as Creds;
    const scheme = creds.useHttps ? 'https' : 'http';
    const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
    const url = `${baseUrl}/${DataItem30MiscService.endpoint}`;
    const timeoutMs = creds.timeout ?? 30000;
    
    // Get comment
    try {
      const commentResult = await safeCallMisc('getComment', creds, url, baseUrl, timeoutMs);
      extendedData.comment = String(commentResult);
    } catch (error) {
      extendedData.comment = '';
    }
    
    // Get default contact person
    try {
      const contactResult = await safeCallMisc('getDefaultContactPerson', creds, url, baseUrl, timeoutMs);
      extendedData.DefaultContactPerson = String(contactResult);
    } catch (error) {
      extendedData.DefaultContactPerson = '';
    }
    
    // Get delivery date
    try {
      const deliveryDateResult = await safeCallMisc('getDeliveryDate', creds, url, baseUrl, timeoutMs);
      extendedData['Delivery Date'] = String(deliveryDateResult);
    } catch (error) {
      extendedData['Delivery Date'] = '';
    }
    
    // Get item reference
    try {
      const referenceResult = await safeCallMisc('getItemReference', creds, url, baseUrl, timeoutMs);
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
      creds, // Pass credentials for debug mode
      resource: RESOURCE, // Pass resource name for error context
      buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
        if (op === 'getLanguageIndependentItemObject') {
          return `<UUID>${escapeXml(sessionId)}</UUID>
<projectType>${escapeXml(String(itemParams.projectType))}</projectType>
<projectID>${escapeXml(String(itemParams.projectID))}</projectID>
<currencyType>${escapeXml(String(itemParams.currencyType))}</currencyType>`;
        }
        if (op === 'insertLanguageIndependentItem') {
          const optionalFields = ctx.getNodeParameter('optionalFields', itemIndex, {}) as IDataObject;
          
          const itemInXml = [
            '<ItemIN>',
            optionalFields.briefDescription ? `<briefDescription>${escapeXml(String(optionalFields.briefDescription))}</briefDescription>` : '',
            optionalFields.comment ? `<comment>${escapeXml(String(optionalFields.comment))}</comment>` : '',
            optionalFields.deliveryDeadline ? `<deliveryDeadline>${escapeXml(String(optionalFields.deliveryDeadline))}</deliveryDeadline>` : '',
            optionalFields.itemID ? `<itemID>${escapeXml(String(optionalFields.itemID))}</itemID>` : '',
            `<projectID>${escapeXml(String(itemParams.projectID))}</projectID>`,
            `<projectType>${escapeXml(String(itemParams.projectType))}</projectType>`,
            optionalFields.reference ? `<reference>${escapeXml(String(optionalFields.reference))}</reference>` : '',
            `<status>${escapeXml(String(itemParams.status))}</status>`,
            `<taxType>${escapeXml(String(itemParams.taxType))}</taxType>`,
            `<totalPrice>${escapeXml(String(itemParams.totalPrice))}</totalPrice>`,
            '</ItemIN>'
          ].filter(line => line !== '').join('\n');
          
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${itemInXml}`;
        }
        if (op === 'insert2') {
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          
          const itemInXml = [
            '<ItemIN>',
            additionalFields.briefDescription ? `<briefDescription>${escapeXml(String(additionalFields.briefDescription))}</briefDescription>` : '',
            additionalFields.comment ? `<comment>${escapeXml(String(additionalFields.comment))}</comment>` : '',
            additionalFields.deliveryDeadline ? `<deliveryDeadline>${escapeXml(String(additionalFields.deliveryDeadline))}</deliveryDeadline>` : '',
            additionalFields.reference ? `<reference>${escapeXml(String(additionalFields.reference))}</reference>` : '',
            additionalFields.status ? `<status>${escapeXml(String(additionalFields.status))}</status>` : '',
            additionalFields.taxType ? `<taxType>${escapeXml(String(additionalFields.taxType))}</taxType>` : '',
            additionalFields.totalPrice ? `<totalPrice>${escapeXml(String(additionalFields.totalPrice))}</totalPrice>` : '',
            `<projectID>${escapeXml(String(itemParams.projectID))}</projectID>`,
            `<projectType>${escapeXml(String(itemParams.projectType))}</projectType>`,
            '</ItemIN>'
          ].filter(line => line !== '').join('\n');
          
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${itemInXml}`;
        }
        if (op === 'update') {
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          
          const itemInXml = [
            '<ItemIN>',
            additionalFields.briefDescription ? `<briefDescription>${escapeXml(String(additionalFields.briefDescription))}</briefDescription>` : '',
            additionalFields.comment ? `<comment>${escapeXml(String(additionalFields.comment))}</comment>` : '',
            additionalFields.deliveryDeadline ? `<deliveryDeadline>${escapeXml(String(additionalFields.deliveryDeadline))}</deliveryDeadline>` : '',
            `<itemID>${escapeXml(String(itemParams.itemID))}</itemID>`,
            `<projectID>${escapeXml(String(itemParams.projectID))}</projectID>`,
            `<projectType>${escapeXml(String(itemParams.projectType))}</projectType>`,
            additionalFields.reference ? `<reference>${escapeXml(String(additionalFields.reference))}</reference>` : '',
            additionalFields.status ? `<status>${escapeXml(String(additionalFields.status))}</status>` : '',
            additionalFields.taxType ? `<taxType>${escapeXml(String(additionalFields.taxType))}</taxType>` : '',
            additionalFields.totalPrice ? `<totalPrice>${escapeXml(String(additionalFields.totalPrice))}</totalPrice>` : '',
            '</ItemIN>'
          ].filter(line => line !== '').join('\n');
          
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${itemInXml}\n<enableNullOrEmptyValues>${escapeXml(String(itemParams.enableNullOrEmptyValues))}</enableNullOrEmptyValues>`;
        }
        return null;
      },
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op];
        let payload: IDataObject;
        switch (rt) {
          case 'Item': {
            const r = parseItemResult(xml);
            let item = r.item;
            
            // Add status_label, tax_type_label, and currency_type_label
            if (item.status !== undefined) {
              item.status_label = getItemStatusName(item.status);
            }
            if (item.taxType !== undefined) {
              const taxTypeName = idToTaxTypeName(item.taxType);
              item.tax_type_label = taxTypeName || `Unknown (${item.taxType})`;
            }
            if (item.currencyType !== undefined) {
              const currencyTypeName = idToCurrencyTypeName(item.currencyType);
              item.currency_type_label = currencyTypeName || `Unknown (${item.currencyType})`;
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
            // Add status_label, tax_type_label, and currency_type_label for each item
            const items = r.items.map((item: any) => {
              if (item.status !== undefined) {
                item.status_label = getItemStatusName(item.status);
              }
              if (item.taxType !== undefined) {
                const taxTypeName = idToTaxTypeName(item.taxType);
                item.tax_type_label = taxTypeName || `Unknown (${item.taxType})`;
              }
              if (item.currencyType !== undefined) {
                const currencyTypeName = idToCurrencyTypeName(item.currencyType);
                item.currency_type_label = currencyTypeName || `Unknown (${item.currencyType})`;
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
      
      // Add debug envelope for main operation
      // Clean result for insert2 - no debug information
      
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
      
      // Handle complex insert2 operation with follow-up calls
      if (operation === 'insert2') {
        const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        const sourceLanguage = ctx.getNodeParameter('sourceLanguage', itemIndex, '') as string;
        const targetLanguage = ctx.getNodeParameter('targetLanguage', itemIndex, '') as string;
        
        // Get the item ID from the insert2 result
        const itemID = (result as IDataObject).value as number;
        
        if (itemID && itemID > 0) {
          const sessionId = await config.getSessionId(ctx, itemIndex);
          const projectType = itemParams.projectType as number;
          
          // Initialize additional calls tracking
          const addtlCalls: string[] = [];
          
          // Helper function to safely call misc operations
          const safeCallMisc = async (op: string, ...args: any[]) => {
            try {
              // Get the additional parameter (comment, defaultContactPerson, etc.)
              const additionalParam = args[2]; // The third parameter is the value to set
              
              const miscConfig = {
                url: url.replace('/DataItem30', '/DataItem30'),
                soapActionFor: (operation: string) => `http://API.Integration/${operation}`,
                paramOrder: { [op]: ['itemID', 'projectType'] },
                numericBooleans: new Set<string>(),
                getSessionId: async () => sessionId,
                buildCustomBodyXml: (operation: string, params: IDataObject) => {
                  if (operation === op) {
                    let xml = `<UUID>${escapeXml(sessionId)}</UUID>
<itemID>${escapeXml(String(itemID))}</itemID>
<projectType>${escapeXml(String(projectType))}</projectType>`;
                    
                    // Add the specific parameter based on the operation
                    if (op === 'setComment' && additionalParam) {
                      xml += `\n<comment>${escapeXml(String(additionalParam))}</comment>`;
                    } else if (op === 'setDefaultContactPerson' && additionalParam) {
                      xml += `\n<defaultContactPerson>${escapeXml(String(additionalParam))}</defaultContactPerson>`;
                    } else if (op === 'setDeliveryDate' && additionalParam) {
                      xml += `\n<deliveryDate>${escapeXml(String(additionalParam))}</deliveryDate>`;
                    } else if (op === 'setItemReference' && additionalParam) {
                      xml += `\n<itemReference>${escapeXml(String(additionalParam))}</itemReference>`;
                    }
                    
                    return xml;
                  }
                  return null;
                },
                parseResult: (xml: string) => parseStringResult(xml)
              };
              
              const result = await executeOperation(ctx, op, { itemID, projectType }, miscConfig, itemIndex);
              
              // Build the complete sent envelope with all parameters
              let sentEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:${op}>
         <UUID>${escapeXml(sessionId)}</UUID>
         <itemID>${escapeXml(String(itemID))}</itemID>
         <projectType>${escapeXml(String(projectType))}</projectType>`;
         
              // Add the specific parameter to the envelope
              if (op === 'setComment' && additionalParam) {
                sentEnvelope += `\n         <comment>${escapeXml(String(additionalParam))}</comment>`;
              } else if (op === 'setDefaultContactPerson' && additionalParam) {
                sentEnvelope += `\n         <defaultContactPerson>${escapeXml(String(additionalParam))}</defaultContactPerson>`;
              } else if (op === 'setDeliveryDate' && additionalParam) {
                sentEnvelope += `\n         <deliveryDate>${escapeXml(String(additionalParam))}</deliveryDate>`;
              } else if (op === 'setItemReference' && additionalParam) {
                sentEnvelope += `\n         <itemReference>${escapeXml(String(additionalParam))}</itemReference>`;
              }
              
              sentEnvelope += `
      </api:${op}>
   </soap:Body>
</soap:Envelope>`;
              
              // Track successful call
              addtlCalls.push(op);
              
              return result;
            } catch (error) {
              // Silently fail for additional operations
              return null;
            }
          };
          
          // Perform additional field operations
          if (additionalFields.comment) {
            await safeCallMisc('setComment', itemID, projectType, additionalFields.comment);
          }
          
          if (additionalFields.defaultContactPerson) {
            await safeCallMisc('setDefaultContactPerson', itemID, projectType, additionalFields.defaultContactPerson);
          }
          
          if (additionalFields.deliveryDate) {
            await safeCallMisc('setDeliveryDate', itemID, projectType, additionalFields.deliveryDate);
          }
          
          if (additionalFields.itemReference) {
            await safeCallMisc('setItemReference', itemID, projectType, additionalFields.itemReference);
          }
          
          // Handle language combination if both languages are provided
          
          if (sourceLanguage && targetLanguage) {
            try {
              // Specialized function for language combination calls
              const callLanguageCombination = async (op: string, ...params: any[]) => {
                try {
                  const miscConfig = {
                    url: url.replace('/DataItem30', '/DataItem30'),
                    soapActionFor: (operation: string) => `http://API.Integration/${operation}`,
                    paramOrder: { [op]: op === 'addLanguageCombination2' ? ['sourceLanguage', 'targetLanguage', 'projectType', 'projectID'] : ['languageCombinationID', 'projectType', 'itemID'] },
                    numericBooleans: new Set<string>(),
                    getSessionId: async () => sessionId,
                    buildCustomBodyXml: (operation: string, params: IDataObject) => {
                      if (operation === op) {
                        if (op === 'addLanguageCombination2') {
                          return `<UUID>${escapeXml(sessionId)}</UUID>
<sourceLanguage>${escapeXml(String(sourceLanguage))}</sourceLanguage>
<targetLanguage>${escapeXml(String(targetLanguage))}</targetLanguage>
<projectType>${escapeXml(String(projectType))}</projectType>
<projectID>${escapeXml(String(itemParams.projectID))}</projectID>`;
                        } else if (op === 'setLanguageCombinationID') {
                          return `<UUID>${escapeXml(sessionId)}</UUID>
<languageCombinationID>${escapeXml(String(params.languageCombinationID || params[0]))}</languageCombinationID>
<projectType>${escapeXml(String(projectType))}</projectType>
<itemID>${escapeXml(String(itemID))}</itemID>`;
                        }
                      }
                      return null;
                    },
                    parseResult: (xml: string) => parseStringResult(xml)
                  };
                  
                  // Prepare parameters for executeOperation
                  let operationParams: IDataObject = {};
                  if (op === 'addLanguageCombination2') {
                    operationParams = {
                      sourceLanguage: sourceLanguage,
                      targetLanguage: targetLanguage,
                      projectType: projectType,
                      projectID: itemParams.projectID
                    };
                  } else if (op === 'setLanguageCombinationID') {
                    operationParams = {
                      languageCombinationID: params[0],
                      projectType: projectType,
                      itemID: itemID
                    };
                  }
                  
                  const result = await executeOperation(ctx, op, operationParams, miscConfig, itemIndex);
                  
                  // Add the sent envelope to the result for debugging
                  let sentEnvelope = '';
                  if (op === 'addLanguageCombination2') {
                    sentEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:${op}>
         <UUID>${escapeXml(sessionId)}</UUID>
         <sourceLanguage>${escapeXml(String(sourceLanguage))}</sourceLanguage>
         <targetLanguage>${escapeXml(String(targetLanguage))}</targetLanguage>
         <projectType>${escapeXml(String(projectType))}</projectType>
         <projectID>${escapeXml(String(itemParams.projectID))}</projectID>
      </api:${op}>
   </soap:Body>
</soap:Envelope>`;
                  } else if (op === 'setLanguageCombinationID') {
                    sentEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:${op}>
         <UUID>${escapeXml(sessionId)}</UUID>
         <languageCombinationID>${escapeXml(String(params[0]))}</languageCombinationID>
         <projectType>${escapeXml(String(projectType))}</projectType>
         <itemID>${escapeXml(String(itemID))}</itemID>
      </api:${op}>
   </soap:Body>
</soap:Envelope>`;
                  }
                  
                  // Track successful call
                  addtlCalls.push(op);
                  
                  return {
                    ...result,
                    sentEnvelope: sentEnvelope,
                    operation: op
                  };
                } catch (error) {
                  return null;
                }
              };
              
              // Call addLanguageCombination2
              const addLanguageCombinationResult = await callLanguageCombination('addLanguageCombination2', sourceLanguage, targetLanguage, projectType, itemParams.projectID);
              
              if (addLanguageCombinationResult && (addLanguageCombinationResult as IDataObject).data) {
                const languageCombinationID = (addLanguageCombinationResult as IDataObject).data;
                
                // Call setLanguageCombinationID
                try {
                  const setLanguageCombinationResult = await callLanguageCombination('setLanguageCombinationID', languageCombinationID, projectType, itemID);
                  
                  // Add language combination info to result (clean)
                  (result as IDataObject).languageCombinationID = languageCombinationID;
                } catch (setError) {
                  (result as IDataObject).setLanguageCombinationResult = null;
                }
              }
            } catch (error) {
              // Silently handle language combination errors
            }
          }
          
          // Add clean additional calls info to result
          (result as IDataObject).addtlCalls = addtlCalls;
        }
      }
      
      // Handle complex update operation with follow-up calls
      if (operation === 'update') {
        const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
        
        // Get the item ID from the update parameters (not result, since update returns void)
        const itemID = itemParams.itemID as number;
        
        // Get the main update SOAP envelope
        const sessionId = await config.getSessionId(ctx, itemIndex);
        
        if (itemID && itemID > 0) {
          const projectType = itemParams.projectType as number;
          
          // Initialize additional calls tracking
          const addtlCalls: string[] = [];
          
          // Helper function to safely call misc operations
          const safeCallMisc = async (op: string, ...args: any[]) => {
            try {
              // Get the additional parameter (comment, defaultContactPerson, etc.)
              const additionalParam = args[2]; // The third parameter is the value to set
              
              const miscConfig = {
                url: url.replace('/DataItem30', '/DataItem30'),
                soapActionFor: (operation: string) => `http://API.Integration/${operation}`,
                paramOrder: { [op]: ['itemID', 'projectType'] },
                numericBooleans: new Set<string>(),
                getSessionId: async () => sessionId,
                buildCustomBodyXml: (operation: string, params: IDataObject) => {
                  if (operation === op) {
                    let xml = `<UUID>${escapeXml(sessionId)}</UUID>
<itemID>${escapeXml(String(itemID))}</itemID>
<projectType>${escapeXml(String(projectType))}</projectType>`;
                    
                    // Add the specific parameter based on the operation
                    if (op === 'setComment' && additionalParam) {
                      xml += `\n<comment>${escapeXml(String(additionalParam))}</comment>`;
                    } else if (op === 'setDefaultContactPerson' && additionalParam) {
                      xml += `\n<defaultContactPerson>${escapeXml(String(additionalParam))}</defaultContactPerson>`;
                    } else if (op === 'setDeliveryDate' && additionalParam) {
                      xml += `\n<deliveryDate>${escapeXml(String(additionalParam))}</deliveryDate>`;
                    } else if (op === 'setItemReference' && additionalParam) {
                      xml += `\n<itemReference>${escapeXml(String(additionalParam))}</itemReference>`;
                    }
                    
                    return xml;
                  }
                  return null;
                },
                parseResult: (xml: string) => parseStringResult(xml)
              };
              
              const result = await executeOperation(ctx, op, { itemID, projectType }, miscConfig, itemIndex);
              
              // Track successful call
              addtlCalls.push(op);
              
              return result;
            } catch (error) {
              // Silently fail for additional operations
              return null;
            }
          };
          
          // Perform additional field operations
          if (additionalFields.comment) {
            await safeCallMisc('setComment', itemID, projectType, additionalFields.comment);
          }
          
          if (additionalFields.defaultContactPerson) {
            await safeCallMisc('setDefaultContactPerson', itemID, projectType, additionalFields.defaultContactPerson);
          }
          
          if (additionalFields.deliveryDate) {
            await safeCallMisc('setDeliveryDate', itemID, projectType, additionalFields.deliveryDate);
          }
          
          if (additionalFields.itemReference) {
            await safeCallMisc('setItemReference', itemID, projectType, additionalFields.itemReference);
          }
          
          // Add clean additional calls info to result
          (result as IDataObject).addtlCalls = addtlCalls;
        }
      }
      
      return Array.isArray(result) ? result[0] || {} : result;
    },
  };
