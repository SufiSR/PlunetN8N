import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    NodeOperationError,
    NodeConnectionType,
} from 'n8n-workflow';

import {
    authenticatePlunet,           // (ctx) => Promise<string>
    createSoapHandler,            // (ctx) => Promise<SoapHandler>
    executeAuthenticatedOperation,// (ctx, endpoint, operation, params) => Promise<SoapResponse>
    formatResponseForN8N,         // (response, opName) => INodeExecutionData[]
    getPlunetServices,            // () => Array<{name,value,description}>
    handleError,                  // (err: Error, op: string) => INodeExecutionData[]
    logoutPlunet,                 // (ctx, uuid) => Promise<void>
    validateUuid,                 // (ctx, uuid) => Promise<boolean>
    convertParametersForPlunet,   // (obj) => obj
} from './GenericFunctions';

import { authOperations, authFields } from './operations/auth';
import { customerOperations, customerFields } from './operations/customer';
import { orderOperations, orderFields } from './operations/order';

export class Plunet implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Plunet',
        name: 'plunet',
        icon: 'file:plunet.svg',
        group: ['transform'],
        version: 1,
        subtitle: '={{$parameter["service"] + ": " + $parameter["operation"]}}',
        description: 'Interact with Plunet BusinessManager API',
        defaults: { name: 'Plunet' },
        inputs: [NodeConnectionType.Main],
        outputs: [NodeConnectionType.Main],
        credentials: [{ name: 'plunetApi', required: true }],
        properties: [
            {
                displayName: 'Service',
                name: 'service',
                type: 'options',
                noDataExpression: true,
                options: getPlunetServices(),
                default: 'auth',
                description: 'The Plunet service to use',
            },
            ...authOperations,
            ...customerOperations,
            ...orderOperations,
            ...authFields,
            ...customerFields,
            ...orderFields,
        ],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const service = this.getNodeParameter('service', i) as string;
                const operation = this.getNodeParameter('operation', i) as string;

                let result: INodeExecutionData[];

                if (service === 'auth') {
                    result = await executeAuthOperation(this, operation, i);
                } else if (service === 'customer') {
                    result = await executeCustomerOperation(this, operation, i);
                } else if (service === 'order') {
                    result = await executeOrderOperation(this, operation, i);
                } else {
                    throw new NodeOperationError(this.getNode(), `Unknown service: ${service}`, { itemIndex: i });
                }

                returnData.push(...result);
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                if (this.continueOnFail()) {
                    returnData.push(...handleError(error, 'unknown'));
                } else {
                    throw error;
                }
            }
        }

        return [returnData];
    }
}

/** ---------------- Top-level helpers (receive ctx: IExecuteFunctions) ---------------- */

async function executeAuthOperation(
    ctx: IExecuteFunctions,
    operation: string,
    itemIndex: number,
): Promise<INodeExecutionData[]> {
    const soapHandler = await createSoapHandler(ctx);

    switch (operation) {
        case 'login': {
            const uuid = await authenticatePlunet(ctx);
            return [{ json: { operation: 'login', success: true, uuid, message: 'Successfully authenticated with Plunet API' } }];
        }
        case 'logout': {
            const uuidParam = ctx.getNodeParameter('uuid', itemIndex, '') as string;
            const sessionUuid = uuidParam || (await authenticatePlunet(ctx));
            await logoutPlunet(ctx, sessionUuid);
            return [{ json: { operation: 'logout', success: true, message: 'Successfully logged out from Plunet API' } }];
        }
        case 'validate': {
            const uuidParam = ctx.getNodeParameter('uuid', itemIndex, '') as string;
            const sessionUuid = uuidParam || (await authenticatePlunet(ctx));
            const isValid = await validateUuid(ctx, sessionUuid);
            return [{ json: { operation: 'validate', success: true, valid: isValid, uuid: sessionUuid } }];
        }
        case 'getVersion': {
            const envelope = soapHandler.createSoapEnvelope({ operation: 'getVersion' });
            const response = await soapHandler.executeSoapRequest('PlunetAPI', envelope, 'http://API.Integration/getVersion');
            return formatResponseForN8N(response, 'getVersion');
        }
        case 'getPlunetVersion': {
            const envelope = soapHandler.createSoapEnvelope({ operation: 'getPlunetVersion' });
            const response = await soapHandler.executeSoapRequest('PlunetAPI', envelope, 'http://API.Integration/getPlunetVersion');
            return formatResponseForN8N(response, 'getPlunetVersion');
        }
        default:
            throw new NodeOperationError(ctx.getNode(), `Unknown auth operation: ${operation}`, { itemIndex });
    }
}

async function executeCustomerOperation(
    ctx: IExecuteFunctions,
    operation: string,
    itemIndex: number,
): Promise<INodeExecutionData[]> {
    switch (operation) {
        case 'getCustomerObject': {
            const customerID = ctx.getNodeParameter('customerID', itemIndex) as number;
            const response = await executeAuthenticatedOperation(ctx, 'DataCustomer30', 'getCustomerObject', { customerID });
            return formatResponseForN8N(response, 'getCustomerObject');
        }
        case 'insert': {
            const customerData = ctx.getNodeParameter('customerData', itemIndex, {}) as Record<string, any>;
            const convertedData = convertParametersForPlunet(customerData);
            const response = await executeAuthenticatedOperation(ctx, 'DataCustomer30', 'insert', { customerIN: convertedData });
            return formatResponseForN8N(response, 'insert');
        }
        case 'update': {
            const customerID = ctx.getNodeParameter('customerID', itemIndex) as number;
            const customerData = ctx.getNodeParameter('customerData', itemIndex, {}) as Record<string, any>;
            const convertedData = convertParametersForPlunet(customerData);
            convertedData.customerID = customerID;
            const response = await executeAuthenticatedOperation(ctx, 'DataCustomer30', 'update', { customerIN: convertedData });
            return formatResponseForN8N(response, 'update');
        }
        case 'delete': {
            const customerID = ctx.getNodeParameter('customerID', itemIndex) as number;
            const response = await executeAuthenticatedOperation(ctx, 'DataCustomer30', 'delete', { customerID });
            return formatResponseForN8N(response, 'delete');
        }
        case 'seek': {
            const searchText = ctx.getNodeParameter('searchText', itemIndex) as string;
            const searchType = ctx.getNodeParameter('searchType', itemIndex, 'name') as string;
            const additionalOptions = ctx.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
            const searchParams: Record<string, any> = { searchString: searchText, searchType };
            if (additionalOptions.includeInactive) searchParams.includeInactive = true;
            const response = await executeAuthenticatedOperation(ctx, 'DataCustomer30', 'seek', searchParams);
            return formatResponseForN8N(response, 'seek');
        }
        case 'getAllCustomerObjects': {
            const additionalOptions = ctx.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
            const params: Record<string, any> = {};
            if (additionalOptions.includeInactive) params.includeInactive = true;
            const response = await executeAuthenticatedOperation(ctx, 'DataCustomer30', 'getAllCustomerObjects', params);
            return formatResponseForN8N(response, 'getAllCustomerObjects');
        }
        case 'getCustomerList': {
            const response = await executeAuthenticatedOperation(ctx, 'DataCustomer30', 'getCustomerList', {});
            return formatResponseForN8N(response, 'getCustomerList');
        }
        default:
            throw new NodeOperationError(ctx.getNode(), `Unknown customer operation: ${operation}`, { itemIndex });
    }
}

async function executeOrderOperation(
    ctx: IExecuteFunctions,
    operation: string,
    itemIndex: number,
): Promise<INodeExecutionData[]> {
    switch (operation) {
        case 'getOrderObject': {
            const orderID = ctx.getNodeParameter('orderID', itemIndex) as number;
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'getOrderObject', { orderID });
            return formatResponseForN8N(response, 'getOrderObject');
        }
        case 'insert': {
            const orderData = ctx.getNodeParameter('orderData', itemIndex, {}) as Record<string, any>;
            const convertedData = convertParametersForPlunet(orderData);
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'insert', { orderIN: convertedData });
            return formatResponseForN8N(response, 'insert');
        }
        case 'update': {
            const orderID = ctx.getNodeParameter('orderID', itemIndex) as number;
            const orderData = ctx.getNodeParameter('orderData', itemIndex, {}) as Record<string, any>;
            const convertedData = convertParametersForPlunet(orderData);
            convertedData.orderID = orderID;
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'update', { orderIN: convertedData });
            return formatResponseForN8N(response, 'update');
        }
        case 'delete': {
            const orderID = ctx.getNodeParameter('orderID', itemIndex) as number;
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'delete', { orderID });
            return formatResponseForN8N(response, 'delete');
        }
        case 'setStatus': {
            const orderID = ctx.getNodeParameter('orderID', itemIndex) as number;
            const status = ctx.getNodeParameter('status', itemIndex) as number;
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'setStatus', { orderID, status });
            return formatResponseForN8N(response, 'setStatus');
        }
        case 'getStatus': {
            const orderID = ctx.getNodeParameter('orderID', itemIndex) as number;
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'getStatus', { orderID });
            return formatResponseForN8N(response, 'getStatus');
        }
        case 'seek': {
            const searchText = ctx.getNodeParameter('searchText', itemIndex) as string;
            const searchType = ctx.getNodeParameter('searchType', itemIndex, 'orderName') as string;
            const dateFilters = ctx.getNodeParameter('dateFilters', itemIndex, {}) as Record<string, any>;
            const additionalOptions = ctx.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
            const searchParams: Record<string, any> = { searchString: searchText, searchType };
            if (dateFilters.fromDate) searchParams.fromDate = dateFilters.fromDate;
            if (dateFilters.toDate) searchParams.toDate = dateFilters.toDate;
            if (dateFilters.dateType) searchParams.dateType = dateFilters.dateType;
            if (additionalOptions.includeCompleted !== undefined) searchParams.includeCompleted = additionalOptions.includeCompleted;
            if (additionalOptions.includeCancelled !== undefined) searchParams.includeCancelled = additionalOptions.includeCancelled;
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'seek', searchParams);
            return formatResponseForN8N(response, 'seek');
        }
        case 'getAllOrderObjects': {
            const dateFilters = ctx.getNodeParameter('dateFilters', itemIndex, {}) as Record<string, any>;
            const additionalOptions = ctx.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
            const params: Record<string, any> = {};
            if (dateFilters.fromDate) params.fromDate = dateFilters.fromDate;
            if (dateFilters.toDate) params.toDate = dateFilters.toDate;
            if (dateFilters.dateType) params.dateType = dateFilters.dateType;
            if (additionalOptions.includeCompleted !== undefined) params.includeCompleted = additionalOptions.includeCompleted;
            if (additionalOptions.includeCancelled !== undefined) params.includeCancelled = additionalOptions.includeCancelled;
            const response = await executeAuthenticatedOperation(ctx, 'DataOrder30', 'getAllOrderObjects', params);
            return formatResponseForN8N(response, 'getAllOrderObjects');
        }
        default:
            throw new NodeOperationError(ctx.getNode(), `Unknown order operation: ${operation}`, { itemIndex });
    }
}
