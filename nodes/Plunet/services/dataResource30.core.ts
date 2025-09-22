import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { labelize, asNonEmpty } from '../core/utils';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import {
    extractResultBase,
    extractStatusMessage,
    extractSoapFault,
    parseIntegerResult,
    parseIntegerArrayResult,
    parseVoidResult,
} from '../core/xml';
import { parseResourceResult } from '../core/parsers/resource';

import { ResourceStatusOptions, idToResourceStatusName } from '../enums/resource-status';
import { ResourceTypeOptions, idToResourceTypeName } from '../enums/resource-type';
import { FormOfAddressOptions, idToFormOfAddressName } from '../enums/form-of-address';
import { WorkingStatusOptions } from '../enums/working-status';
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
    generateOperationOptionsFromRegistry,
} from '../core/service-utils';
import {
    RESOURCE_IN_FIELDS,
    RESOURCE_SEARCH_FILTER_FIELDS,
    MANDATORY_FIELDS,
    FIELD_TYPES,
} from '../core/field-definitions';

const RESOURCE = 'DataResource30Core';
const ENDPOINT = 'DataResource30';
const RESOURCE_DISPLAY_NAME = 'Resource';

/** ResourceIN fields for create/update */
const RESOURCE_IN_FIELDS_CREATE = [
    'academicTitle','costCenter','currency','email','externalID','fax','formOfAddress',
    'fullName','mobilePhone','name1','name2','opening','phone','resourceType','skypeID',
    'status','supervisor1','supervisor2','userId','website','workingStatus',
] as const;

const RESOURCE_IN_FIELDS_UPDATE = [
    'resourceID', ...RESOURCE_IN_FIELDS_CREATE,
] as const;

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    getResource: {
        soapAction: 'getResourceObject',
        endpoint: ENDPOINT,
        uiName: 'Get Resource',
        subtitleName: 'get: resource',
        titleName: 'Get a Resource',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve a single resource by ID',
        returnType: 'Resource',
        paramOrder: ['resourceID'],
        active: true,
    },
    getManyResources: {
        soapAction: 'search',
        endpoint: ENDPOINT,
        uiName: 'Get Many Resources',
        subtitleName: 'get many: resource',
        titleName: 'Get Many Resources',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Search and retrieve multiple resources',
        returnType: 'IntegerArray',
        paramOrder: [...RESOURCE_SEARCH_FILTER_FIELDS],
        active: true,
    },
    createResource: {
        soapAction: 'insertObject',
        endpoint: ENDPOINT,
        uiName: 'Create Resource',
        subtitleName: 'create: resource',
        titleName: 'Create Resource',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new resource',
        returnType: 'Integer',
        paramOrder: [...RESOURCE_IN_FIELDS],
        active: true,
    },
    updateResource: {
        soapAction: 'update',
        endpoint: ENDPOINT,
        uiName: 'Update Resource',
        subtitleName: 'update: resource',
        titleName: 'Update Resource',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update an existing resource',
        returnType: 'Void',
        paramOrder: [
            'resourceID', ...RESOURCE_IN_FIELDS, 'enableNullOrEmptyValues',
        ],
        active: true,
    },
    deleteResource: {
        soapAction: 'delete',
        endpoint: ENDPOINT,
        uiName: 'Delete Resource',
        subtitleName: 'delete: resource',
        titleName: 'Delete Resource',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Delete a resource',
        returnType: 'Void',
        paramOrder: ['resourceID'],
        active: true,
    },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.paramOrder])
);

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Resource';
const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.returnType as R])
);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

// enum helpers
const isStatusParam = (p: string) => p === 'Status' || p === 'status';
const isWorkingStatusParam = (p: string) => p === 'WorkingStatus' || p === 'workingStatus';
const isResourceTypeParam = (p: string) => p === 'ResourceType' || p === 'resourceType';
const isFormOfAddressParam = (p: string) => p === 'FormOfAddress' || p === 'formOfAddress';

const extraProperties: INodeProperties[] = [
    
    // Mandatory fields for each operation
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        const mandatoryFields = MANDATORY_FIELDS[op] || [];
        return mandatoryFields.map<INodeProperties>((p) => {
            const fieldType = FIELD_TYPES[p] || 'string';
            
            // Handle special cases for mandatory fields
            if (isStatusParam(p)) {
                return createOptionsProperty(
                    p,
                    'Status',
                    `${p} parameter for ${op} (ResourceStatus enum)`,
                    RESOURCE,
                    op,
                    ResourceStatusOptions,
                    1,
                );
            }
            if (isWorkingStatusParam(p)) {
                return createOptionsProperty(
                    p,
                    'Working Status',
                    `${p} parameter for ${op} (1=INTERNAL, 2=EXTERNAL)`,
                    RESOURCE,
                    op,
                    WorkingStatusOptions,
                    1,
                );
            }
            if (isResourceTypeParam(p)) {
                return createOptionsProperty(
                    p,
                    'Resource Type',
                    `${p} parameter for ${op} (ResourceType enum)`,
                    RESOURCE,
                    op,
                    ResourceTypeOptions,
                    '', // No default value - only include if user sets it
                    true, // Required for mandatory fields
                    true, // Add empty option for better UX
                );
            }
            if (isFormOfAddressParam(p)) {
                return createOptionsProperty(
                    p,
                    'Form of Address',
                    `${p} parameter for ${op} (FormOfAddressType enum)`,
                    RESOURCE,
                    op,
                    FormOfAddressOptions,
                    '', // No default value - only include if user sets it
                    true, // Required for mandatory fields
                    true, // Add empty option for better UX
                );
            }
            if (op === 'update' && p === 'enableNullOrEmptyValues') {
                return createBooleanProperty(
                    p,
                    'Overwrite with Empty Values',
                    'Empty inputs overwrite existing values (otherwise they are ignored).',
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
        if (op !== 'insertObject' && op !== 'update') return [];

        const mandatoryFields = MANDATORY_FIELDS[op] || [];
        const optionalFields = RESOURCE_IN_FIELDS.filter(f => 
            !mandatoryFields.includes(f) && 
            f !== 'status' &&
            f !== 'workingStatus'
        );

        // Create options for the collection
        const collectionOptions = optionalFields.map(field => {
            const fieldType = FIELD_TYPES[field] || 'string';
            const displayName = labelize(field);

            // Handle special enum fields
            if (isResourceTypeParam(field)) {
                return {
                    displayName: 'Resource Type',
                    name: field,
                    type: 'options' as const,
                    options: [
                        { name: 'Please select...', value: '' },
                        ...ResourceTypeOptions
                    ],
                    default: '',
                    description: `${field} parameter (ResourceType enum)`,
                };
            }
            if (isFormOfAddressParam(field)) {
                return {
                    displayName: 'Form of Address',
                    name: field,
                    type: 'options' as const,
                    options: [
                        { name: 'Please select...', value: '' },
                        ...FormOfAddressOptions
                    ],
                    default: '',
                    description: `${field} parameter (FormOfAddressType enum)`,
                };
            }
            if (isStatusParam(field)) {
                return {
                    displayName: 'Status',
                    name: field,
                    type: 'options' as const,
                    options: [
                        { name: 'Please select...', value: '' },
                        ...ResourceStatusOptions
                    ],
                    default: '',
                    description: `${field} parameter (ResourceStatus enum)`,
                };
            }
            if (isWorkingStatusParam(field)) {
                return {
                    displayName: 'Working Status',
                    name: field,
                    type: 'options' as const,
                    options: [
                        { name: 'Please select...', value: '' },
                        ...WorkingStatusOptions
                    ],
                    default: '',
                    description: `${field} parameter (1=INTERNAL, 2=EXTERNAL)`,
                };
            }

            // Handle regular fields
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
    
    // Keep non-RESOURCE_IN_FIELDS as regular properties
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params
            .filter(p => !(RESOURCE_IN_FIELDS as readonly string[]).includes(p) && !MANDATORY_FIELDS[op]?.includes(p))
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

function buildResourceINXml(
    ctx: IExecuteFunctions,
    itemIndex: number,
    fields: readonly string[],
    includeEmpty: boolean,
): string {
    const lines: string[] = ['<ResourceIN>'];
    
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
            
            // Special handling for "enableNullOrEmptyValues" - always include it
            if (name === 'enableNullOrEmptyValues') {
                lines.push(`  <${name}>${escapeXml(val)}</${name}>`);
            }
            // Only include field if it has a meaningful value
            // For optional fields, only include if they're not empty or if includeEmpty is true
            else if (val !== '' && val !== '0' && val !== 'false') {
                lines.push(`  <${name}>${escapeXml(val)}</${name}>`);
            } else if (includeEmpty && val !== '') {
                lines.push(`  <${name}>${escapeXml(val)}</${name}>`);
            }
        } catch (error) {
            // If parameter doesn't exist, skip it (don't add empty tag)
            // This prevents including fields that weren't set by the user
        }
    }
    
    lines.push('</ResourceIN>');
    return lines.join('\n      ');
}

// Build <SearchFilter_Resource>…</SearchFilter_Resource>
function buildResourceSearchFilterXml(
    ctx: IExecuteFunctions,
    itemIndex: number,
    fields: readonly string[],
): string {
    const lines: string[] = ['<SearchFilter_Resource>'];
    for (const name of fields) {
        const raw = ctx.getNodeParameter(name, itemIndex, '');
        const val = toSoapParamValue(raw, name);
        if (val !== '') {
            lines.push(`  <${name}>${escapeXml(val)}</${name}>`);
        }
    }
    lines.push('</SearchFilter_Resource>');
    return lines.join('\n      ');
}

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
                case 'Resource': {
                    const r = parseResourceResult(xml);
                    const res = (r as any).resource || undefined;
                    const statusName = idToResourceStatusName(res?.status ?? res?.Status);
                    const typeName = idToResourceTypeName(res?.resourceType ?? res?.ResourceType);
                    const wsId = res?.workingStatus ?? res?.WorkingStatus;
                    const wsName = wsId === 1 ? 'INTERNAL' : wsId === 2 ? 'EXTERNAL' : undefined;
                    const foaName = idToFormOfAddressName(res?.formOfAddress ?? res?.FormOfAddress);
                    const resource = res ? {
                        ...res,
                        ...(statusName ? { status: statusName } : {}),
                        ...(typeName ? { resourceType: typeName } : {}),
                        ...(wsName ? { workingStatus: wsName } : {}),
                        ...(foaName ? { formOfAddressName: foaName } : {}),
                    } : undefined;
                    payload = { resource, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
            if (op === 'insertObject') {
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

                const resourceIn = buildResourceINXml(ctx, itemIndex, fieldsToInclude, false);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${resourceIn}`;
            } else if (op === 'update') {
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
                
                const en = itemParams.enableNullOrEmptyValues as boolean || false;

                const resourceIn = buildResourceINXml(ctx, itemIndex, fieldsToInclude, en);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${resourceIn}\n<enableNullOrEmptyValues>${en ? '1' : '0'}</enableNullOrEmptyValues>`;
            } else if (op === 'search') {
                // Build <SearchFilter_Resource> with search fields
                const searchFilter = buildResourceSearchFilterXml(ctx, itemIndex, RESOURCE_SEARCH_FILTER_FIELDS);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${searchFilter}`;
            } else if (op === 'delete') {
                // Simple delete operation - just UUID and resourceID
                const resourceID = ctx.getNodeParameter('resourceID', itemIndex) as number;
                return `<UUID>${escapeXml(sessionId)}</UUID>\n<resourceID>${escapeXml(String(resourceID))}</resourceID>`;
            }
            return null;
        },
    );
}

/** Service export */
export const DataResource30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core operations for DataResource30',
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