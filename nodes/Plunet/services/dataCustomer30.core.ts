import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
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

const RESOURCE = 'DataCustomer30Core';
const ENDPOINT = 'DataCustomer30';

/** ─ Params per operation (UUID auto-included) ─ */
const PARAM_ORDER: Record<string, string[]> = {
    insert2: [...CUSTOMER_IN_FIELDS.filter(f => f !== 'customerID')],
    update: [
        'customerID', 'status', ...CUSTOMER_IN_FIELDS.filter(f => f !== 'customerID' && f !== 'status'),
        'enableNullOrEmptyValues',
    ],
    delete: ['customerID'],
    getCustomerObject: ['customerID'],
    search: [...CUSTOMER_SEARCH_FILTER_FIELDS],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Customer';
const RETURN_TYPE: Record<string, R> = {
    insert2: 'Integer',
    update: 'Void',
    delete: 'Void',
    getCustomerObject: 'Customer',
    search: 'IntegerArray',
};

/** ─ UI wiring ─ */
const FRIENDLY_LABEL: Record<string,string> = {
    insert2: 'Create',
    update: 'Update',
    delete: 'Delete',
    getCustomerObject: 'Get',
    search: 'Get Many',
};

const OP_ORDER = ['getCustomerObject','search','insert2','update','delete'] as const;

const operationOptions: NonEmptyArray<INodePropertyOptions> = [
    {
        name: 'getCustomerObject',
        value: 'Get',
        description: 'Retrieve a Customer',
    },
    {
        name: 'search',
        value: 'Get Many',
        description: 'Retrieve a list of Customers',
    },
    {
        name: 'insert2',
        value: 'Create',
        description: 'Create a new Customer',
    },
    {
        name: 'update',
        value: 'Update',
        description: 'Update a Customer',
    },
    {
        name: 'delete',
        value: 'Delete',
        description: 'Delete a Customer',
    },
];

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
            f !== 'customerID' && 
            f !== 'status'
        );

        // Create options for the collection
        const collectionOptions = optionalFields.map(field => {
            const fieldType = FIELD_TYPES[field] || 'string';
            const displayName = labelize(field);

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
                return createOptionsProperty(
                    p,
                    'Customer Status',
                    'Customer status to filter by',
                    RESOURCE,
                    op,
                    CustomerStatusOptions,
                    undefined, // No default value - will be empty if not selected
                );
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
                    payload = { customer: r.customer, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
    resourceDisplayName: 'Customer',
    resourceDescription: 'Core operations for Customer management',
    endpoint: ENDPOINT,
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