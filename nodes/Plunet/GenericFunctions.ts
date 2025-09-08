import { IExecuteFunctions, ICredentialDataDecryptedObject, INodeExecutionData } from 'n8n-workflow';
import { SoapHandler, SoapResponse } from './SoapHandler';

export interface PlunetCredentials {
    serverUrl: string;     // normalized base URL (built from serverUrl OR baseHost/useHttps)
    username?: string;
    password?: string;
    timeout?: number;      // ms
}

export interface AuthSession {
    uuid: string;
    expiresAt: number;
}

const sessionCache = new Map<string, AuthSession>();

/** Normalize creds to a base URL */
function normalizeBaseUrl(creds: ICredentialDataDecryptedObject): string {
    // Support either `serverUrl` OR (`baseHost` + `useHttps`)
    const serverUrl = (creds as any).serverUrl as string | undefined;
    if (serverUrl && serverUrl.trim()) {
        return serverUrl.replace(/\/$/, '');
    }
    const baseHost = (creds as any).baseHost as string | undefined;
    const useHttps = (creds as any).useHttps as boolean | undefined;
    if (!baseHost || !baseHost.trim()) {
        throw new Error('Plunet credentials missing base host / server URL');
    }
    const scheme = useHttps === false ? 'http' : 'https';
    return `${scheme}://${baseHost.replace(/\/$/, '')}`;
}

/** Get Plunet credentials (compatible with both credential shapes) */
export async function getPlunetCredentials(executeFunctions: IExecuteFunctions): Promise<PlunetCredentials> {
    const credentials = (await executeFunctions.getCredentials('plunetApi')) as ICredentialDataDecryptedObject;
    return {
        serverUrl: normalizeBaseUrl(credentials),
        username: (credentials as any).username as string | undefined,
        password: (credentials as any).password as string | undefined,
        timeout: ((credentials as any).timeout as number | undefined) ?? 30000,
    };
}

/** Create SOAP handler instance */
export async function createSoapHandler(executeFunctions: IExecuteFunctions): Promise<SoapHandler> {
    const credentials = await getPlunetCredentials(executeFunctions);
    return new SoapHandler(executeFunctions, credentials.serverUrl);
}

/** Authenticate with Plunet API and get UUID token (with simple cache) */
export async function authenticatePlunet(executeFunctions: IExecuteFunctions): Promise<string> {
    const credentials = await getPlunetCredentials(executeFunctions);
    const cacheKey = `${credentials.serverUrl}:${credentials.username ?? 'anonymous'}`;

    // cached?
    const cachedSession = sessionCache.get(cacheKey);
    if (cachedSession && cachedSession.expiresAt > Date.now()) {
        return cachedSession.uuid;
    }

    // Perform login
    const soapHandler = await createSoapHandler(executeFunctions);
    const loginEnvelope = soapHandler.createSoapEnvelope({
        operation: 'login',
        parameters: {
            arg0: credentials.username ?? '',
            arg1: credentials.password ?? '',
        },
    });

    const response = await soapHandler.executeSoapRequest('PlunetAPI', loginEnvelope);
    if (!response.success) {
        throw new Error(`Authentication failed: ${response.error ?? 'unknown error'}`);
    }

    const uuid = SoapHandler.extractUuidFromResponse(response);
    if (!uuid) {
        throw new Error('Failed to extract UUID from login response');
    }

    // Cache the session for 30 minutes
    sessionCache.set(cacheKey, {
        uuid,
        expiresAt: Date.now() + 30 * 60 * 1000,
    });

    return uuid;
}

/** Logout from Plunet API */
export async function logoutPlunet(executeFunctions: IExecuteFunctions, uuid: string): Promise<void> {
    const soapHandler = await createSoapHandler(executeFunctions);
    const logoutEnvelope = soapHandler.createSoapEnvelope({
        operation: 'logout',
        uuid,
    });
    await soapHandler.executeSoapRequest('PlunetAPI', logoutEnvelope);

    // Clear from cache
    const credentials = await getPlunetCredentials(executeFunctions);
    const cacheKey = `${credentials.serverUrl}:${credentials.username ?? 'anonymous'}`;
    sessionCache.delete(cacheKey);
}

/** Validate UUID token */
export async function validateUuid(executeFunctions: IExecuteFunctions, uuid: string): Promise<boolean> {
    const soapHandler = await createSoapHandler(executeFunctions);
    const validateEnvelope = soapHandler.createSoapEnvelope({
        operation: 'validate',
        uuid,
    });
    const response = await soapHandler.executeSoapRequest('PlunetAPI', validateEnvelope);
    // Some instances return boolean true/false; others return "true"/"false"
    const v = (response.data as any);
    return response.success && (v === true || v === 'true');
}

/** Execute authenticated SOAP operation */
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

    return soapHandler.executeSoapRequest(endpoint, envelope);
}

/** Format response data for n8n */
export function formatResponseForN8N(response: SoapResponse, operation: string): INodeExecutionData[] {
    if (!response.success) {
        throw new Error(`Operation ${operation} failed: ${response.error ?? 'unknown error'}`);
    }
    if (Array.isArray(response.data)) {
        return response.data.map((item) => ({ json: { operation, success: true, data: item } }));
    }
    return [{ json: { operation, success: true, data: response.data } }];
}

/** Handle errors and format for n8n */
export function handleError(error: Error, operation: string): INodeExecutionData[] {
    return [{ json: { operation, success: false, error: error.message } }];
}

/** Convert n8n parameters to Plunet API format (pass-through with light cleanup) */
export function convertParametersForPlunet(parameters: Record<string, any>): Record<string, any> {
    const converted: Record<string, any> = {};
    for (const [key, value] of Object.entries(parameters)) {
        if (value === undefined || value === null || value === '') continue;
        if (value instanceof Date) converted[key] = value.toISOString();
        else converted[key] = value;
    }
    return converted;
}

/** Services list (for the UI) */
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
