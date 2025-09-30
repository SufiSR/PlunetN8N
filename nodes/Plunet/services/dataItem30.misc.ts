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
  import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
  import { extractStatusMessage, parseStringResult, parseIntegerResult, parseVoidResult, parseDateResult } from '../core/xml';
  import { ProjectTypeOptions } from '../enums/project-type';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  
  const RESOURCE = 'DataItem30Misc';
  const ENDPOINT = 'DataItem30';
  const RESOURCE_DISPLAY_NAME = 'Item Fields';
  
  /** ─ Centralized Operation Registry ─ */
  const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // ── Active ops ──
    getComment: {
      soapAction: 'getComment',
      endpoint: ENDPOINT,
      uiName: 'Get Comment',
      subtitleName: 'get comment: item',
      titleName: 'Get Comment',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Get comment for an item',
      returnType: 'String',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    setComment: {
      soapAction: 'setComment',
      endpoint: ENDPOINT,
      uiName: 'Update Comment',
      subtitleName: 'update comment: item',
      titleName: 'Update Comment',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update comment for an item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType', 'comment'],
      active: true,
    },
    getDefaultContactPerson: {
      soapAction: 'getDefaultContactPerson',
      endpoint: ENDPOINT,
      uiName: 'Get Default Contact Person',
      subtitleName: 'get default contact person: item',
      titleName: 'Get Default Contact Person',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Get default contact person for an item',
      returnType: 'Integer',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    setDefaultContactPerson: {
      soapAction: 'setDefaultContactPerson',
      endpoint: ENDPOINT,
      uiName: 'Update Default Contact Person',
      subtitleName: 'update default contact person: item',
      titleName: 'Update Default Contact Person',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update default contact person for an item',
      returnType: 'Void',
      paramOrder: ['itemId', 'projectType', 'resourceId'],
      active: true,
    },
    getDeliveryDate: {
      soapAction: 'getDeliveryDate',
      endpoint: ENDPOINT,
      uiName: 'Get Delivery Date',
      subtitleName: 'get delivery date: item',
      titleName: 'Get Delivery Date',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Get delivery date for an item',
      returnType: 'Date',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    setDeliveryDate: {
      soapAction: 'setDeliveryDate',
      endpoint: ENDPOINT,
      uiName: 'Update Delivery Date',
      subtitleName: 'update delivery date: item',
      titleName: 'Update Delivery Date',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update delivery date for an item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType', 'deliveryDate'],
      active: true,
    },
    getItemReference: {
      soapAction: 'getItemReference',
      endpoint: ENDPOINT,
      uiName: 'Get Item Reference',
      subtitleName: 'get item reference: item',
      titleName: 'Get Item Reference',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Get item reference for an item',
      returnType: 'String',
      paramOrder: ['itemID', 'projectType'],
      active: true,
    },
    setItemReference: {
      soapAction: 'setItemReference',
      endpoint: ENDPOINT,
      uiName: 'Update Item Reference',
      subtitleName: 'update item reference: item',
      titleName: 'Update Item Reference',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update item reference for an item',
      returnType: 'Void',
      paramOrder: ['itemID', 'projectType', 'itemReference'],
      active: true,
    },
  };
  
  /** ─ Derived mappings (actives only) ─ */
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
  );
  
  type R = 'Void' | 'String' | 'Integer' | 'Date';
  
  const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType as R])
  );
  
  /** ─ UI wiring (lean) ─ */
  const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
  const isTaxTypeParam = (op: string, p: string) => op === 'setTaxType' && p === 'taxType';
  const NUMERIC_PARAM_NAMES = new Set(['itemID', 'projectID', 'resourceID', 'projectId']);
  const isNumericParam = (p: string) => NUMERIC_PARAM_NAMES.has(p);
  const isDateParam = (p: string) => p === 'deliveryDate' || p === 'startDate' || p === 'dueDate';
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      params.map<INodeProperties>(p => {
        if (isProjectTypeParam(p))
          return { displayName: 'Project Type', name: p, type: 'options', options: ProjectTypeOptions, default: 3, description: `${p} parameter for ${op} (ProjectType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isTaxTypeParam(op, p))
          return { displayName: 'Tax Type', name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (TaxType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isNumericParam(p))
          return { displayName: p, name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isDateParam(p))
          return { displayName: p, name: p, type: 'dateTime', default: '', description: `${p} parameter for ${op} (date)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
      })
    ),
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
      buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => null,
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op] as R | undefined;
        let payload: IDataObject;
        switch (rt) {
          case 'String': {
            const r = parseStringResult(xml);
            payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'Integer': {
            const r = parseIntegerResult(xml);
            payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'Date': {
            const r = parseDateResult(xml);
            payload = { date: r.date ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
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
  export const DataItem30MiscService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Non-Core operations for DataItem30',
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
