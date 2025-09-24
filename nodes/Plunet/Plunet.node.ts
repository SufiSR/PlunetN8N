import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    IDataObject,
    IBinaryData,
} from 'n8n-workflow';

import { description } from './description';
import { Creds, Service } from './core/types';

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
import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30CoreService } from './services/dataCustomer30.core';
import { DataCustomer30MiscService } from './services/dataCustomer30.misc';
import { DataJob30CoreService } from './services/dataJob30.core';
import { DataJob30MiscService } from './services/dataJob30.misc';
import { DataJob30PricesService } from './services/dataJob30.prices';
import { DataResource30CoreService } from './services/dataResource30.core';
import { DataResource30MiscService } from './services/dataResource30.misc';
import { DataDocument30Service } from './services/dataDocument30';
// import { DataJob30Service } from './services/dataJob30';


const registry: Record<string, Service> = {
    [PlunetApiService.resource]: PlunetApiService,
    [DataCustomer30CoreService.resource]: DataCustomer30CoreService,
    [DataResource30CoreService.resource]: DataResource30CoreService,
    [DataJob30CoreService.resource]: DataJob30CoreService,
    [DataJob30PricesService.resource]: DataJob30PricesService,
    [DataDocument30Service.resource]: DataDocument30Service,
    [DataCustomer30MiscService.resource]: DataCustomer30MiscService,
    [DataResource30MiscService.resource]: DataResource30MiscService,    
    [DataJob30MiscService.resource]: DataJob30MiscService,
    //[DataJob30Service.resource]: DataJob30Service,
};

export class Plunet implements INodeType {
    description: INodeTypeDescription = description;

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
                            // Convert base64 string to Uint8Array
                            const fileBuffer = base64ToUint8Array(fileContent);
                            
                            // Convert Uint8Array to Buffer for n8n compatibility
                            const buffer = new Uint8Array(fileBuffer);
                            
                            // Prepare binary data for n8n
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
