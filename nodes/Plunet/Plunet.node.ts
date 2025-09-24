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
// import { DataJob30Service } from './services/dataJob30';


const registry: Record<string, Service> = {
    [PlunetApiService.resource]: PlunetApiService,
    [DataCustomer30CoreService.resource]: DataCustomer30CoreService,
    [DataResource30CoreService.resource]: DataResource30CoreService,
    [DataJob30CoreService.resource]: DataJob30CoreService,
    [DataJob30PricesService.resource]: DataJob30PricesService,
    [DataDocument30Service.resource]: DataDocument30Service,
    [DataCustomFields30Service.resource]: DataCustomFields30Service,
    [DataAdmin30Service.resource]: DataAdmin30Service,
    [DataCustomer30MiscService.resource]: DataCustomer30MiscService,
    [DataResource30MiscService.resource]: DataResource30MiscService,    
    [DataJob30MiscService.resource]: DataJob30MiscService,
    //[DataJob30Service.resource]: DataJob30Service,
};

export class Plunet implements INodeType {
    description: INodeTypeDescription = description;

    methods = {
        loadOptions: {
        async getAvailablePropertyNames(this: ILoadOptionsFunctions) {
            const usageArea = this.getCurrentNodeParameter('PropertyUsageArea') as number;
            const mainID = this.getCurrentNodeParameter('MainID') as number;
                
                if (!usageArea || !mainID) {
                    return [
                        {
                            name: 'Please set Usage Area and Main ID first',
                            value: '',
                            disabled: true
                        }
                    ];
                }
                
                try {
                    // Get credentials
                    const creds = await this.getCredentials('plunetApi') as Creds;
                    const scheme = creds.useHttps ? 'https' : 'http';
                    const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
                    const url = `${baseUrl}/DataAdmin30`;
                    const timeoutMs = creds.timeout ?? 30000;
                    
                    // Create execute config for DataAdmin30
                    const config = createAdminExecuteConfig(creds, url, baseUrl, timeoutMs);
                    
                    // Call getAvailableProperties using a different approach
                    // We need to make a direct SOAP call since executeOperation expects IExecuteFunctions
                    const sessionId = await config.getSessionId(this as any, 0);
                    const soapAction = config.soapActionFor('getAvailableProperties');
                    
                    // Build SOAP envelope
                    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:getAvailableProperties>
         <UUID>${sessionId}</UUID>
         <PropertyUsageArea>${usageArea}</PropertyUsageArea>
         <MainID>${mainID}</MainID>
      </api:getAvailableProperties>
   </soap:Body>
</soap:Envelope>`;
                    
                    // Make SOAP request
                    const response = await this.helpers.request({
                        method: 'POST',
                        url: config.url,
                        headers: {
                            'Content-Type': 'application/soap+xml; charset=utf-8',
                            'SOAPAction': soapAction,
                        },
                        body: envelope,
                    });
                    
                    // Parse response
                    const parsed = config.parseResult(response, 'getAvailableProperties') as IDataObject;
                    
                    // Debug: Check what we got
                    if (parsed.statusCode && parsed.statusCode !== 0) {
                        return [
                            {
                                name: `API Error: ${parsed.statusMessage || 'Unknown error'} (Code: ${parsed.statusCode})`,
                                value: 0,
                                disabled: true
                            }
                        ];
                    }
                    
                    if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
                        const propertyNames = parsed.data as string[];
                        // Return only the actual property names without placeholder
                        return propertyNames.map((name: string) => ({
                            name: name,
                            value: name
                        }));
                    }
                    
                    // If no properties found, show helpful message
                    return [
                        {
                            name: 'No properties found for this Usage Area and Main ID combination',
                            value: 0,
                            disabled: true
                        }
                    ];
                } catch (error) {
                    // Return helpful message on error with more details
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    return [
                        {
                            name: `Error loading properties: ${errorMessage}`,
                            value: 0,
                            disabled: true
                        }
                    ];
                }
            },
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

                // Special handling for conversion operations that don't use SOAP
                if (resource === 'DataDocument30' && (operation === 'convertBytestreamToBinary' || operation === 'convertBinaryToBytestream')) {
                    let result: IDataObject;
                    
                    if (operation === 'convertBytestreamToBinary') {
                        const fileContent = this.getNodeParameter('fileContent', i) as string;
                        const fileName = this.getNodeParameter('fileName', i) as string;
                        const mimeType = this.getNodeParameter('mimeType', i) as string;
                        
                        try {
                            // Convert base64 string to Buffer using global Buffer
                            // @ts-ignore - Buffer is available globally in Node.js
                            const buffer = Buffer.from(fileContent, 'base64');
                            
                            // Use prepareBinaryData with the Buffer
                            const binaryData = await this.helpers.prepareBinaryData(
                                buffer,
                                fileName || 'converted_file',
                                mimeType || 'application/octet-stream'
                            );

                            result = { 
                                success: true,
                                resource: 'DataDocument30',
                                operation: 'convertBytestreamToBinary',
                                message: 'Successfully converted bytestream to binary data',
                                fileName: fileName,
                                mimeType: mimeType
                            };
                            
                            out.push({ 
                                json: result,
                                binary: { data: binaryData }
                            });
                        } catch (conversionError) {
                            const errorMessage = conversionError instanceof Error ? conversionError.message : String(conversionError);
                            throw new Error(`Failed to convert bytestream to binary: ${errorMessage}`);
                        }
                        continue;
                        
                    } else if (operation === 'convertBinaryToBytestream') {
                        // Get binary data from input
                        const inputData = this.getInputData()[i];
                        const binaryData = inputData?.binary?.data;
                        if (!binaryData) {
                            throw new Error('No binary data found in input. Please connect a node that provides binary data.');
                        }
                        
                        try {
                            // Get the binary buffer
                            const buffer = await this.helpers.getBinaryDataBuffer(i, 'data');
                            
                            // Convert to base64 string
                            const base64String = buffer.toString('base64');
                            
                            result = { 
                                success: true,
                                resource: 'DataDocument30',
                                operation: 'convertBinaryToBytestream',
                                message: 'Successfully converted binary data to bytestream',
                                fileContent: base64String,
                                fileName: binaryData.fileName || 'converted_file',
                                mimeType: binaryData.mimeType || 'application/octet-stream'
                            };
                        } catch (bufferError) {
                            // If getBinaryDataBuffer fails, try to get the data directly from the binary object
                            if (binaryData.data) {
                                const base64String = binaryData.data;
                                result = { 
                                    success: true,
                                    resource: 'DataDocument30',
                                    operation: 'convertBinaryToBytestream',
                                    message: 'Successfully converted binary data to bytestream (direct method)',
                                    fileContent: base64String,
                                    fileName: binaryData.fileName || 'converted_file',
                                    mimeType: binaryData.mimeType || 'application/octet-stream'
                                };
                            } else {
                                const errorMessage = bufferError instanceof Error ? bufferError.message : String(bufferError);
                                throw new Error(`Failed to convert binary data: ${errorMessage}`);
                            }
                        }
                        
                        out.push({ json: result });
                        continue;
                    }
                }

                const payload = await svc.execute(operation, this, creds, url, baseUrl, timeoutMs, i);

                // Special handling for download operations that return binary data
                if (resource === 'DataDocument30' && operation === 'downloadDocument' && payload.fileContent) {
                    try {
                        // Convert base64 string to Uint8Array
                        const fileBuffer = base64ToUint8Array(String(payload.fileContent));
                        
                        // Prepare binary data for n8n
                        const binaryData = await this.helpers.prepareBinaryData(
                            fileBuffer, 
                            String(payload.filename || 'downloaded_file'),
                            'application/octet-stream'
                        );

                        // Return both JSON metadata and binary data
                        out.push({ 
                            json: { 
                                success: payload.success,
                                resource: payload.resource,
                                operation: payload.operation,
                                fileSize: payload.fileSize,
                                filename: payload.filename,
                                statusMessage: payload.statusMessage,
                                statusCode: payload.statusCode
                            } as IDataObject,
                            binary: { data: binaryData }
                        });
                    } catch (binaryError) {
                        // If binary conversion fails, return the raw data
                        out.push({ json: payload as IDataObject });
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
