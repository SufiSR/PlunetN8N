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
const RESOURCE_DISPLAY_NAME = 'Order (BETA)';

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
    getOrderByNumber: {
        soapAction: 'getOrderObject2',
        endpoint: ENDPOINT,
        uiName: 'Get Order by Number',
        subtitleName: 'get: order by number',
        titleName: 'Get an Order by Number',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve a single order by order number with optional extended object data',
        returnType: 'Order',
        paramOrder: ['orderNumber', 'languageCode', 'projectType', 'extendedObject'],
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
    {
        displayName: 'Order Number',
        name: 'orderNumber',
        type: 'string',
        default: '',
        required: true,
        description: 'The order number to retrieve',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['getOrderObject2'],
            },
        },
    },
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
                operation: ['getOrderObject', 'getOrderObject2'],
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
                operation: ['getOrderObject', 'getOrderObject2'],
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
                operation: ['getOrderObject', 'getOrderObject2'],
            },
        },
    },
    // Optional fields for insert operation
    {
        displayName: 'Currency',
        name: 'currency',
        type: 'string',
        default: '',
        description: 'Currency for the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Customer Contact ID',
        name: 'customerContactID',
        type: 'number',
        default: 0,
        description: 'Customer contact ID',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Delivery Deadline',
        name: 'deliveryDeadline',
        type: 'dateTime',
        default: '',
        description: 'Delivery deadline for the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Order Date',
        name: 'orderDate',
        type: 'dateTime',
        default: '',
        description: 'Order date',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Project Manager Memo',
        name: 'projectManagerMemo',
        type: 'string',
        default: '',
        description: 'Memo for the project manager',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Project Name',
        name: 'projectName',
        type: 'string',
        default: '',
        description: 'Name of the project',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Rate',
        name: 'rate',
        type: 'number',
        default: 1.0,
        description: 'Rate for the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Reference Number',
        name: 'referenceNumber',
        type: 'string',
        default: '',
        description: 'Reference number for the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Subject',
        name: 'subject',
        type: 'string',
        default: '',
        description: 'Subject of the order',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    // Additional field operations
    {
        displayName: 'Request ID',
        name: 'requestID',
        type: 'number',
        default: 0,
        description: 'Request ID to set after order creation',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Creation Date',
        name: 'creationDate',
        type: 'dateTime',
        default: '',
        description: 'Creation date to set after order creation',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'EN15038 Requested',
        name: 'en15038Requested',
        type: 'boolean',
        default: false,
        description: 'Whether EN15038 is requested',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'External ID',
        name: 'externalID',
        type: 'string',
        default: '',
        description: 'External ID to set after order creation',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Master Project ID',
        name: 'masterProjectID',
        type: 'number',
        default: 0,
        description: 'Master project ID to set after order creation',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Project Category',
        name: 'projectCategory',
        type: 'string',
        default: '',
        description: 'Project category to set after order creation',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
    },
    {
        displayName: 'Project Status',
        name: 'projectStatus',
        type: 'options',
        options: ArchivStatusOptions,
        default: 1,
        description: 'Project status to set after order creation',
        displayOptions: {
            show: {
                resource: [RESOURCE],
                operation: ['insert2'],
            },
        },
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
                const currency = ctx.getNodeParameter('currency', itemIndex, '') as string;
                const customerContactID = ctx.getNodeParameter('customerContactID', itemIndex, 0) as number;
                const deliveryDeadline = ctx.getNodeParameter('deliveryDeadline', itemIndex, '') as string;
                const orderDate = ctx.getNodeParameter('orderDate', itemIndex, '') as string;
                const projectManagerMemo = ctx.getNodeParameter('projectManagerMemo', itemIndex, '') as string;
                const projectName = ctx.getNodeParameter('projectName', itemIndex, '') as string;
                const rate = ctx.getNodeParameter('rate', itemIndex, 1.0) as number;
                const referenceNumber = ctx.getNodeParameter('referenceNumber', itemIndex, '') as string;
                const subject = ctx.getNodeParameter('subject', itemIndex, '') as string;
                
                let orderIN = `<OrderIN>`;
                if (currency) orderIN += `\n<currency>${escapeXml(currency)}</currency>`;
                if (customerContactID) orderIN += `\n<customerContactID>${customerContactID}</customerContactID>`;
                orderIN += `\n<customerID>${customerID}</customerID>`;
                if (deliveryDeadline) orderIN += `\n<deliveryDeadline>${escapeXml(deliveryDeadline)}</deliveryDeadline>`;
                if (orderDate) orderIN += `\n<orderDate>${escapeXml(orderDate)}</orderDate>`;
                if (projectManagerMemo) orderIN += `\n<projectManagerMemo>${escapeXml(projectManagerMemo)}</projectManagerMemo>`;
                orderIN += `\n<projectManagerID>${projectManagerID}</projectManagerID>`;
                if (projectName) orderIN += `\n<projectName>${escapeXml(projectName)}</projectName>`;
                if (rate !== 1.0) orderIN += `\n<rate>${rate}</rate>`;
                if (referenceNumber) orderIN += `\n<referenceNumber>${escapeXml(referenceNumber)}</referenceNumber>`;
                if (subject) orderIN += `\n<subject>${escapeXml(subject)}</subject>`;
                orderIN += `\n</OrderIN>`;
                
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${orderIN}`;
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
        if (operation === 'getOrderObject' || operation === 'getOrderObject2') {
            const extendedObject = ctx.getNodeParameter('extendedObject', itemIndex, false) as boolean;
            
            if (extendedObject && result.success) {
                // Import the misc service for extended calls
                const { DataOrder30MiscService } = await import('./dataOrder30.misc');
                
                // For getOrderObject2, we need to extract the orderID from the response
                // and use it for subsequent calls instead of the original orderNumber parameter
                let orderIDForExtendedCalls = ctx.getNodeParameter('orderID', itemIndex, 0) as number;
                if (operation === 'getOrderObject2' && result.order && typeof result.order === 'object' && 'orderID' in result.order && result.order.orderID) {
                    // Convert to number safely (XML parsers usually give strings)
                    orderIDForExtendedCalls = typeof result.order.orderID === 'string' 
                        ? parseInt(result.order.orderID, 10) 
                        : Number(result.order.orderID);
                }
                
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
                        
                        if (operation === 'getOrderObject2') {
                            // For getOrderObject2, we need to call the misc service with the orderID from the response
                            // We'll create a custom context that overrides the orderID parameter
                            const customCtx = {
                                ...ctx,
                                getNodeParameter: (paramName: string, itemIdx: number, defaultValue?: any) => {
                                    if (paramName === 'orderID') {
                                        return orderIDForExtendedCalls;
                                    }
                                    return ctx.getNodeParameter(paramName, itemIdx, defaultValue);
                                }
                            } as IExecuteFunctions;
                            
                            // Debug: Log the orderID being used for extended calls
                            // This will help identify if the orderID is being passed correctly
                            extResult = await DataOrder30MiscService.execute(extOp, customCtx, creds, url, baseUrl, timeoutMs, itemIndex);
                        } else {
                            // For getOrderObject, use the original context
                            extResult = await DataOrder30MiscService.execute(extOp, ctx, creds, url, baseUrl, timeoutMs, itemIndex);
                        }
                        
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
                
                // List of additional field operations that can be performed after order creation
                const additionalOperations = [
                    { name: 'setRequestID', param: 'requestID', type: 'number' },
                    { name: 'setCreationDate', param: 'creationDate', type: 'dateTime' },
                    { name: 'setEN15038Requested', param: 'en15038Requested', type: 'boolean' },
                    { name: 'setExternalID', param: 'externalID', type: 'string' },
                    { name: 'setMasterProjectID', param: 'masterProjectID', type: 'number' },
                    { name: 'setProjectCategory', param: 'projectCategory', type: 'string' },
                    { name: 'setProjectStatus', param: 'projectStatus', type: 'number' }
                ];
                
                // Execute additional field operations if values are provided
                for (const op of additionalOperations) {
                    const value = ctx.getNodeParameter(op.param, itemIndex, null);
                    if (value !== null && value !== '' && value !== 0 && value !== false) {
                        try {
                            // Create a custom context that uses the created orderID
                            const customCtx = {
                                ...ctx,
                                getNodeParameter: (paramName: string, itemIdx: number, defaultValue?: any) => {
                                    if (paramName === 'orderID') {
                                        return createdOrderID;
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
        if ((operation === 'getOrderObject' || operation === 'getOrderObject2') && result.success) {
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
