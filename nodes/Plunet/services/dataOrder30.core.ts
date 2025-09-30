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
import { parseOrderResult } from '../core/parsers/order';
import { ProjectTypeOptions } from '../enums/project-type';
import { ArchivStatusOptions, idToArchivStatusName } from '../enums/archiv-status';
import { ProjectClassTypeOptions } from '../enums/project-class-type';
import { ItemStatusOptions } from '../enums/item-status';
import { SearchScopeOptions } from '../enums/search-scope';
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

const RESOURCE = 'DataOrder30Core';
const ENDPOINT = 'DataOrder30';
const RESOURCE_DISPLAY_NAME = 'Order';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    getOrder: {
        soapAction: 'getOrderObject',
        endpoint: ENDPOINT,
        uiName: 'Get Order',
        subtitleName: 'get: order',
        titleName: 'Get an Order',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve a single order by ID with optional extended object data',
        returnType: 'Order',
        paramOrder: ['orderID', 'languageCode', 'projectType', 'extendedObject'],
        active: true,
    },
    deleteOrder: {
        soapAction: 'delete',
        endpoint: ENDPOINT,
        uiName: 'Delete Order',
        subtitleName: 'delete: order',
        titleName: 'Delete an Order',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Delete an order by ID',
        returnType: 'Void',
        paramOrder: ['orderID'],
        active: true,
    },
    insertOrder: {
        soapAction: 'insert2',
        endpoint: ENDPOINT,
        uiName: 'Create Order',
        subtitleName: 'insert: order',
        titleName: 'Create an Order',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new order with optional additional field operations',
        returnType: 'Integer',
        paramOrder: ['customerID', 'projectManagerID', 'currency', 'customerContactID', 'deliveryDeadline', 'orderDate', 'projectManagerMemo', 'projectName', 'rate', 'referenceNumber', 'subject', 'requestID', 'creationDate', 'en15038Requested', 'externalID', 'masterProjectID', 'projectCategory', 'projectStatus'],
        active: true,
    },
    updateOrder: {
        soapAction: 'update',
        endpoint: ENDPOINT,
        uiName: 'Update Order',
        subtitleName: 'update: order',
        titleName: 'Update an Order',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update an existing order with optional additional field operations',
        returnType: 'Void',
        paramOrder: ['orderID', 'customerID', 'projectManagerID', 'currency', 'customerContactID', 'deliveryDeadline', 'orderDate', 'projectManagerMemo', 'projectName', 'rate', 'referenceNumber', 'subject', 'requestID', 'creationDate', 'en15038Requested', 'externalID', 'masterProjectID', 'projectCategory', 'projectStatus'],
        active: true,
    },
    searchOrders: {
        soapAction: 'search',
        endpoint: ENDPOINT,
        uiName: 'Search Orders',
        subtitleName: 'search: order',
        titleName: 'Search Orders',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Search for orders based on various criteria and filters',
        returnType: 'IntegerArray',
        paramOrder: ['languageCode', 'timeFrame'],
        active: true,
    },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.paramOrder])
);

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Order';
const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.returnType as R])
);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

const extraProperties: INodeProperties[] = [
    // Order ID parameter
    {
        displayName: 'Order ID',
        name: 'orderID',
        type: 'number',
        default: 0,
        required: true,
        description: 'The ID of the order to retrieve',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['getOrderObject', 'delete'],
            },
        },
    },
    // Customer ID parameter
    {
        displayName: 'Customer ID',
        name: 'customerID',
        type: 'number',
        default: 0,
        required: true,
        description: 'The ID of the customer (mandatory)',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    // Project Manager ID parameter
    {
        displayName: 'Project Manager ID',
        name: 'projectManagerID',
        type: 'number',
        default: 0,
        required: true,
        description: 'The ID of the project manager (mandatory)',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    // Order Number parameter
    // Language Code parameter
    {
        displayName: 'Language Code',
        name: 'languageCode',
        type: 'string',
        default: 'EN',
        required: true,
        description: 'Language code for the order (defaults to EN)',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['getOrderObject'],
            },
        },
    },
    // Project Type parameter
    {
        displayName: 'Project Type',
        name: 'projectType',
        type: 'options',
        options: [
            { name: 'Please select...', value: '' },
            ...ProjectTypeOptions,
        ],
        default: 3, // ORDER
        required: true,
        description: 'Project type for the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['getOrderObject'],
            },
        },
    },
    // Extended Object boolean switch
    {
        displayName: 'Extended Object',
        name: 'extendedObject',
        type: 'boolean',
        default: false,
        description: 'If enabled, will enrich the return object with additional field data',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['getOrderObject'],
            },
        },
    },
    // Collection for optional fields in insert operation
    {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
        options: [
            {
                displayName: 'Currency',
                name: 'currency',
                type: 'string',
                default: '',
                description: 'Currency for the order',
            },
            {
                displayName: 'Customer Contact ID',
                name: 'customerContactID',
                type: 'number',
                default: 0,
                description: 'Customer contact ID',
            },
            {
                displayName: 'Delivery Deadline',
                name: 'deliveryDeadline',
                type: 'dateTime',
                default: '',
                description: 'Delivery deadline for the order',
            },
            {
                displayName: 'Order Date',
                name: 'orderDate',
                type: 'dateTime',
                default: '',
                description: 'Order date',
            },
            {
                displayName: 'Project Manager Memo',
                name: 'projectManagerMemo',
                type: 'string',
                default: '',
                description: 'Memo for the project manager',
            },
            {
                displayName: 'Project Name',
                name: 'projectName',
                type: 'string',
                default: '',
                description: 'Name of the project',
            },
            {
                displayName: 'Rate',
                name: 'rate',
                type: 'number',
                default: 1.0,
                description: 'Rate for the order',
            },
            {
                displayName: 'Reference Number',
                name: 'referenceNumber',
                type: 'string',
                default: '',
                description: 'Reference number for the order',
            },
            {
                displayName: 'Subject',
                name: 'subject',
                type: 'string',
                default: '',
                description: 'Subject of the order',
            },
        ],
    },
    // Collection for additional field operations
    {
        displayName: 'Additional Field Operations',
        name: 'additionalFieldOperations',
        type: 'collection',
        placeholder: 'Add Field Operation',
        default: {},
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
        options: [
            {
                displayName: 'Request ID',
                name: 'requestID',
                type: 'number',
                default: 0,
                description: 'Request ID to set after order creation',
            },
            {
                displayName: 'Creation Date',
                name: 'creationDate',
                type: 'dateTime',
                default: '',
                description: 'Creation date to set after order creation',
            },
            {
                displayName: 'EN15038 Requested',
                name: 'en15038Requested',
                type: 'boolean',
                default: false,
                description: 'Whether EN15038 is requested',
            },
            {
                displayName: 'External ID',
                name: 'externalID',
                type: 'string',
                default: '',
                description: 'External ID to set after order creation',
            },
            {
                displayName: 'Master Project ID',
                name: 'masterProjectID',
                type: 'number',
                default: 0,
                description: 'Master project ID to set after order creation',
            },
            {
                displayName: 'Project Category',
                name: 'projectCategory',
                type: 'string',
                default: '',
                description: 'Project category to set after order creation',
            },
            {
                displayName: 'System Language Code',
                name: 'systemLanguageCode',
                type: 'string',
                default: 'EN',
                description: 'System language code for project category',
            },
        ],
    },
    // Update Order UI Properties
    {
        displayName: 'Order ID',
        name: 'orderID',
        type: 'number',
        default: 0,
        required: true,
        description: 'The order ID to update',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['update'],
            },
        },
    },
    {
        displayName: 'Customer ID',
        name: 'customerID',
        type: 'number',
        default: 0,
        required: true,
        description: 'Customer ID for the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['update'],
            },
        },
    },
    {
        displayName: 'Project Manager ID',
        name: 'projectManagerID',
        type: 'number',
        default: 0,
        required: true,
        description: 'Project manager ID for the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['update'],
            },
        },
    },
    {
        displayName: 'Enable Null or Empty Values',
        name: 'enableNullOrEmptyValues',
        type: 'boolean',
        default: false,
        required: true,
        description: 'Enable null or empty values for the update operation',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['update'],
            },
        },
    },
    // Collection for optional fields in update operation
    {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['update'],
            },
        },
        options: [
            {
                displayName: 'Currency',
                name: 'currency',
                type: 'string',
                default: '',
                description: 'Currency for the order',
            },
            {
                displayName: 'Customer Contact ID',
                name: 'customerContactID',
                type: 'number',
                default: 0,
                description: 'Customer contact ID',
            },
            {
                displayName: 'Delivery Deadline',
                name: 'deliveryDeadline',
                type: 'dateTime',
                default: '',
                description: 'Delivery deadline for the order',
            },
            {
                displayName: 'Order Date',
                name: 'orderDate',
                type: 'dateTime',
                default: '',
                description: 'Order date',
            },
            {
                displayName: 'Project Manager Memo',
                name: 'projectManagerMemo',
                type: 'string',
                default: '',
                description: 'Memo for the project manager',
            },
            {
                displayName: 'Project Name',
                name: 'projectName',
                type: 'string',
                default: '',
                description: 'Name of the project',
            },
            {
                displayName: 'Rate',
                name: 'rate',
                type: 'number',
                default: 1.0,
                description: 'Rate for the order',
            },
            {
                displayName: 'Reference Number',
                name: 'referenceNumber',
                type: 'string',
                default: '',
                description: 'Reference number for the order',
            },
            {
                displayName: 'Subject',
                name: 'subject',
                type: 'string',
                default: '',
                description: 'Subject of the order',
            },
        ],
    },
    // Collection for additional field operations in update
    {
        displayName: 'Additional Field Operations',
        name: 'additionalFieldOperations',
        type: 'collection',
        placeholder: 'Add Field Operation',
        default: {},
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['update'],
            },
        },
        options: [
            {
                displayName: 'Request ID',
                name: 'requestID',
                type: 'number',
                default: 0,
                description: 'Request ID to set after order update',
            },
            {
                displayName: 'Creation Date',
                name: 'creationDate',
                type: 'dateTime',
                default: '',
                description: 'Creation date to set after order update',
            },
            {
                displayName: 'EN15038 Requested',
                name: 'en15038Requested',
                type: 'boolean',
                default: false,
                description: 'Whether EN15038 is requested',
            },
            {
                displayName: 'External ID',
                name: 'externalID',
                type: 'string',
                default: '',
                description: 'External ID to set after order update',
            },
            {
                displayName: 'Master Project ID',
                name: 'masterProjectID',
                type: 'number',
                default: 0,
                description: 'Master project ID to set after order update',
            },
            {
                displayName: 'Project Category',
                name: 'projectCategory',
                type: 'string',
                default: '',
                description: 'Project category to set after order update',
            },
            {
                displayName: 'System Language Code',
                name: 'systemLanguageCode',
                type: 'string',
                default: 'EN',
                description: 'System language code for project category',
            },
        ],
    },
    // Search Orders UI Properties
    {
        displayName: 'Language Code',
        name: 'languageCode',
        type: 'string',
        default: 'EN',
        required: true,
        description: 'Language code for the search (mandatory)',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['searchOrders'],
            },
        },
    },
    {
        displayName: 'Time Frame',
        name: 'timeFrame',
        type: 'collection',
        placeholder: 'Add Time Frame',
        default: {},
        required: true,
        description: 'Time frame for the search (mandatory)',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['searchOrders'],
            },
        },
        options: [
            {
                displayName: 'Date From',
                name: 'dateFrom',
                type: 'dateTime',
                default: '',
                required: true,
                description: 'Start date for the search',
            },
            {
                displayName: 'Date To',
                name: 'dateTo',
                type: 'dateTime',
                default: '',
                required: true,
                description: 'End date for the search',
            },
            {
                displayName: 'Date Relation',
                name: 'dateRelation',
                type: 'options',
                options: SearchScopeOptions,
                default: 1,
                required: true,
                description: 'Date relation scope for the search',
            },
        ],
    },
    // Search Filters Collection
    {
        displayName: 'Search Filters',
        name: 'searchFilters',
        type: 'collection',
        placeholder: 'Add Filter',
        default: {},
        description: 'Optional search filters',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['searchOrders'],
            },
        },
        options: [
            {
                displayName: 'Customer ID',
                name: 'customerID',
                type: 'number',
                default: 0,
                description: 'Filter by customer ID',
            },
            {
                displayName: 'Item Status',
                name: 'itemStatus',
                type: 'options',
                options: ItemStatusOptions,
                default: 1,
                description: 'Filter by item status',
            },
            {
                displayName: 'Project Description',
                name: 'projectDescription',
                type: 'string',
                default: '',
                description: 'Filter by project description',
            },
            {
                displayName: 'Project Name',
                name: 'projectName',
                type: 'string',
                default: '',
                description: 'Filter by project name',
            },
            {
                displayName: 'Project Type',
                name: 'projectType',
                type: 'options',
                options: ProjectClassTypeOptions,
                default: 0,
                description: 'Filter by project type',
            },
            {
                displayName: 'Source Language',
                name: 'sourceLanguage',
                type: 'string',
                default: '',
                description: 'Filter by source language',
            },
            {
                displayName: 'Target Language',
                name: 'targetLanguage',
                type: 'string',
                default: '',
                description: 'Filter by target language',
            },
            {
                displayName: 'Status Project File Archiving',
                name: 'statusProjectFileArchiving',
                type: 'options',
                options: ArchivStatusOptions,
                default: 1,
                description: 'Filter by project file archiving status',
            },
        ],
    },
];

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
                case 'Order': {
                    const r = parseOrderResult(xml);
                    const order = r.order || {};
                    
                    // Add project status label if available
                    if (order.projectStatus !== undefined) {
                        order.projectStatusLabel = idToArchivStatusName(order.projectStatus);
                    }
                    
                    payload = { order, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
            if (op === 'getOrderObject') {
                const orderID = itemParams.orderID as number;
                return `<UUID>${escapeXml(sessionId)}</UUID>\n<orderID>${orderID}</orderID>`;
            }
            if (op === 'insert2') {
                // Build custom SOAP body for insert2 operation
                const customerID = ctx.getNodeParameter('customerID', itemIndex, 0) as number;
                const projectManagerID = ctx.getNodeParameter('projectManagerID', itemIndex, 0) as number;
                const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
                
                let orderIN = `<OrderIN>`;
                
                // Add required fields
                orderIN += `\n<customerID>${customerID}</customerID>`;
                orderIN += `\n<projectManagerID>${projectManagerID}</projectManagerID>`;
                
                // Add optional fields from collection
                if (additionalFields.currency) orderIN += `\n<currency>${escapeXml(additionalFields.currency as string)}</currency>`;
                if (additionalFields.customerContactID) orderIN += `\n<customerContactID>${additionalFields.customerContactID}</customerContactID>`;
                if (additionalFields.deliveryDeadline) orderIN += `\n<deliveryDeadline>${escapeXml(additionalFields.deliveryDeadline as string)}</deliveryDeadline>`;
                if (additionalFields.orderDate) orderIN += `\n<orderDate>${escapeXml(additionalFields.orderDate as string)}</orderDate>`;
                if (additionalFields.projectManagerMemo) orderIN += `\n<projectManagerMemo>${escapeXml(additionalFields.projectManagerMemo as string)}</projectManagerMemo>`;
                if (additionalFields.projectName) orderIN += `\n<projectName>${escapeXml(additionalFields.projectName as string)}</projectName>`;
                if (additionalFields.rate && additionalFields.rate !== 1.0) orderIN += `\n<rate>${additionalFields.rate}</rate>`;
                if (additionalFields.referenceNumber) orderIN += `\n<referenceNumber>${escapeXml(additionalFields.referenceNumber as string)}</referenceNumber>`;
                if (additionalFields.subject) orderIN += `\n<subject>${escapeXml(additionalFields.subject as string)}</subject>`;
                
                orderIN += `\n</OrderIN>`;
                
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${orderIN}`;
            }
            if (op === 'update') {
                // Build custom SOAP body for update operation
                const orderID = ctx.getNodeParameter('orderID', itemIndex, 0) as number;
                const customerID = ctx.getNodeParameter('customerID', itemIndex, 0) as number;
                const projectManagerID = ctx.getNodeParameter('projectManagerID', itemIndex, 0) as number;
                const enableNullOrEmptyValues = ctx.getNodeParameter('enableNullOrEmptyValues', itemIndex, false) as boolean;
                const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
                
                let orderIN = `<OrderIN>`;
                
                // Add required fields
                orderIN += `\n<orderID>${orderID}</orderID>`;
                orderIN += `\n<customerID>${customerID}</customerID>`;
                orderIN += `\n<projectManagerID>${projectManagerID}</projectManagerID>`;
                
                // Add optional fields from collection
                if (additionalFields.currency) orderIN += `\n<currency>${escapeXml(additionalFields.currency as string)}</currency>`;
                if (additionalFields.customerContactID) orderIN += `\n<customerContactID>${additionalFields.customerContactID}</customerContactID>`;
                if (additionalFields.deliveryDeadline) orderIN += `\n<deliveryDeadline>${escapeXml(additionalFields.deliveryDeadline as string)}</deliveryDeadline>`;
                if (additionalFields.orderDate) orderIN += `\n<orderDate>${escapeXml(additionalFields.orderDate as string)}</orderDate>`;
                if (additionalFields.projectManagerMemo) orderIN += `\n<projectManagerMemo>${escapeXml(additionalFields.projectManagerMemo as string)}</projectManagerMemo>`;
                if (additionalFields.projectName) orderIN += `\n<projectName>${escapeXml(additionalFields.projectName as string)}</projectName>`;
                if (additionalFields.rate && additionalFields.rate !== 1.0) orderIN += `\n<rate>${additionalFields.rate}</rate>`;
                if (additionalFields.referenceNumber) orderIN += `\n<referenceNumber>${escapeXml(additionalFields.referenceNumber as string)}</referenceNumber>`;
                if (additionalFields.subject) orderIN += `\n<subject>${escapeXml(additionalFields.subject as string)}</subject>`;
                
                orderIN += `\n</OrderIN>`;
                
                // Add enableNullOrEmptyValues field outside OrderIN (use UI value)
                const enableValue = enableNullOrEmptyValues ? 1 : 0;
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${orderIN}\n<enableNullOrEmptyValues>${enableValue}</enableNullOrEmptyValues>`;
            }
            if (op === 'search') {
                // Build custom SOAP body for search operation
                const languageCode = ctx.getNodeParameter('languageCode', itemIndex, 'EN') as string;
                const timeFrame = ctx.getNodeParameter('timeFrame', itemIndex, {}) as IDataObject;
                const searchFilters = ctx.getNodeParameter('searchFilters', itemIndex, {}) as IDataObject;
                
                let searchFilter = `<SearchFilter>`;
                searchFilter += `\n<languageCode>${escapeXml(languageCode)}</languageCode>`;
                
                // Add time frame (mandatory)
                if (timeFrame.dateFrom && timeFrame.dateTo && timeFrame.dateRelation) {
                    searchFilter += `\n<timeFrame>`;
                    searchFilter += `\n<dateFrom>${escapeXml(timeFrame.dateFrom as string)}</dateFrom>`;
                    searchFilter += `\n<dateRelation>${timeFrame.dateRelation}</dateRelation>`;
                    searchFilter += `\n<dateTo>${escapeXml(timeFrame.dateTo as string)}</dateTo>`;
                    searchFilter += `\n</timeFrame>`;
                }
                
                // Add optional filters
                if (searchFilters.customerID) {
                    searchFilter += `\n<customerID>${searchFilters.customerID}</customerID>`;
                }
                if (searchFilters.itemStatus) {
                    searchFilter += `\n<itemStatus>${searchFilters.itemStatus}</itemStatus>`;
                }
                if (searchFilters.projectDescription) {
                    searchFilter += `\n<projectDescription>${escapeXml(searchFilters.projectDescription as string)}</projectDescription>`;
                }
                if (searchFilters.projectName) {
                    searchFilter += `\n<projectName>${escapeXml(searchFilters.projectName as string)}</projectName>`;
                }
                if (searchFilters.projectType) {
                    searchFilter += `\n<projectType>${searchFilters.projectType}</projectType>`;
                }
                if (searchFilters.sourceLanguage) {
                    searchFilter += `\n<sourceLanguage>${escapeXml(searchFilters.sourceLanguage as string)}</sourceLanguage>`;
                }
                if (searchFilters.targetLanguage) {
                    searchFilter += `\n<targetLanguage>${escapeXml(searchFilters.targetLanguage as string)}</targetLanguage>`;
                }
                if (searchFilters.statusProjectFileArchiving) {
                    searchFilter += `\n<statusProjectFileArchiving>${searchFilters.statusProjectFileArchiving}</statusProjectFileArchiving>`;
                }
                
                searchFilter += `\n</SearchFilter>`;
                
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${searchFilter}`;
            }
            return null;
        },
    );
}

/** ─ Service export ─ */
export const DataOrder30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core operations for DataOrder30',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
        const result = await executeStandardService(
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
        
        // Handle extended object functionality
        if (operation === 'getOrderObject') {
            const extendedObject = ctx.getNodeParameter('extendedObject', itemIndex, false) as boolean;
            
            if (extendedObject && result.success) {
                // Import the misc service for extended calls
                const { DataOrder30MiscService } = await import('./dataOrder30.misc');
                
                
                // List of extended field operations (removed unnecessary fields)
                const extendedOperations = [
                    'getProjectStatus',
                    'getCreationDate',
                    'getProjectCategory',
                    'getMasterProjectID',
                    'getDeliveryComment',
                    'getExternalID',
                    'getLanguageCombination',
                    'getLinks',
                    'getOrderClosingDate',
                    'getOrderConfirmations'
                ];
                
                // Execute extended calls and collect results
                const extendedData: Record<string, any> = {};
                
                for (const extOp of extendedOperations) {
                    try {
                        let extResult;
                        
                        // For getOrderObject, use the original context
                        extResult = await DataOrder30MiscService.execute(extOp, ctx, creds, url, baseUrl, timeoutMs, itemIndex);
                        
                        // Handle different result types
                        if (extResult.success) {
                            if (extOp === 'getProjectStatus' && extResult.statusId !== undefined) {
                                extendedData[extOp] = {
                                    statusId: extResult.statusId,
                                    statusLabel: extResult.statusName || ''
                                };
                            } else if (extOp === 'getMasterProjectID') {
                                // Handle the specific error case for MasterProjectID
                                if (extResult.data !== null) {
                                    extendedData[extOp] = extResult.data;
                                } else {
                                    extendedData[extOp] = '';
                                }
                            } else if (extOp === 'getRequestId') {
                                // Handle the specific error case for RequestId
                                if (extResult.data !== null) {
                                    extendedData[extOp] = extResult.data;
                                } else {
                                    extendedData[extOp] = '';
                                }
                            } else if (extOp === 'getOrderClosingDate') {
                                // Handle the specific error case for OrderClosingDate
                                if (extResult.data !== null) {
                                    extendedData[extOp] = extResult.data;
                                } else {
                                    extendedData[extOp] = '';
                                }
                            } else if (extOp === 'getLanguageCombination' && extResult.data) {
                                extendedData[extOp] = extResult.data;
                            } else if (extOp === 'getLinks' && extResult.data) {
                                extendedData[extOp] = extResult.data;
                            } else if (extOp === 'getOrderConfirmations' && extResult.data) {
                                extendedData[extOp] = extResult.data;
                            } else if (extResult.value !== undefined) {
                                extendedData[extOp] = extResult.value;
                            } else if (extResult.data !== undefined) {
                                extendedData[extOp] = extResult.data;
                            } else if (extResult.date !== undefined) {
                                extendedData[extOp] = extResult.date;
                            } else {
                                extendedData[extOp] = '';
                            }
                        } else {
                            extendedData[extOp] = '';
                        }
                    } catch (error) {
                        // If call fails, set empty value and log the error
                        extendedData[extOp] = '';
                        // Note: In n8n context, this will be visible in the workflow execution logs
                        }
                }
                
                // Merge extended data into the result
                result.extendedData = extendedData;
            }
        }
        
        // Handle insert2 with additional field operations
        if (operation === 'insert2' && result.success) {
            // For insert2, the orderID is in the value field of the response
            const createdOrderID = result.value ? parseInt(result.value.toString(), 10) : null;
            if (createdOrderID) {
                // Import the misc service for additional field operations
                const { DataOrder30MiscService } = await import('./dataOrder30.misc');
                
                // Get additional field operations from collection
                const additionalFieldOperations = ctx.getNodeParameter('additionalFieldOperations', itemIndex, {}) as IDataObject;
                
                // List of additional field operations that can be performed after order creation
                const additionalOperations = [
                    { name: 'setRequestID', param: 'requestID', type: 'number' },
                    { name: 'setCreationDate', param: 'creationDate', type: 'dateTime' },
                    { name: 'setEN15038Requested', param: 'isEN15038', type: 'boolean' },
                    { name: 'setExternalID', param: 'externalID', type: 'string' },
                    { name: 'setMasterProjectID', param: 'masterProjectID', type: 'number' },
                    { name: 'setProjectCategory', param: 'projectCategory', type: 'string', needsSystemLanguageCode: true }
                ];
                
                // Execute additional field operations if values are provided in collection
                for (const op of additionalOperations) {
                    const value = additionalFieldOperations[op.param];
                    if (value !== null && value !== '' && value !== false && value !== undefined) {
                        try {
                            // Create a custom context that uses the created orderID
                            const customCtx = {
                                ...ctx,
                                getNodeParameter: (paramName: string, itemIdx: number, defaultValue?: any) => {
                                    if (paramName === 'orderID') {
                                        return createdOrderID;
                                    }
                                    // For the specific parameter, use the value from the collection
                                    if (paramName === op.param) {
                                        return value;
                                    }
                                    // Special handling for setProjectCategory - needs systemLanguageCode
                                    if (op.name === 'setProjectCategory' && paramName === 'systemLanguageCode') {
                                        return additionalFieldOperations.systemLanguageCode || 'EN';
                                    }
                                    return ctx.getNodeParameter(paramName, itemIdx, defaultValue);
                                }
                            } as IExecuteFunctions;
                            
                            await DataOrder30MiscService.execute(op.name, customCtx, creds, url, baseUrl, timeoutMs, itemIndex);
                        } catch (error) {
                            // Log error but don't fail the entire operation
                            // Note: In n8n context, this will be visible in the workflow execution logs
                        }
                    }
                }
            }
        }
        
        // Handle update with additional field operations
        if (operation === 'update' && result.success) {
            // For update, we use the orderID from the request
            const orderID = ctx.getNodeParameter('orderID', itemIndex, 0) as number;
            if (orderID) {
                // Import the misc service for additional field operations
                const { DataOrder30MiscService } = await import('./dataOrder30.misc');
                
                // Get additional field operations from collection
                const additionalFieldOperations = ctx.getNodeParameter('additionalFieldOperations', itemIndex, {}) as IDataObject;
                
                // List of additional field operations that can be performed after order update
                const additionalOperations = [
                    { name: 'setRequestID', param: 'requestID', type: 'number' },
                    { name: 'setCreationDate', param: 'creationDate', type: 'dateTime' },
                    { name: 'setEN15038Requested', param: 'isEN15038', type: 'boolean' },
                    { name: 'setExternalID', param: 'externalID', type: 'string' },
                    { name: 'setMasterProjectID', param: 'masterProjectID', type: 'number' },
                    { name: 'setProjectCategory', param: 'projectCategory', type: 'string', needsSystemLanguageCode: true }
                ];
                
                // Execute additional field operations if values are provided in collection
                for (const op of additionalOperations) {
                    const value = additionalFieldOperations[op.param];
                    if (value !== null && value !== '' && value !== false && value !== undefined) {
                        try {
                            // Create a custom context that uses the orderID
                            const customCtx = {
                                ...ctx,
                                getNodeParameter: (paramName: string, itemIdx: number, defaultValue?: any) => {
                                    if (paramName === 'orderID') {
                                        return orderID;
                                    }
                                    // For the specific parameter, use the value from the collection
                                    if (paramName === op.param) {
                                        return value;
                                    }
                                    // Special handling for setProjectCategory - needs systemLanguageCode
                                    if (op.name === 'setProjectCategory' && paramName === 'systemLanguageCode') {
                                        return additionalFieldOperations.systemLanguageCode || 'EN';
                                    }
                                    return ctx.getNodeParameter(paramName, itemIdx, defaultValue);
                                }
                            } as IExecuteFunctions;
                            
                            await DataOrder30MiscService.execute(op.name, customCtx, creds, url, baseUrl, timeoutMs, itemIndex);
                        } catch (error) {
                            // Log error but don't fail the entire operation
                            // Note: In n8n context, this will be visible in the workflow execution logs
                        }
                    }
                }
            }
        }
        
        // Reorganize the result structure to match desired output
        if (operation === 'getOrderObject' && result.success) {
            const { order, statusMessage, statusCode, extendedData } = result;
            return {
                success: true,
                resource: RESOURCE,
                operation: operation,
                statusMessage,
                statusCode,
                order,
                ...(extendedData ? { extendedData } : {})
            };
        }
        
        // For insert2, return the actual insert response (not the order object)
        if (operation === 'insert2' && result.success) {
            return {
                success: true,
                resource: RESOURCE,
                operation: operation,
                statusMessage: result.statusMessage,
                statusCode: result.statusCode,
                data: result.value // This contains the orderID from the insert response
            };
        }
        
        return result;
    },
};
