import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { labelize, asNonEmpty } from '../core/utils';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import {
    extractResultBase, extractStatusMessage, extractSoapFault,
    parseStringResult, parseIntegerResult, parseIntegerArrayResult, parseVoidResult, parseDateResult, parseStringArrayResult,
} from '../core/xml';
import { ArchivStatusOptions, idToArchivStatusName } from '../enums/archiv-status';
import {
    toSoapParamValue,
    escapeXml,
    createStandardExecuteConfig,
    executeStandardService,
    generateOperationOptionsFromParams,
    generateOperationOptionsFromRegistry,
    createStringProperty,
    createOptionsProperty,
    handleVoidResult,
    buildSearchFilterXml,
} from '../core/service-utils';

const RESOURCE = 'DataOrder30Misc';
const ENDPOINT = 'DataOrder30';
const RESOURCE_DISPLAY_NAME = 'Order Fields';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    checkEN15038: {
        // Not necessary for now
        soapAction: 'checkEN15038',
        endpoint: ENDPOINT,
        uiName: 'Check EN15038',
        subtitleName: 'check en15038: order fields',
        titleName: 'Check EN15038',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Check if order corresponds to EN15038 standard',
        returnType: 'Boolean',
        paramOrder: ['orderID'],
        active: false,
    },
    getCreationDate: {
        soapAction: 'getCreationDate',
        endpoint: ENDPOINT,
        uiName: 'Get Creation Date',
        subtitleName: 'get creation date: order fields',
        titleName: 'Get Creation Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the creation date of the order',
        returnType: 'Date',
        paramOrder: ['orderID'],
        active: true,
    },
    getDeliveryComment: {
        soapAction: 'getDeliveryComment',
        endpoint: ENDPOINT,
        uiName: 'Get Delivery Comment',
        subtitleName: 'get delivery comment: order fields',
        titleName: 'Get Delivery Comment',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the delivery comment for the order',
        returnType: 'String',
        paramOrder: ['orderID'],
        active: true,
    },
    getEN15038Requested: {
        // Not necessary for now
        soapAction: 'getEN15038Requested',
        endpoint: ENDPOINT,
        uiName: 'Get EN15038 Requested',
        subtitleName: 'get en15038 requested: order fields',
        titleName: 'Get EN15038 Requested',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get if EN15038 is requested for the order',
        returnType: 'Boolean',
        paramOrder: ['orderID'],
        active: false,
    },
    getExternalID: {
        soapAction: 'getExternalID',
        endpoint: ENDPOINT,
        uiName: 'Get External ID',
        subtitleName: 'get external id: order fields',
        titleName: 'Get External ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the external ID of the order',
        returnType: 'String',
        paramOrder: ['orderID'],
        active: true,
    },
    getLanguageCombination: {
        soapAction: 'getLanguageCombination',
        endpoint: ENDPOINT,
        uiName: 'Get Language Combination',
        subtitleName: 'get language combination: order fields',
        titleName: 'Get Language Combination',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get language combinations for the order',
        returnType: 'StringArray',
        paramOrder: ['orderID'],
        active: true,
    },
    getLinks: {
        soapAction: 'getLinks',
        endpoint: ENDPOINT,
        uiName: 'Get Links',
        subtitleName: 'get links: order fields',
        titleName: 'Get Links',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get links associated with the order',
        returnType: 'StringArray',
        paramOrder: ['orderID', 'projectType'],
        active: true,
    },
    getMasterProjectID: {
        soapAction: 'getMasterProjectID',
        endpoint: ENDPOINT,
        uiName: 'Get Master Project ID',
        subtitleName: 'get master project id: order fields',
        titleName: 'Get Master Project ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the master project ID for the order',
        returnType: 'Integer',
        paramOrder: ['orderID'],
        active: true,
    },
    getOrderClosingDate: {
        soapAction: 'getOrderClosingDate',
        endpoint: ENDPOINT,
        uiName: 'Get Order Closing Date',
        subtitleName: 'get order closing date: order fields',
        titleName: 'Get Order Closing Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the closing date of the order',
        returnType: 'Date',
        paramOrder: ['orderID'],
        active: true,
    },
    getOrderConfirmations: {
        soapAction: 'getOrderConfirmations',
        endpoint: ENDPOINT,
        uiName: 'Get Order Confirmations',
        subtitleName: 'get order confirmations: order fields',
        titleName: 'Get Order Confirmations',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get order confirmation documents',
        returnType: 'StringArray',
        paramOrder: ['orderID'],
        active: true,
    },
    getOrderDate: {
        soapAction: 'getOrderDate',
        endpoint: ENDPOINT,
        uiName: 'Get Order Date',
        subtitleName: 'get order date: order fields',
        titleName: 'Get Order Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the order date',
        returnType: 'Date',
        paramOrder: ['orderID'],
        active: true,
    },
    getOrderNo_for_View: {
        soapAction: 'getOrderNo_for_View',
        endpoint: ENDPOINT,
        uiName: 'Get Order Number for View',
        subtitleName: 'get order number for view: order fields',
        titleName: 'Get Order Number for View',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the order number for display',
        returnType: 'String',
        paramOrder: ['orderID'],
        active: true,
    },
    getProjectCategory: {
        soapAction: 'getProjectCategory',
        endpoint: ENDPOINT,
        uiName: 'Get Project Category',
        subtitleName: 'get project category: order fields',
        titleName: 'Get Project Category',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the project category for the order',
        returnType: 'String',
        paramOrder: ['orderID', 'projectCategory', 'systemLanguageCode'],
        active: true,
    },
    getProjectStatus: {
        soapAction: 'getProjectStatus',
        endpoint: ENDPOINT,
        uiName: 'Get Project Status',
        subtitleName: 'get project status: order fields',
        titleName: 'Get Project Status',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the project status for the order',
        returnType: 'Integer',
        paramOrder: ['orderID'],
        active: true,
    },
    getRequestId: {
        soapAction: 'getRequestId',
        endpoint: ENDPOINT,
        uiName: 'Get Request ID',
        subtitleName: 'get request id: order fields',
        titleName: 'Get Request ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the request ID for the order',
        returnType: 'Integer',
        paramOrder: ['orderID'],
        active: true,
    },
    getSubject: {
        soapAction: 'getSubject',
        endpoint: ENDPOINT,
        uiName: 'Get Subject',
        subtitleName: 'get subject: order fields',
        titleName: 'Get Subject',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get the subject of the order',
        returnType: 'String',
        paramOrder: ['orderID'],
        active: true,
    },
    createLink: {
        soapAction: 'createLink',
        endpoint: ENDPOINT,
        uiName: 'Create Project Linking',
        subtitleName: 'create project linking: order fields',
        titleName: 'Create Project Linking',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a link between projects',
        returnType: 'Void',
        paramOrder: ['sourceOrderId', 'targetId', 'projectType', 'isBidirectional', 'memo'],
        active: true,
    },
    getTemplateList: {
        soapAction: 'getTemplateList',
        endpoint: ENDPOINT,
        uiName: 'Get List of Templates',
        subtitleName: 'get list of templates: order fields',
        titleName: 'Get List of Templates',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get list of available templates',
        returnType: 'TemplateList',
        paramOrder: [],
        active: true,
    },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.paramOrder])
);

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Boolean'|'Date'|'StringArray'|'TemplateList';
const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.returnType as R])
);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

const extraProperties: INodeProperties[] =
    Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params.map<INodeProperties>((p) => {
            if (p === 'orderID') {
                return {
                    displayName: 'Order ID',
                    name: p,
                    type: 'number',
                    default: 0,
                    required: true,
                    description: 'The ID of the order',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'projectCategory') {
                return {
                    displayName: 'Project Category',
                    name: p,
                    type: 'string',
                    default: '',
                    description: 'Name of the project category',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'systemLanguageCode') {
                return {
                    displayName: 'System Language Code',
                    name: p,
                    type: 'string',
                    default: 'EN',
                    description: 'Language of the name',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'projectType') {
                return {
                    displayName: 'Project Type',
                    name: p,
                    type: 'options',
                    options: [
                        { name: 'Please select...', value: '' },
                        { name: 'Quote (1)', value: 1 },
                        { name: 'Order (3)', value: 3 },
                    ],
                    default: 3, // ORDER
                    description: 'Project type for the order',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'sourceOrderId') {
                return {
                    displayName: 'Source Order ID',
                    name: p,
                    type: 'number',
                    default: 0,
                    required: true,
                    description: 'The ID of the source order',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'targetId') {
                return {
                    displayName: 'Target ID',
                    name: p,
                    type: 'number',
                    default: 0,
                    required: true,
                    description: 'The ID of the target project',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'isBidirectional') {
                return {
                    displayName: 'Is Bidirectional',
                    name: p,
                    type: 'boolean',
                    default: true,
                    description: 'Whether the link is bidirectional',
                    displayOptions: {
                        show: {
                            resource: [RESOURCE],
                            operation: [op],
                        },
                    },
                };
            }
            if (p === 'memo') {
                return {
                    displayName: 'Memo',
                    name: p,
                    type: 'string',
                    default: '',
                    description: 'Memo for the project link',
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
                p,
                `${p} parameter for ${op}`,
                RESOURCE,
                op,
            );
        }),
    );

// Create the execution configuration
function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return createStandardExecuteConfig(
        creds,
        url,
        baseUrl,
        timeoutMs,
        PARAM_ORDER,
        (xml: string, op: string) => {
            // Check for specific error codes that need custom handling
            if (op === 'getMasterProjectID') {
                const statusCodeMatch = xml.match(/<statusCode>(-?\d+)<\/statusCode>/);
                if (statusCodeMatch && statusCodeMatch[1]) {
                    const statusCode = parseInt(statusCodeMatch[1], 10);
                    if (statusCode === -57) {
                        return {
                            success: true,
                            resource: RESOURCE,
                            operation: op,
                            data: null,
                            statusMessage: 'No master project has been set for the current project.',
                            statusCode: -57
                        } as IDataObject;
                    }
                }
                // Also check for error in statusMessage
                const statusMessageMatch = xml.match(/<statusMessage>(.*?)<\/statusMessage>/);
                if (statusMessageMatch && statusMessageMatch[1] && statusMessageMatch[1].includes('No master project')) {
                    return {
                        success: true,
                        resource: RESOURCE,
                        operation: op,
                        data: null,
                        statusMessage: 'No master project has been set for the current project.',
                        statusCode: -57
                    } as IDataObject;
                }
            }
            
            if (op === 'getRequestId') {
                const statusCodeMatch = xml.match(/<statusCode>(-?\d+)<\/statusCode>/);
                if (statusCodeMatch && statusCodeMatch[1]) {
                    const statusCode = parseInt(statusCodeMatch[1], 10);
                    if (statusCode === -24) {
                        return {
                            success: true,
                            resource: RESOURCE,
                            operation: op,
                            data: null,
                            statusMessage: 'System can\'t find the requested project request.',
                            statusCode: -24
                        } as IDataObject;
                    }
                }
                // Also check for error in statusMessage
                const statusMessageMatch = xml.match(/<statusMessage>(.*?)<\/statusMessage>/);
                if (statusMessageMatch && statusMessageMatch[1] && statusMessageMatch[1].includes('can\'t find the requested project')) {
                    return {
                        success: true,
                        resource: RESOURCE,
                        operation: op,
                        data: null,
                        statusMessage: 'System can\'t find the requested project request.',
                        statusCode: -24
                    } as IDataObject;
                }
            }
            
            if (op === 'getOrderClosingDate') {
                const statusCodeMatch = xml.match(/<statusCode>(-?\d+)<\/statusCode>/);
                if (statusCodeMatch && statusCodeMatch[1]) {
                    const statusCode = parseInt(statusCodeMatch[1], 10);
                    if (statusCode === 7028) {
                        return {
                            success: true,
                            resource: RESOURCE,
                            operation: op,
                            data: null,
                            statusMessage: 'The project closing date is not set (yet).',
                            statusCode: 7028
                        } as IDataObject;
                    }
                }
                // Also check for error in statusMessage
                const statusMessageMatch = xml.match(/<statusMessage>(.*?)<\/statusMessage>/);
                if (statusMessageMatch && statusMessageMatch[1] && statusMessageMatch[1].includes('closing date is not set')) {
                    return {
                        success: true,
                        resource: RESOURCE,
                        operation: op,
                        data: null,
                        statusMessage: 'The project closing date is not set (yet).',
                        statusCode: 7028
                    } as IDataObject;
                }
            }
            
            const rt = RETURN_TYPE[op] as R|undefined;
            let payload: IDataObject;
            switch (rt) {
                case 'String': {
                    const r = parseStringResult(xml);
                    payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Integer': {
                    const r = parseIntegerResult(xml);
                    if (op === 'getProjectStatus') {
                        const statusId = r.value ?? null;
                        const statusName = idToArchivStatusName(statusId);
                        payload = { 
                            statusId, 
                            statusName,
                            statusMessage: r.statusMessage, 
                            statusCode: r.statusCode 
                        };
                    } else {
                        payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    }
                    break;
                }
                case 'IntegerArray': {
                    const r = parseIntegerArrayResult(xml);
                    payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Boolean': {
                    // Parse boolean result - this would need a proper boolean parser
                    const base = extractResultBase(xml);
                    payload = { value: base.statusMessage === 'OK', statusMessage: base.statusMessage, statusCode: base.statusCode };
                    break;
                }
                case 'Date': {
                    const r = parseDateResult(xml);
                    payload = { date: r.date, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'StringArray': {
                    const r = parseStringArrayResult(xml);
                    payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'TemplateList': {
                    // Parse template list result
                    const base = extractResultBase(xml);
                    const templateData = [];
                    
                    // Extract template data from XML response
                    const dataMatches = xml.match(/<data>(.*?)<\/data>/gs);
                    if (dataMatches) {
                        for (const dataMatch of dataMatches) {
                            const customerID = dataMatch.match(/<customerID>(.*?)<\/customerID>/)?.[1];
                            const templateDescription = dataMatch.match(/<templateDescription>(.*?)<\/templateDescription>/)?.[1];
                            const templateID = dataMatch.match(/<templateID>(.*?)<\/templateID>/)?.[1];
                            const templateName = dataMatch.match(/<templateName>(.*?)<\/templateName>/)?.[1];
                            
                            templateData.push({
                                customerID: customerID ? parseInt(customerID, 10) : 0,
                                templateDescription: templateDescription || '',
                                templateID: templateID ? parseInt(templateID, 10) : 0,
                                templateName: templateName || ''
                            });
                        }
                    }
                    
                    payload = { 
                        data: templateData, 
                        statusMessage: base.statusMessage, 
                        statusCode: base.statusCode 
                    };
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
            const orderID = itemParams.orderID as number;
            
            if (op === 'getProjectCategory') {
                const projectCategory = ctx.getNodeParameter('projectCategory', itemIndex, '') as string;
                const systemLanguageCode = ctx.getNodeParameter('systemLanguageCode', itemIndex, 'EN') as string;
                return `<UUID>${escapeXml(sessionId)}</UUID>\n<orderID>${orderID}</orderID>\n<projectCategory>${escapeXml(projectCategory)}</projectCategory>\n<systemLanguageCode>${escapeXml(systemLanguageCode)}</systemLanguageCode>`;
            }
            
            if (op === 'getLinks') {
                // getLinks expects orderId and projectType parameters
                const projectType = ctx.getNodeParameter('projectType', itemIndex, 3) as number; // Default to ORDER
                return `<UUID>${escapeXml(sessionId)}</UUID>\n<orderId>${orderID}</orderId>\n<projectType>${projectType}</projectType>`;
            }

            if (op === 'createLink') {
                const sourceOrderId = ctx.getNodeParameter('sourceOrderId', itemIndex, 0) as number;
                const targetId = ctx.getNodeParameter('targetId', itemIndex, 0) as number;
                const projectType = ctx.getNodeParameter('projectType', itemIndex, 3) as number;
                const isBidirectional = ctx.getNodeParameter('isBidirectional', itemIndex, true) as boolean;
                const memo = ctx.getNodeParameter('memo', itemIndex, '') as string;
                return `<UUID>${escapeXml(sessionId)}</UUID>\n<sourceOrderId>${sourceOrderId}</sourceOrderId>\n<targetId>${targetId}</targetId>\n<projectType>${projectType}</projectType>\n<isBidirectional>${isBidirectional ? 1 : 0}</isBidirectional>\n<memo>${escapeXml(memo)}</memo>`;
            }

            return `<UUID>${escapeXml(sessionId)}</UUID>\n<orderID>${orderID}</orderID>`;
        },
    );
}

/** ─ Service export ─ */
export const DataOrder30MiscService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Field operations for DataOrder30',
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
