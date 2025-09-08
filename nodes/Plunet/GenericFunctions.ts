import { IExecuteFunctions, ICredentialDataDecryptedObject, INodeExecutionData } from 'n8n-workflow';
import { SoapHandler, SoapResponse } from './SoapHandler';

export interface PlunetCredentials {
	serverUrl: string;
	username: string;
	password: string;
	timeout?: number;
}

export interface AuthSession {
	uuid: string;
	expiresAt: number;
}

// Global session cache (in production, consider using a more robust caching mechanism)
const sessionCache = new Map<string, AuthSession>();

/**
 * Get Plunet credentials
 */
export async function getPlunetCredentials(executeFunctions: IExecuteFunctions): Promise<PlunetCredentials> {
	const credentials = await executeFunctions.getCredentials('plunetApi') as ICredentialDataDecryptedObject;
	
	return {
		serverUrl: credentials.serverUrl as string,
		username: credentials.username as string,
		password: credentials.password as string,
		timeout: (credentials.timeout as number) || 30,
	};
}

/**
 * Create SOAP handler instance
 */
export async function createSoapHandler(executeFunctions: IExecuteFunctions): Promise<SoapHandler> {
	const credentials = await getPlunetCredentials(executeFunctions);
	return new SoapHandler(executeFunctions, credentials.serverUrl);
}

/**
 * Authenticate with Plunet API and get UUID token
 */
export async function authenticatePlunet(executeFunctions: IExecuteFunctions): Promise<string> {
	const credentials = await getPlunetCredentials(executeFunctions);
	const cacheKey = `${credentials.serverUrl}:${credentials.username}`;
	
	// Check if we have a valid cached session
	const cachedSession = sessionCache.get(cacheKey);
	if (cachedSession && cachedSession.expiresAt > Date.now()) {
		return cachedSession.uuid;
	}

	// Perform login
	const soapHandler = await createSoapHandler(executeFunctions);
	const loginEnvelope = soapHandler.createSoapEnvelope({
		operation: 'login',
		parameters: {
			arg0: credentials.username,
			arg1: credentials.password,
		},
	});

	const response = await soapHandler.executeSoapRequest('PlunetAPI', loginEnvelope);
	
	if (!response.success) {
		throw new Error(`Authentication failed: ${response.error}`);
	}

	const uuid = SoapHandler.extractUuidFromResponse(response);
	if (!uuid) {
		throw new Error('Failed to extract UUID from login response');
	}

	// Cache the session (expire in 30 minutes)
	sessionCache.set(cacheKey, {
		uuid,
		expiresAt: Date.now() + (30 * 60 * 1000),
	});

	return uuid;
}

/**
 * Logout from Plunet API
 */
export async function logoutPlunet(executeFunctions: IExecuteFunctions, uuid: string): Promise<void> {
	const soapHandler = await createSoapHandler(executeFunctions);
	const logoutEnvelope = soapHandler.createSoapEnvelope({
		operation: 'logout',
		uuid,
	});

	await soapHandler.executeSoapRequest('PlunetAPI', logoutEnvelope);
	
	// Clear from cache
	const credentials = await getPlunetCredentials(executeFunctions);
	const cacheKey = `${credentials.serverUrl}:${credentials.username}`;
	sessionCache.delete(cacheKey);
}

/**
 * Validate UUID token
 */
export async function validateUuid(executeFunctions: IExecuteFunctions, uuid: string): Promise<boolean> {
	const soapHandler = await createSoapHandler(executeFunctions);
	const validateEnvelope = soapHandler.createSoapEnvelope({
		operation: 'validate',
		uuid,
	});

	const response = await soapHandler.executeSoapRequest('PlunetAPI', validateEnvelope);
	return response.success && response.data === true;
}

/**
 * Execute authenticated SOAP operation
 */
export async function executeAuthenticatedOperation(
	executeFunctions: IExecuteFunctions,
	endpoint: string,
	operation: string,
	parameters: Record<string, any> = {},
): Promise<SoapResponse> {
	const uuid = await authenticatePlunet(executeFunctions);
	const soapHandler = await createSoapHandler(executeFunctions);
	
	const envelope = soapHandler.createSoapEnvelope({
		operation,
		parameters,
		uuid,
	});

	return await soapHandler.executeSoapRequest(endpoint, envelope);
}

/**
 * Format response data for N8N
 */
export function formatResponseForN8N(response: SoapResponse, operation: string): INodeExecutionData[] {
	if (!response.success) {
		throw new Error(`Operation ${operation} failed: ${response.error}`);
	}

	// If data is an array, return multiple items
	if (Array.isArray(response.data)) {
		return response.data.map(item => ({
			json: {
				operation,
				success: true,
				data: item,
			},
		}));
	}

	// Single item response
	return [{
		json: {
			operation,
			success: true,
			data: response.data,
		},
	}];
}

/**
 * Handle errors and format for N8N
 */
export function handleError(error: Error, operation: string): INodeExecutionData[] {
	return [{
		json: {
			operation,
			success: false,
			error: error.message,
		},
	}];
}

/**
 * Convert N8N parameters to Plunet API format
 */
export function convertParametersForPlunet(parameters: Record<string, any>): Record<string, any> {
	const converted: Record<string, any> = {};
	
	Object.entries(parameters).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== '') {
			// Handle boolean values
			if (typeof value === 'boolean') {
				converted[key] = value;
			}
			// Handle numeric values
			else if (typeof value === 'number') {
				converted[key] = value;
			}
			// Handle date values
			else if (value instanceof Date) {
				converted[key] = value.toISOString();
			}
			// Handle string values
			else if (typeof value === 'string') {
				converted[key] = value.trim();
			}
			// Handle arrays and objects
			else if (typeof value === 'object') {
				converted[key] = value;
			}
		}
	});
	
	return converted;
}

/**
 * Get available Plunet services
 */
export function getPlunetServices(): Array<{ name: string; value: string; description: string }> {
	return [
		{ name: 'Authentication', value: 'auth', description: 'Login, logout, and session management' },
		{ name: 'Customer Management', value: 'customer', description: 'Manage customers and customer data' },
		{ name: 'Order Management', value: 'order', description: 'Create and manage orders' },
		{ name: 'Quote Management', value: 'quote', description: 'Create and manage quotes' },
		{ name: 'Job Management', value: 'job', description: 'Manage jobs and assignments' },
		{ name: 'Resource Management', value: 'resource', description: 'Manage translators and vendors' },
		{ name: 'Document Management', value: 'document', description: 'Handle documents and files' },
		{ name: 'Invoice Management', value: 'invoice', description: 'Manage invoices and billing' },
		{ name: 'User Management', value: 'user', description: 'Manage system users' },
		{ name: 'Admin Functions', value: 'admin', description: 'Administrative operations' },
	];
}
