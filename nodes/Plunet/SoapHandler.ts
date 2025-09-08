import { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export interface SoapEnvelopeOptions {
    operation: string;
    parameters?: Record<string, any>;
    uuid?: string;
}

export interface SoapResponse {
    success: boolean;
    data?: any;
    error?: string;
    uuid?: string;
}

export class SoapHandler {
    private executeFunctions: IExecuteFunctions;
    private baseUrl: string;
    private xmlParser: XMLParser;
    private xmlBuilder: XMLBuilder;

    constructor(executeFunctions: IExecuteFunctions, baseUrl: string) {
        this.executeFunctions = executeFunctions;
        this.baseUrl = baseUrl.replace(/\/$/, '');

        this.xmlParser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text',
            parseAttributeValue: true,
            trimValues: true,
        });

        this.xmlBuilder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text',
            format: true,
        });
    }

    /** Create SOAP envelope for Plunet API calls (SOAP 1.2 envelope; works with 1.1 content-type below) */
    createSoapEnvelope(options: SoapEnvelopeOptions): string {
        const { operation, parameters = {}, uuid } = options;

        let bodyContent = `<api:${operation}>`;
        if (uuid) bodyContent += `<UUID>${this.escapeXml(uuid)}</UUID>`;

        for (const [key, value] of Object.entries(parameters)) {
            if (value === undefined || value === null) continue;
            if (typeof value === 'object') bodyContent += `<${key}>${this.objectToXml(value)}</${key}>`;
            else bodyContent += `<${key}>${this.escapeXml(String(value))}</${key}>`;
        }
        bodyContent += `</api:${operation}>`;

        return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
  <soap:Header/>
  <soap:Body>
    ${bodyContent}
  </soap:Body>
</soap:Envelope>`;
    }

    /** Execute SOAP request */
    async executeSoapRequest(endpoint: string, soapEnvelope: string, soapAction = ''): Promise<SoapResponse> {
        try {
            const options: IHttpRequestOptions = {
                method: 'POST',
                url: `${this.baseUrl}/${endpoint}`,
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8', // SOAP 1.1 header; Plunet accepts this with 1.2 envelope
                    'SOAPAction': soapAction,
                },
                body: soapEnvelope,
            };

            const response = await this.executeFunctions.helpers.httpRequest(options);
            return this.parseSoapResponse(response);
        } catch (e: any) {
            return { success: false, error: e?.message ?? 'SOAP request failed' };
        }
    }

    /** Parse SOAP response */
    private parseSoapResponse(response: any): SoapResponse {
        try {
            const parsed = typeof response === 'string' ? this.xmlParser.parse(response) : response;
            const env = parsed['soap:Envelope'] || parsed['soapenv:Envelope'] || parsed.Envelope;
            if (!env) return { success: false, error: 'Invalid SOAP response format' };

            const body = env['soap:Body'] || env['soapenv:Body'] || env.Body || {};
            const fault = body['soap:Fault'] || body['soapenv:Fault'] || body.Fault;
            if (fault) return { success: false, error: fault.faultstring || fault.detail || 'SOAP fault occurred' };

            // Find first response element (e.g., getOrderObjectResponse)
            const keys = Object.keys(body);
            const respKey = keys.find((k) => /Response|Return/i.test(k));
            const payload = respKey ? body[respKey] : body;

            // Common pattern: {..., return: <value>}
            const ret = payload?.return ?? payload;
            return { success: true, data: ret };
        } catch (e: any) {
            return { success: false, error: `Failed to parse SOAP response: ${e?.message ?? e}` };
        }
    }

    /** Convert object to XML string */
    private objectToXml(obj: any): string {
        if (typeof obj !== 'object' || obj === null) return this.escapeXml(String(obj));
        let xml = '';
        for (const [key, value] of Object.entries(obj)) {
            if (Array.isArray(value)) {
                for (const item of value) xml += `<${key}>${this.objectToXml(item)}</${key}>`;
            } else if (typeof value === 'object') {
                xml += `<${key}>${this.objectToXml(value)}</${key}>`;
            } else {
                xml += `<${key}>${this.escapeXml(String(value))}</${key}>`;
            }
        }
        return xml;
    }

    /** Escape XML special characters */
    private escapeXml(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    /** Extract UUID from login response */
    static extractUuidFromResponse(response: SoapResponse): string | null {
        if (!response.success || response.data == null) return null;

        // exact string
        if (typeof response.data === 'string' && /^[a-f0-9-]{36}$/i.test(response.data)) return response.data;

        // nested fields
        const uuid = (response.data as any).uuid || (response.data as any).UUID || (response.data as any).token;
        if (typeof uuid === 'string' && /^[a-f0-9-]{36}$/i.test(uuid)) return uuid;

        return null;
    }
}
