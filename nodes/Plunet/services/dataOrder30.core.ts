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
                operation: ['getOrderObject'],
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
                        const extResult = await DataOrder30MiscService.execute(extOp, ctx, creds, url, baseUrl, timeoutMs, itemIndex);
                        
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
                        // If call fails, set empty value
                        extendedData[extOp] = '';
                    }
                }
                
                // Merge extended data into the result
                result.extendedData = extendedData;
            }
        }
        
        // Reorganize the result structure to match desired output
        if (operation === 'getOrderObject' && result.success) {
            const { order, statusMessage, statusCode, extendedData } = result;
            return {
                success: true,
                resource: RESOURCE,
                operation: 'getOrderObject',
                statusMessage,
                statusCode,
                order,
                ...(extendedData ? { extendedData } : {})
            };
        }
        
        return result;
    },
};
