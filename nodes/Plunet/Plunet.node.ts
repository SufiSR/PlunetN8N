import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import {
	authenticatePlunet,
	createSoapHandler,
	executeAuthenticatedOperation,
	formatResponseForN8N,
	getPlunetServices,
	handleError,
	logoutPlunet,
	validateUuid,
	convertParametersForPlunet,
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
		defaults: {
			name: 'Plunet',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'plunetApi',
				required: true,
			},
		],
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

				switch (service) {
					case 'auth':
						result = await this.executeAuthOperation(operation, i);
						break;
					case 'customer':
						result = await this.executeCustomerOperation(operation, i);
						break;
					case 'order':
						result = await this.executeOrderOperation(operation, i);
						break;
					default:
						throw new NodeOperationError(this.getNode(), `Unknown service: ${service}`, {
							itemIndex: i,
						});
				}

				returnData.push(...result);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push(...handleError(error as Error, 'unknown'));
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}

	private async executeAuthOperation(operation: string, itemIndex: number): Promise<INodeExecutionData[]> {
		const soapHandler = createSoapHandler(this);

		switch (operation) {
			case 'login': {
				try {
					const uuid = await authenticatePlunet(this);
					return [{
						json: {
							operation: 'login',
							success: true,
							uuid,
							message: 'Successfully authenticated with Plunet API',
						},
					}];
				} catch (error) {
					throw new NodeOperationError(this.getNode(), `Login failed: ${error.message}`, {
						itemIndex,
					});
				}
			}

			case 'logout': {
				const uuid = this.getNodeParameter('uuid', itemIndex, '') as string;
				const sessionUuid = uuid || await authenticatePlunet(this);
				
				await logoutPlunet(this, sessionUuid);
				return [{
					json: {
						operation: 'logout',
						success: true,
						message: 'Successfully logged out from Plunet API',
					},
				}];
			}

			case 'validate': {
				const uuid = this.getNodeParameter('uuid', itemIndex, '') as string;
				const sessionUuid = uuid || await authenticatePlunet(this);
				
				const isValid = await validateUuid(this, sessionUuid);
				return [{
					json: {
						operation: 'validate',
						success: true,
						valid: isValid,
						uuid: sessionUuid,
					},
				}];
			}

			case 'getVersion': {
				const envelope = soapHandler.createSoapEnvelope({
					operation: 'getVersion',
				});
				const response = await soapHandler.executeSoapRequest('PlunetAPI', envelope);
				return formatResponseForN8N(response, 'getVersion');
			}

			case 'getPlunetVersion': {
				const envelope = soapHandler.createSoapEnvelope({
					operation: 'getPlunetVersion',
				});
				const response = await soapHandler.executeSoapRequest('PlunetAPI', envelope);
				return formatResponseForN8N(response, 'getPlunetVersion');
			}

			default:
				throw new NodeOperationError(this.getNode(), `Unknown auth operation: ${operation}`, {
					itemIndex,
				});
		}
	}

	private async executeCustomerOperation(operation: string, itemIndex: number): Promise<INodeExecutionData[]> {
		switch (operation) {
			case 'getCustomerObject': {
				const customerID = this.getNodeParameter('customerID', itemIndex) as number;
				const response = await executeAuthenticatedOperation(
					this,
					'DataCustomer30',
					'getCustomerObject',
					{ customerID }
				);
				return formatResponseForN8N(response, 'getCustomerObject');
			}

			case 'insert': {
				const customerData = this.getNodeParameter('customerData', itemIndex, {}) as Record<string, any>;
				const convertedData = convertParametersForPlunet(customerData);
				
				const response = await executeAuthenticatedOperation(
					this,
					'DataCustomer30',
					'insert',
					{ customerIN: convertedData }
				);
				return formatResponseForN8N(response, 'insert');
			}

			case 'update': {
				const customerID = this.getNodeParameter('customerID', itemIndex) as number;
				const customerData = this.getNodeParameter('customerData', itemIndex, {}) as Record<string, any>;
				const convertedData = convertParametersForPlunet(customerData);
				
				// Add the customer ID to the data
				convertedData.customerID = customerID;
				
				const response = await executeAuthenticatedOperation(
					this,
					'DataCustomer30',
					'update',
					{ customerIN: convertedData }
				);
				return formatResponseForN8N(response, 'update');
			}

			case 'delete': {
				const customerID = this.getNodeParameter('customerID', itemIndex) as number;
				const response = await executeAuthenticatedOperation(
					this,
					'DataCustomer30',
					'delete',
					{ customerID }
				);
				return formatResponseForN8N(response, 'delete');
			}

			case 'seek': {
				const searchText = this.getNodeParameter('searchText', itemIndex) as string;
				const searchType = this.getNodeParameter('searchType', itemIndex, 'name') as string;
				const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
				
				const searchParams: Record<string, any> = {
					searchString: searchText,
					searchType,
				};

				if (additionalOptions.includeInactive) {
					searchParams.includeInactive = true;
				}

				const response = await executeAuthenticatedOperation(
					this,
					'DataCustomer30',
					'seek',
					searchParams
				);
				return formatResponseForN8N(response, 'seek');
			}

			case 'getAllCustomerObjects': {
				const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
				
				const params: Record<string, any> = {};
				if (additionalOptions.includeInactive) {
					params.includeInactive = true;
				}

				const response = await executeAuthenticatedOperation(
					this,
					'DataCustomer30',
					'getAllCustomerObjects',
					params
				);
				return formatResponseForN8N(response, 'getAllCustomerObjects');
			}

			case 'getCustomerList': {
				const response = await executeAuthenticatedOperation(
					this,
					'DataCustomer30',
					'getCustomerList',
					{}
				);
				return formatResponseForN8N(response, 'getCustomerList');
			}

			default:
				throw new NodeOperationError(this.getNode(), `Unknown customer operation: ${operation}`, {
					itemIndex,
				});
		}
	}

	private async executeOrderOperation(operation: string, itemIndex: number): Promise<INodeExecutionData[]> {
		switch (operation) {
			case 'getOrderObject': {
				const orderID = this.getNodeParameter('orderID', itemIndex) as number;
				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'getOrderObject',
					{ orderID }
				);
				return formatResponseForN8N(response, 'getOrderObject');
			}

			case 'insert': {
				const orderData = this.getNodeParameter('orderData', itemIndex, {}) as Record<string, any>;
				const convertedData = convertParametersForPlunet(orderData);
				
				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'insert',
					{ orderIN: convertedData }
				);
				return formatResponseForN8N(response, 'insert');
			}

			case 'update': {
				const orderID = this.getNodeParameter('orderID', itemIndex) as number;
				const orderData = this.getNodeParameter('orderData', itemIndex, {}) as Record<string, any>;
				const convertedData = convertParametersForPlunet(orderData);
				
				// Add the order ID to the data
				convertedData.orderID = orderID;
				
				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'update',
					{ orderIN: convertedData }
				);
				return formatResponseForN8N(response, 'update');
			}

			case 'delete': {
				const orderID = this.getNodeParameter('orderID', itemIndex) as number;
				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'delete',
					{ orderID }
				);
				return formatResponseForN8N(response, 'delete');
			}

			case 'setStatus': {
				const orderID = this.getNodeParameter('orderID', itemIndex) as number;
				const status = this.getNodeParameter('status', itemIndex) as number;
				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'setStatus',
					{ orderID, status }
				);
				return formatResponseForN8N(response, 'setStatus');
			}

			case 'getStatus': {
				const orderID = this.getNodeParameter('orderID', itemIndex) as number;
				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'getStatus',
					{ orderID }
				);
				return formatResponseForN8N(response, 'getStatus');
			}

			case 'seek': {
				const searchText = this.getNodeParameter('searchText', itemIndex) as string;
				const searchType = this.getNodeParameter('searchType', itemIndex, 'orderName') as string;
				const dateFilters = this.getNodeParameter('dateFilters', itemIndex, {}) as Record<string, any>;
				const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
				
				const searchParams: Record<string, any> = {
					searchString: searchText,
					searchType,
				};

				// Add date filters if provided
				if (dateFilters.fromDate) {
					searchParams.fromDate = dateFilters.fromDate;
				}
				if (dateFilters.toDate) {
					searchParams.toDate = dateFilters.toDate;
				}
				if (dateFilters.dateType) {
					searchParams.dateType = dateFilters.dateType;
				}

				// Add additional options
				if (additionalOptions.includeCompleted !== undefined) {
					searchParams.includeCompleted = additionalOptions.includeCompleted;
				}
				if (additionalOptions.includeCancelled !== undefined) {
					searchParams.includeCancelled = additionalOptions.includeCancelled;
				}

				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'seek',
					searchParams
				);
				return formatResponseForN8N(response, 'seek');
			}

			case 'getAllOrderObjects': {
				const dateFilters = this.getNodeParameter('dateFilters', itemIndex, {}) as Record<string, any>;
				const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as Record<string, any>;
				
				const params: Record<string, any> = {};

				// Add date filters if provided
				if (dateFilters.fromDate) {
					params.fromDate = dateFilters.fromDate;
				}
				if (dateFilters.toDate) {
					params.toDate = dateFilters.toDate;
				}
				if (dateFilters.dateType) {
					params.dateType = dateFilters.dateType;
				}

				// Add additional options
				if (additionalOptions.includeCompleted !== undefined) {
					params.includeCompleted = additionalOptions.includeCompleted;
				}
				if (additionalOptions.includeCancelled !== undefined) {
					params.includeCancelled = additionalOptions.includeCancelled;
				}

				const response = await executeAuthenticatedOperation(
					this,
					'DataOrder30',
					'getAllOrderObjects',
					params
				);
				return formatResponseForN8N(response, 'getAllOrderObjects');
			}

			default:
				throw new NodeOperationError(this.getNode(), `Unknown order operation: ${operation}`, {
					itemIndex,
				});
		}
	}
}
