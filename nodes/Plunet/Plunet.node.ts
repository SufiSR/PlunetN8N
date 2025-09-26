import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    IDataObject,
    IBinaryData,
    ILoadOptionsFunctions,
} from 'n8n-workflow';

import { description } from './description';
import { Creds, Service } from './core/types';
import { executeOperation, type ExecuteConfig } from './core/executor';
import { NUMERIC_BOOLEAN_PARAMS } from './core/constants';
import { extractStatusMessage } from './core/xml';

// Simple base64 decoder for Node.js environment
function base64ToUint8Array(base64: string): Uint8Array {
    // Manual base64 decoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    
    base64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
    
    while (i < base64.length) {
        const encoded1 = chars.indexOf(base64.charAt(i++));
        const encoded2 = chars.indexOf(base64.charAt(i++));
        const encoded3 = chars.indexOf(base64.charAt(i++));
        const encoded4 = chars.indexOf(base64.charAt(i++));
        
        const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
        
        result += String.fromCharCode((bitmap >> 16) & 255);
        if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
        if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
    }
    
    const bytes = new Uint8Array(result.length);
    for (let i = 0; i < result.length; i++) {
        bytes[i] = result.charCodeAt(i);
    }
    return bytes;
}

// Create execute config for DataAdmin30 service
function createAdminExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return {
        url,
        soapActionFor: (op: string) => `http://API.Integration/${op}`,
        paramOrder: { getAvailableProperties: ['usageArea', 'mainID'] },
        numericBooleans: NUMERIC_BOOLEAN_PARAMS,
        getSessionId: async (ctx: IExecuteFunctions) => {
            const { ensureSession } = await import('./core/session');
            return ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0);
        },
        parseResult: (xml: string, op: string) => {
            // Parse PropertyListResult for getAvailableProperties
            const base = extractResultBase(xml);
            
            // Look for PropertyListResult scope
            const propertyListResultScope = findFirstTagBlock(xml, 'PropertyListResult');
            if (!propertyListResultScope) {
                return { statusMessage: base.statusMessage, statusCode: base.statusCode };
            }
            
            // Extract all m_Data blocks
            const mDataMatches = propertyListResultScope.match(/<m_Data>[\s\S]*?<\/m_Data>/g);
            if (!mDataMatches) {
                return { statusMessage: base.statusMessage, statusCode: base.statusCode };
            }
            
            const propertyNames: string[] = [];
            
            mDataMatches.forEach(mDataBlock => {
                const propertyNameMatch = mDataBlock.match(/<propertyNameEnglish>(.*?)<\/propertyNameEnglish>/);
                if (propertyNameMatch && propertyNameMatch[1]) {
                    propertyNames.push(propertyNameMatch[1]);
                }
            });
            
            // Return as StringArray format (same as parseStringArrayResult)
            return {
                data: propertyNames,
                statusMessage: base.statusMessage,
                statusCode: base.statusCode
            };
        },
    };
}

// Helper function to find first tag block
function findFirstTagBlock(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? match[0] : null;
}

// Helper function to extract result base
function extractResultBase(xml: string): { statusMessage?: string; statusCode?: number } {
    const statusCodeMatch = xml.match(/<statusCode>(.*?)<\/statusCode>/);
    const statusMessageMatch = xml.match(/<statusMessage>(.*?)<\/statusMessage>/);
    
    return {
        statusCode: statusCodeMatch ? parseInt(statusCodeMatch[1] || '0', 10) : undefined,
        statusMessage: statusMessageMatch ? statusMessageMatch[1] : undefined
    };
}

import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30CoreService } from './services/dataCustomer30.core';
import { DataCustomer30MiscService } from './services/dataCustomer30.misc';
import { DataJob30CoreService } from './services/dataJob30.core';
import { DataJob30MiscService } from './services/dataJob30.misc';
import { DataJob30PricesService } from './services/dataJob30.prices';
import { DataResource30CoreService } from './services/dataResource30.core';
import { DataResource30MiscService } from './services/dataResource30.misc';
import { DataDocument30Service } from './services/dataDocument30';
import { DataCustomFields30Service } from './services/dataCustomFields30';
import { DataAdmin30Service } from './services/dataAdmin30';
import { getAvailablePropertyNames, getAvailableTextModuleFlags } from './services/loadOptions';
// import { DataJob30Service } from './services/dataJob30';


const registry: Record<string, Service> = {
    [PlunetApiService.resource]: PlunetApiService,
    [DataCustomer30CoreService.resource]: DataCustomer30CoreService,
    [DataResource30CoreService.resource]: DataResource30CoreService,
    [DataJob30CoreService.resource]: DataJob30CoreService,    
    [DataDocument30Service.resource]: DataDocument30Service,
    [DataCustomFields30Service.resource]: DataCustomFields30Service,
    [DataAdmin30Service.resource]: DataAdmin30Service,
    [DataCustomer30MiscService.resource]: DataCustomer30MiscService,
    [DataResource30MiscService.resource]: DataResource30MiscService,
    [DataJob30PricesService.resource]: DataJob30PricesService,
    [DataJob30MiscService.resource]: DataJob30MiscService,
    //[DataJob30Service.resource]: DataJob30Service,
};

export class Plunet implements INodeType {
    description: INodeTypeDescription = description;

    methods = {
        loadOptions: {
            getAvailablePropertyNames,
            getAvailableTextModuleFlags,
        },
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const out: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const resource = this.getNodeParameter('resource', i) as string;
                const operation = this.getNodeParameter('operation', i) as string;

                const svc = registry[resource];
                if (!svc) throw new Error(`Unsupported resource: ${resource}`);

                const creds = (await this.getCredentials('plunetApi')) as unknown as Creds;
                const scheme = creds.useHttps ? 'https' : 'http';
                const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
                const url = `${baseUrl}/${svc.endpoint}`;
                const timeoutMs = creds.timeout ?? 30000;

                // Check if this operation needs special handling (non-SOAP operations)
                if (svc.needsSpecialHandling && svc.needsSpecialHandling(operation) && svc.handleSpecialOperation) {
                    const result = await svc.handleSpecialOperation(operation, this, i);
                    if (result.binary) {
                        out.push({ json: result.json, binary: result.binary });
                    } else {
                        out.push({ json: result.json });
                    }
                    continue;
                }

                const payload = await svc.execute(operation, this, creds, url, baseUrl, timeoutMs, i);

                // Check if the result needs special post-processing (e.g., binary data handling)
                if (svc.needsPostProcessing && svc.needsPostProcessing(operation, payload) && svc.postProcessResult) {
                    const processedResult = await svc.postProcessResult(operation, payload, this, i);
                    if (processedResult.binary) {
                        out.push({ json: processedResult.json, binary: processedResult.binary });
                    } else {
                        out.push({ json: processedResult.json });
                    }
                } else {
                    // Services already include success/resource/operation; forward as-is.
                    out.push({ json: payload as IDataObject });
                }
            } catch (err) {
                if (this.continueOnFail()) {
                    out.push({ json: { success: false, error: (err as Error).message } });
                } else {
                    throw err;
                }
            }
        }

        return [out];
    }
}
