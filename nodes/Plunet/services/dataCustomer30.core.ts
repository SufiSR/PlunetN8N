import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { labelize, asNonEmpty } from '../core/utils';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import {
    extractResultBase, extractStatusMessage, extractSoapFault, parseIntegerResult, parseIntegerArrayResult, parseVoidResult,
} from '../core/xml';
// import { parseCustomerResult } from '../core/parsers'; // Removed: not exported from '../core/parsers'
import { CustomerStatusOptions } from '../enums/customer-status';
import {
    toSoapParamValue,
    escapeXml,
    createStandardExecuteConfig,
    executeStandardService,
    generateOperationOptions,
    generateOperationOptionsFromRegistry,
    createStringProperty,
    createBooleanProperty,
    createOptionsProperty,
    createTypedProperty,
    handleVoidResult,
    buildSearchFilterXml,
} from '../core/service-utils';
import {
    CUSTOMER_IN_FIELDS,
    CUSTOMER_SEARCH_FILTER_FIELDS,
    MANDATORY_FIELDS,
    FIELD_TYPES,
} from '../core/field-definitions';
import { parseCustomerResult } from '../core/parsers/customer';
import { idToCustomerStatusName } from '../core/parsers/common';

const RESOURCE = 'DataCustomer30Core';
const ENDPOINT = 'DataCustomer30';
const RESOURCE_DISPLAY_NAME = 'Customer';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    getCustomer: {
        soapAction: 'getCustomerObject',
        endpoint: ENDPOINT,
        uiName: 'Get Customer',
        subtitleName: 'get: customer',
        titleName: 'Get a Customer',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve a single customer by ID',
        returnType: 'Customer',
        paramOrder: ['customerID'],
    },
    getManyCustomers: {
        soapAction: 'search',
        endpoint: ENDPOINT,
        uiName: 'Get Many Customers',
        subtitleName: 'get many: customer',
        titleName: 'Get Many Customers',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Search and retrieve multiple customers',
        returnType: 'IntegerArray',
        paramOrder: [...CUSTOMER_SEARCH_FILTER_FIELDS],
    },
    createCustomer: {
        soapAction: 'insert2',
        endpoint: ENDPOINT,
        uiName: 'Create Customer',
        subtitleName: 'create: customer',
        titleName: 'Create a Customer',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new customer',
        returnType: 'Integer',
        paramOrder: [...CUSTOMER_IN_FIELDS.filter(f => f !== 'customerID')],
    },
    updateCustomer: {
        soapAction: 'update',
        endpoint: ENDPOINT,
        uiName: 'Update Customer',
        subtitleName: 'update: customer',
        titleName: 'Update a Customer',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update an existing customer',
        returnType: 'Void',
        paramOrder: [
            'customerID', 'status', ...CUSTOMER_IN_FIELDS.filter(f => f !== 'customerID' && f !== 'status'),
            'enableNullOrEmptyValues',
        ],
    },
    deleteCustomer: {
        soapAction: 'delete',
        endpoint: ENDPOINT,
        uiName: 'Delete Customer',
        subtitleName: 'delete: customer',
        titleName: 'Delete aCustomer',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Delete a customer',
        returnType: 'Void',
        paramOrder: ['customerID'],
    },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).map(op => [op.soapAction, op.paramOrder])
);

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Customer';
const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).map(op => [op.soapAction, op.returnType as R])
);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

const extraProperties: INodeProperties[] = [
    
    // Mandatory fields for each operation
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        const mandatoryFields = MANDATORY_FIELDS[`customer${op.charAt(0).toUpperCase()}${op.slice(1)}`] || MANDATORY_FIELDS[op] || [];
        return mandatoryFields.map<INodeProperties>((p) => {
            const fieldType = FIELD_TYPES[p] || 'string';
            
            // Handle special cases for mandatory fields
            if (p.toLowerCase() === 'status') {
                return createTypedProperty(
                    p,
                    'Status',
                    `${p} parameter for ${op} (CustomerStatus enum)`,
                    RESOURCE,
                    op,
                    'string',
                    true, // Always mandatory
                    CustomerStatusOptions,
                    '', // No default value - only include if user sets it
                    true, // Add empty option for better UX
                );
            }
            if (op === 'update' && p === 'enableNullOrEmptyValues') {
                return createBooleanProperty(
                    p,
                    'Overwrite with Empty Values',
                    'If enabled, empty inputs overwrite existing values in Plunet.',
                    RESOURCE,
                    op,
                    false,
                    true,
                );
            }
            
            // Create user-friendly display names
            const displayName = labelize(p);
            
            return createTypedProperty(
                p,
                displayName,
                `${displayName} parameter for ${op}`,
                RESOURCE,
                op,
                fieldType,
                true, // Always mandatory
            );
        });
    }),
    
    // Collection field for optional fields - exactly like HubSpot's "Add Property"
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        if (op !== 'insert2' && op !== 'update') return [];

        const mandatoryFields = MANDATORY_FIELDS[`customer${op.charAt(0).toUpperCase()}${op.slice(1)}`] || MANDATORY_FIELDS[op] || [];
        const optionalFields = CUSTOMER_IN_FIELDS.filter(f => 
            !mandatoryFields.includes(f) && 
            f !== 'customerID'
        );

        // Create options for the collection
        const collectionOptions = optionalFields.map(field => {
            const fieldType = FIELD_TYPES[field] || 'string';
            const displayName = labelize(field);

            // Handle special enum fields
            if (field === 'status') {
                return {
                    displayName: 'Status',
                    name: field,
                    type: 'options' as const,
                    options: [
                        { name: 'Please select...', value: '' },
                        ...CustomerStatusOptions
                    ],
                    default: '',
                    description: `${field} parameter (CustomerStatus enum)`,
                };
            }

            switch (fieldType) {
                case 'number':
                    return {
                        displayName,
                        name: field,
                        type: 'number' as const,
                        default: 0,
                        typeOptions: { minValue: 0, step: 1 },
                        description: `${displayName} parameter`,
                    };
                case 'boolean':
                    return {
                        displayName,
                        name: field,
                        type: 'boolean' as const,
                        default: false,
                        description: `${displayName} parameter`,
                    };
                case 'date':
                    return {
                        displayName,
                        name: field,
                        type: 'dateTime' as const,
                        default: '',
                        description: `${displayName} parameter`,
                    };
                default: // 'string'
                    return {
                        displayName,
                        name: field,
                        type: 'string' as const,
                        default: '',
                        description: `${displayName} parameter`,
                    };
            }
        });

        return [{
            displayName: 'Additional Fields',
            name: 'additionalFields',
            type: 'collection' as const,
            placeholder: 'Add Field',
            default: {},
            displayOptions: {
                show: {
                    resource: [RESOURCE],
                    operation: [op],
                },
            },
            options: collectionOptions,
        }];
    }),
    
    // Search filter fields
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        if (op !== 'search') return [];
        
        return params.map<INodeProperties>((p) => {
            if (p === 'languageCode') {
                return {
                    displayName: 'Language Code',
                    name: p,
                    type: 'string' as const,
                    default: 'EN',
                    description: 'Language code for search (defaults to EN)',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'customerStatus') {
                return {
                    displayName: 'Customer Status',
                    name: p,
                    type: 'options' as const,
                    options: [
                        { name: 'Please select', value: '' },
                        ...CustomerStatusOptions,
                    ],
                    default: '',
                    description: 'Customer status to filter by',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            return createStringProperty(
                p,
                labelize(p),
                `${labelize(p)} parameter for ${op}`,
                RESOURCE,
                op,
            );
        });
    }),
    
    // Keep non-CUSTOMER_IN_FIELDS as regular properties
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params
            .filter(p => !(CUSTOMER_IN_FIELDS as readonly string[]).includes(p) && !MANDATORY_FIELDS[op]?.includes(p) && !(CUSTOMER_SEARCH_FILTER_FIELDS as readonly string[]).includes(p))
            .map<INodeProperties>((p) => {
                const fieldType = (FIELD_TYPES as Record<string, 'string' | 'number' | 'boolean' | 'date'>)[p] || 'string';
                const displayName = labelize(p);
                
                return createTypedProperty(
                    p,
                    displayName,
                    `${displayName} parameter for ${op}`,
                    RESOURCE,
                    op,
                    fieldType as 'string' | 'number' | 'boolean' | 'date',
                    false,
                );
            }),
    ),
];

// Field definitions are now imported from field-definitions.ts

// Build <CustomerIN>…</CustomerIN>. If includeEmpty=true, sends empty tags too.
function buildCustomerINXml(
    ctx: IExecuteFunctions,
    itemIndex: number,
    fields: readonly string[],
    includeEmpty: boolean,
): string {
    const lines: string[] = ['<CustomerIN>'];

    // Get additional fields from collection
    const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;

    // Process all fields (mandatory + optional from collection)
    for (const name of fields) {
        try {
            let raw: any;
            
            // Check if this field is in the additional fields collection
            if (additionalFields[name] !== undefined) {
                raw = additionalFields[name];
            } else {
                // Try to get it as a regular parameter (for mandatory fields)
                raw = ctx.getNodeParameter(name, itemIndex, '');
            }
            
            const val = toSoapParamValue(raw, name);
            if (includeEmpty || val !== '') {
                lines.push(`  <${name}>${escapeXml(val)}</${name}>`);
            }
        } catch (error) {
            // If parameter doesn't exist, skip it (don't add empty tag)
            // This prevents including fields that weren't set by the user
        }
    }

    lines.push('</CustomerIN>');
    return lines.join('\n      ');
}

// Build <SearchFilter_Customer>…</SearchFilter_Customer>

// Common utility functions are now imported from service-utils

// Create the execution configuration
function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return createStandardExecuteConfig(
        creds,
        url,
        baseUrl,
        timeoutMs,
        PARAM_ORDER,
        (xml: string, op: string) => {
            const rt = RETURN_TYPE[op] as R|undefined;
            let payload: IDataObject;
            switch (rt) {
                case 'Customer': {
                    const r = parseCustomerResult(xml);
                    const customer = (r as any).customer || undefined;
                    const statusId = typeof customer?.statusId === 'number' ? customer.statusId : 
                                   typeof customer?.status === 'number' ? customer.status : undefined;
                    const statusName = idToCustomerStatusName(statusId);
                    const enrichedCustomer = customer ? {
                        ...customer,
                        ...(statusName ? { status: statusName } : {}),
                    } : undefined;
                    payload = { customer: enrichedCustomer, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Integer': {
                    const r = parseIntegerResult(xml);
                    payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'IntegerArray': {
                    const r = parseIntegerArrayResult(xml);
                    payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Void': {
                    payload = handleVoidResult(xml, op, parseVoidResult);
                    break;
                }
                default: {
                    payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
                }
            }
            return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
        },
        (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
            if (op === 'update') {
                // Get mandatory fields
                const mandatoryFields = MANDATORY_FIELDS[`customer${op.charAt(0).toUpperCase()}${op.slice(1)}`] || MANDATORY_FIELDS[op] || [];
                
                // Get additional fields from collection
                const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
                const selectedOptionalFields = Object.keys(additionalFields).filter(key => 
                    additionalFields[key] !== '' && 
                    additionalFields[key] !== null && 
                    additionalFields[key] !== undefined
                );
                
                // Combine mandatory and selected optional fields
                const fieldsToInclude = [...mandatoryFields, ...selectedOptionalFields] as readonly string[];
                
                const en = itemParams.enableNullOrEmptyValues as boolean || false;

                const customerIn = buildCustomerINXml(ctx, itemIndex, fieldsToInclude, en);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${customerIn}\n<enableNullOrEmptyValues>${en ? '1' : '0'}</enableNullOrEmptyValues>`;
            } else if (op === 'insert2') {
                // Get mandatory fields
                const mandatoryFields = MANDATORY_FIELDS[op] || [];
                
                // Get additional fields from collection
                const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
                const selectedOptionalFields = Object.keys(additionalFields).filter(key => 
                    additionalFields[key] !== '' && 
                    additionalFields[key] !== null && 
                    additionalFields[key] !== undefined
                );
                
                // Combine mandatory and selected optional fields
                const fieldsToInclude = [...mandatoryFields, ...selectedOptionalFields] as readonly string[];

                const customerIn = buildCustomerINXml(ctx, itemIndex, fieldsToInclude, false);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${customerIn}`;
            } else if (op === 'search') {
                // Build <SearchFilter> with search fields
                const searchFilter = buildSearchFilterXml(ctx, itemIndex, CUSTOMER_SEARCH_FILTER_FIELDS);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${searchFilter}`;
            }
            return null;
        },
    );
}

/** ─ Service export ─ */
export const DataCustomer30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core operations for DataCustomer30',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
        return await executeStandardService(
            operation,
            ctx,
            creds,
            url,
            baseUrl,
            timeoutMs,
            itemIndex,
            PARAM_ORDER,
            config,
        );
    },
};