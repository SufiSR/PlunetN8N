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
  import { extractStatusMessage, parseStringResult, parseIntegerResult, parseVoidResult, parseIntegerArrayResult } from '../core/xml';
  import { parseAddressResult, parseAddressListResult } from '../core/parsers/address';
  import { AddressTypeOptions, getAddressTypeName } from '../enums/address-type';
  import { MANDATORY_FIELDS } from '../core/field-definitions';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  
  const RESOURCE = 'DataCustomerAddress30Core';
  const ENDPOINT = 'DataCustomerAddress30';
  const RESOURCE_DISPLAY_NAME = 'Customer Address';
  
  /** ─ Active operations only ─ */
  const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // ── Active ops ──
    insert2: {
      soapAction: 'insert2',
      endpoint: ENDPOINT,
      uiName: 'Create Customer Address',
      subtitleName: 'create: customer address',
      titleName: 'Create Customer Address',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create a new customer address',
      returnType: 'Integer',
      paramOrder: ['customerID'],
      active: true,
    },
    update: {
      soapAction: 'update',
      endpoint: ENDPOINT,
      uiName: 'Update Customer Address',
      subtitleName: 'update: customer address',
      titleName: 'Update Customer Address',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update an existing customer address',
      returnType: 'Void',
      paramOrder: ['addressID'],
      active: true,
    },
    getAllAddresses: {
      soapAction: 'getAllAddresses',
      endpoint: ENDPOINT,
      uiName: 'Get All Customer Addresses',
      subtitleName: 'get all: customer addresses',
      titleName: 'Get All Customer Addresses',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all addresses for a customer',
      returnType: 'IntegerArray',
      paramOrder: ['customerID'],
      active: true,
    },
    delete: {
      soapAction: 'delete',
      endpoint: ENDPOINT,
      uiName: 'Delete Customer Address',
      subtitleName: 'delete: customer address',
      titleName: 'Delete Customer Address',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Delete a customer address',
      returnType: 'Void',
      paramOrder: ['addressID'],
      active: true,
    },
    GetAddressObject: {
      soapAction: 'GetAddressObject',
      endpoint: ENDPOINT,
      uiName: 'Get Address Object',
      subtitleName: 'get: address object',
      titleName: 'Get Complete Address Object',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Get complete address object with all fields (fusion function)',
      returnType: 'Address',
      paramOrder: ['addressID'],
      active: true,
    },
  };
  
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
  );
  
  const RETURN_TYPE = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType])
  ) as Record<string, 'Void' | 'Integer' | 'String' | 'Address' | 'IntegerArray'>;
  
  /** ─ UI wiring (lean) ─ */
  const isAddressTypeParam = (p: string) => p.toLowerCase() === 'addresstype';
  const isCountryParam = (p: string) => p.toLowerCase() === 'country';
  const NUMERIC_PARAM_NAMES = new Set(['customerID', 'addressID']);
  const isNumericParam = (p: string) => NUMERIC_PARAM_NAMES.has(p);
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    // Standard properties for all operations
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      params.map<INodeProperties>(p => {
        if (isNumericParam(p))
          return { displayName: p, name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
      })
    ),
    
    // Address fields for insert2 and update operations
    {
      displayName: 'Address Type',
      name: 'addressType',
      type: 'options',
      options: AddressTypeOptions,
      default: 1,
      description: 'Type of address (required)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
      required: true,
    },
    {
      displayName: 'Description',
      name: 'description',
      type: 'string',
      default: '',
      description: 'Address description',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'Name 1',
      name: 'name1',
      type: 'string',
      default: '',
      description: 'First name line',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'Name 2',
      name: 'name2',
      type: 'string',
      default: '',
      description: 'Second name line',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'Office',
      name: 'office',
      type: 'string',
      default: '',
      description: 'Office name',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'Street',
      name: 'street',
      type: 'string',
      default: '',
      description: 'Street address',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'Street 2',
      name: 'street2',
      type: 'string',
      default: '',
      description: 'Additional street address line',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'City',
      name: 'city',
      type: 'string',
      default: '',
      description: 'City',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'ZIP Code',
      name: 'zip',
      type: 'string',
      default: '',
      description: 'ZIP/Postal code',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'State',
      name: 'state',
      type: 'string',
      default: '',
      description: 'State/Province',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
    },
    {
      displayName: 'Country',
      name: 'country',
      type: 'options',
      typeOptions: {
        loadOptionsMethod: 'getAvailableCountries',
      },
      default: '',
      description: 'Country',
      displayOptions: { show: { resource: [RESOURCE], operation: ['insert2', 'update'] } },
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
  
  // Helper function to make individual address field API calls for GetAddressObject
  async function getAddressFieldData(ctx: IExecuteFunctions, sessionId: string, addressID: number, config: ExecuteConfig, itemIndex: number): Promise<IDataObject> {
    const addressData: IDataObject = {};
    
    // Helper function to safely call individual field operations
    const safeCallField = async (operation: string): Promise<string | number | undefined> => {
      try {
        const fieldConfig = {
          url: config.url,
          soapActionFor: (op: string) => `http://API.Integration/${op}`,
          paramOrder: { [operation]: ['addressID'] },
          numericBooleans: new Set<string>(),
          getSessionId: async () => sessionId,
          buildCustomBodyXml: (op: string, params: IDataObject) => {
            if (op === operation) {
              return `<UUID>${escapeXml(sessionId)}</UUID>
<AddressID>${escapeXml(String(addressID))}</AddressID>`;
            }
            return null;
          },
          parseResult: (xml: string) => {
            if (operation === 'getAddressType') {
              return parseIntegerResult(xml);
            }
            return parseStringResult(xml);
          }
        };
        
        const result = await executeOperation(ctx, operation, { addressID }, fieldConfig, itemIndex);
        
        if (operation === 'getAddressType') {
          return (result as any).value;
        }
        return (result as any).data || '';
      } catch (error) {
        return operation === 'getAddressType' ? undefined : '';
      }
    };
    
    // Get all address fields
    const addressType = await safeCallField('getAddressType');
    addressData['AddressType ID'] = addressType;
    if (addressType !== undefined) {
      addressData['AddressType Label'] = getAddressTypeName(addressType as number);
    }
    
    addressData['Description'] = await safeCallField('getDescription');
    addressData['Name1'] = await safeCallField('getName1');
    addressData['Name2'] = await safeCallField('getName2');
    addressData['Office'] = await safeCallField('getOffice');
    addressData['Street'] = await safeCallField('getStreet');
    addressData['Street2'] = await safeCallField('getStreet2');
    addressData['City'] = await safeCallField('getCity');
    addressData['Zip'] = await safeCallField('getZip');
    addressData['State'] = await safeCallField('getState');
    addressData['Country'] = await safeCallField('getCountry');
    
    return addressData;
  }
  
  function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return {
      url,
      soapActionFor: (op: string) => `http://API.Integration/${op}`,
      paramOrder: PARAM_ORDER,
      numericBooleans: NUMERIC_BOOLEAN_PARAMS,
      getSessionId: async (ctx: IExecuteFunctions) => ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0),
      buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
        if (op === 'insert2') {
          const addressType = ctx.getNodeParameter('addressType', itemIndex, 1) as number;
          const description = ctx.getNodeParameter('description', itemIndex, '') as string;
          const name1 = ctx.getNodeParameter('name1', itemIndex, '') as string;
          const name2 = ctx.getNodeParameter('name2', itemIndex, '') as string;
          const office = ctx.getNodeParameter('office', itemIndex, '') as string;
          const street = ctx.getNodeParameter('street', itemIndex, '') as string;
          const street2 = ctx.getNodeParameter('street2', itemIndex, '') as string;
          const city = ctx.getNodeParameter('city', itemIndex, '') as string;
          const zip = ctx.getNodeParameter('zip', itemIndex, '') as string;
          const state = ctx.getNodeParameter('state', itemIndex, '') as string;
          const country = ctx.getNodeParameter('country', itemIndex, '') as string;
          
          const addressInXml = [
            '<AddressIN>',
            `<addressType>${escapeXml(String(addressType))}</addressType>`,
            description ? `<description>${escapeXml(String(description))}</description>` : '',
            name1 ? `<name1>${escapeXml(String(name1))}</name1>` : '',
            name2 ? `<name2>${escapeXml(String(name2))}</name2>` : '',
            office ? `<office>${escapeXml(String(office))}</office>` : '',
            street ? `<street>${escapeXml(String(street))}</street>` : '',
            street2 ? `<street2>${escapeXml(String(street2))}</street2>` : '',
            city ? `<city>${escapeXml(String(city))}</city>` : '',
            zip ? `<zip>${escapeXml(String(zip))}</zip>` : '',
            state ? `<state>${escapeXml(String(state))}</state>` : '',
            country ? `<country>${escapeXml(String(country))}</country>` : '',
            '</AddressIN>'
          ].filter(line => line !== '').join('\n');
          
          return `<UUID>${escapeXml(sessionId)}</UUID>
<CustomerID>${escapeXml(String(itemParams.customerID))}</CustomerID>
${addressInXml}`;
        }
        if (op === 'update') {
          const addressType = ctx.getNodeParameter('addressType', itemIndex, 1) as number;
          const description = ctx.getNodeParameter('description', itemIndex, '') as string;
          const name1 = ctx.getNodeParameter('name1', itemIndex, '') as string;
          const name2 = ctx.getNodeParameter('name2', itemIndex, '') as string;
          const office = ctx.getNodeParameter('office', itemIndex, '') as string;
          const street = ctx.getNodeParameter('street', itemIndex, '') as string;
          const street2 = ctx.getNodeParameter('street2', itemIndex, '') as string;
          const city = ctx.getNodeParameter('city', itemIndex, '') as string;
          const zip = ctx.getNodeParameter('zip', itemIndex, '') as string;
          const state = ctx.getNodeParameter('state', itemIndex, '') as string;
          const country = ctx.getNodeParameter('country', itemIndex, '') as string;
          
          const addressInXml = [
            '<AddressIN>',
            `<addressID>${escapeXml(String(itemParams.addressID))}</addressID>`,
            `<addressType>${escapeXml(String(addressType))}</addressType>`,
            description ? `<description>${escapeXml(String(description))}</description>` : '',
            name1 ? `<name1>${escapeXml(String(name1))}</name1>` : '',
            name2 ? `<name2>${escapeXml(String(name2))}</name2>` : '',
            office ? `<office>${escapeXml(String(office))}</office>` : '',
            street ? `<street>${escapeXml(String(street))}</street>` : '',
            street2 ? `<street2>${escapeXml(String(street2))}</street2>` : '',
            city ? `<city>${escapeXml(String(city))}</city>` : '',
            zip ? `<zip>${escapeXml(String(zip))}</zip>` : '',
            state ? `<state>${escapeXml(String(state))}</state>` : '',
            country ? `<country>${escapeXml(String(country))}</country>` : '',
            '</AddressIN>'
          ].filter(line => line !== '').join('\n');
          
          return `<UUID>${escapeXml(sessionId)}</UUID>
${addressInXml}`;
        }
        return null;
      },
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op];
        let payload: IDataObject;
        switch (rt) {
          case 'Address': {
            // This will be handled in the execute method for GetAddressObject
            payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
            break;
          }
          case 'IntegerArray': {
            const r = parseIntegerArrayResult(xml);
            payload = { addressIDs: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
  
  export const DataCustomerAddress30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core operations for DataCustomerAddress30',
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
      
      // Handle GetAddressObject fusion function
      if (operation === 'GetAddressObject') {
        const addressID = itemParams.addressID as number;
        if (!addressID) {
          throw new NodeOperationError({} as any, 'Address ID is required for GetAddressObject operation', { itemIndex });
        }
        
        const sessionId = await config.getSessionId(ctx, itemIndex);
        const addressData = await getAddressFieldData(ctx, sessionId, addressID, config, itemIndex);
        
        return {
          success: true,
          resource: RESOURCE,
          operation: operation,
          address: addressData,
          statusMessage: 'OK',
          statusCode: 0
        };
      }
      
      const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
      return Array.isArray(result) ? result[0] || {} : result;
    },
  };
