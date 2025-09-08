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
		this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

		// Configure XML parser
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

	/**
	 * Create SOAP envelope for Plunet API calls
	 */
	createSoapEnvelope(options: SoapEnvelopeOptions): string {
		const { operation, parameters = {}, uuid } = options;

		let bodyContent = `<api:${operation}>`;

		// Add UUID if provided (for authenticated calls)
		if (uuid) {
			bodyContent += `<UUID>${uuid}</UUID>`;
		}

		// Add parameters
		Object.entries(parameters).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				if (typeof value === 'object') {
					bodyContent += `<${key}>${this.objectToXml(value)}</${key}>`;
				} else {
					bodyContent += `<${key}>${this.escapeXml(String(value))}</${key}>`;
				}
			} else {
				bodyContent += `<${key}>?</${key}>`;
			}
		});

		bodyContent += `</api:${operation}>`;

		return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
	<soap:Header/>
	<soap:Body>
		${bodyContent}
	</soap:Body>
</soap:Envelope>`;
	}

	/**
	 * Execute SOAP request
	 */
	async executeSoapRequest(
		endpoint: string,
		soapEnvelope: string,
		soapAction: string = '',
	): Promise<SoapResponse> {
		try {
			const options: IHttpRequestOptions = {
				method: 'POST',
				url: `${this.baseUrl}/${endpoint}`,
				headers: {
					'Content-Type': 'text/xml; charset=utf-8',
					'SOAPAction': soapAction,
				},
				body: soapEnvelope,
			};

			const response = await this.executeFunctions.helpers.httpRequest(options);
			return this.parseSoapResponse(response);
		} catch (error) {
			return {
				success: false,
				error: error.message || 'SOAP request failed',
			};
		}
	}

	/**
	 * Parse SOAP response
	 */
	private parseSoapResponse(response: any): SoapResponse {
		try {
			const parsed = this.xmlParser.parse(response);
			const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'];
			
			if (!envelope) {
				return {
					success: false,
					error: 'Invalid SOAP response format',
				};
			}

			const body = envelope['soap:Body'] || envelope['soapenv:Body'];
			
			// Check for SOAP fault
			const fault = body['soap:Fault'] || body['soapenv:Fault'];
			if (fault) {
				return {
					success: false,
					error: fault.faultstring || fault.detail || 'SOAP fault occurred',
				};
			}

			// Extract response data
			const responseKeys = Object.keys(body).filter(key => 
				key.includes('Response') || key.includes('Return')
			);

			if (responseKeys.length === 0) {
				return {
					success: true,
					data: body,
				};
			}

			const responseData = body[responseKeys[0]];
			const returnValue = responseData?.return || responseData;

			return {
				success: true,
				data: returnValue,
			};
		} catch (error) {
			return {
				success: false,
				error: `Failed to parse SOAP response: ${error.message}`,
			};
		}
	}

	/**
	 * Convert object to XML string
	 */
	private objectToXml(obj: any): string {
		if (typeof obj !== 'object' || obj === null) {
			return this.escapeXml(String(obj));
		}

		let xml = '';
		Object.entries(obj).forEach(([key, value]) => {
			if (Array.isArray(value)) {
				value.forEach(item => {
					xml += `<${key}>${this.objectToXml(item)}</${key}>`;
				});
			} else if (typeof value === 'object' && value !== null) {
				xml += `<${key}>${this.objectToXml(value)}</${key}>`;
			} else {
				xml += `<${key}>${this.escapeXml(String(value))}</${key}>`;
			}
		});
		return xml;
	}

	/**
	 * Escape XML special characters
	 */
	private escapeXml(str: string): string {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}

	/**
	 * Extract UUID from login response
	 */
	static extractUuidFromResponse(response: SoapResponse): string | null {
		if (!response.success || !response.data) {
			return null;
		}

		// UUID is typically returned as a string in the response
		if (typeof response.data === 'string' && response.data.match(/^[a-f0-9-]{36}$/i)) {
			return response.data;
		}

		// Sometimes it might be nested
		if (response.data.uuid) {
			return response.data.uuid;
		}

		return null;
	}
}

