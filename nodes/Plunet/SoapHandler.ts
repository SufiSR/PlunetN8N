import { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export interface SoapEnvelopeOptions {
  operation: string;
  parameters?: Record<string, unknown>;
  uuid?: string;
}

export interface SoapResponse {
  success: boolean;
  data?: unknown;
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

    // Remove namespace prefixes so we can read Envelope/Body/Fault reliably
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
      removeNSPrefix: true,
    });

    this.xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      format: true,
    });
  }

  /** Create SOAP 1.2 envelope (we can rewrite to 1.1 on send) */
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
<Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
  <Header/>
  <Body>
    ${bodyContent}
  </Body>
</Envelope>`;
  }

  /**
   * Execute SOAP request.
   * We try SOAP 1.1 first (text/xml + SOAPAction) and fall back to SOAP 1.2.
   * We also fall back if we get a 200 but parsing indicates "not SOAP".
   */
  async executeSoapRequest(endpoint: string, soapEnvelope12: string, soapAction = ''): Promise<SoapResponse> {
    try {
      // --- First attempt: SOAP 1.1 ---
      const soap11 = soapEnvelope12.replace(
        'http://www.w3.org/2003/05/soap-envelope',
        'http://schemas.xmlsoap.org/soap/envelope/',
      );

      let options: IHttpRequestOptions = {
        method: 'POST',
        url: `${this.baseUrl}/${endpoint}`,
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          // SOAP 1.1 requires SOAPAction header, usually quoted
          SOAPAction: soapAction ? `"${soapAction}"` : '""',
        },
        body: soap11,
      };

      try {
        const resp11 = await this.executeFunctions.helpers.httpRequest(options);
        const parsed11 = this.parseSoapResponse(resp11);
        if (parsed11.success || !this.isInvalidSoapFormat(parsed11)) return parsed11;
        // else fall through to try 1.2
      } catch (e: any) {
        const code = (e?.statusCode ?? e?.status ?? 0) as number;
        if (![400, 415, 500].includes(code)) {
          // Non-typical code; still try 1.2 next
        }
      }

      // --- Second attempt: SOAP 1.2 ---
      options = {
        method: 'POST',
        url: `${this.baseUrl}/${endpoint}`,
        headers: {
          // SOAP 1.2 puts action on the Content-Type parameter
          'Content-Type': `application/soap+xml; charset=utf-8${soapAction ? `; action="${soapAction}"` : ''}`,
        },
        body: soapEnvelope12,
      };

      const resp12 = await this.executeFunctions.helpers.httpRequest(options);
      const parsed12 = this.parseSoapResponse(resp12);
      return parsed12;
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'SOAP request failed' };
    }
  }

  /** Heuristic to see if a parse error was "invalid SOAP" */
  private isInvalidSoapFormat(res: SoapResponse): boolean {
    return res.success === false && !!res.error && res.error.startsWith('Invalid SOAP response format');
  }

  /** Parse SOAP response (namespace-agnostic due to removeNSPrefix:true) */
  private parseSoapResponse(response: unknown): SoapResponse {
    try {
      const raw = typeof response === 'string' ? response : String(response ?? '');
      const parsed = typeof response === 'string' ? this.xmlParser.parse(response) : response;

      // Expect { Envelope: { Body: { ... } } }
      // removeNSPrefix:true ensures tags are unprefixed
      const env = (parsed as any)?.Envelope;
      if (!env) {
        return {
          success: false,
          error: `Invalid SOAP response format (no Envelope). Snippet: ${raw.slice(0, 200)}`,
        };
      }

      const body = env.Body ?? {};
      const fault = body.Fault;
      if (fault) {
        const faultString =
          (fault.faultstring as string) ||
          (fault.detail as string) ||
          (fault.reason as string) ||
          'SOAP fault occurred';
        return { success: false, error: faultString };
      }

      // Find first key that looks like a response wrapper
      const keys = Object.keys(body);
      const respKey = keys.find((k) => /Response|Return/i.test(k)) ?? keys[0];
      const payload = respKey ? (body as Record<string, unknown>)[respKey] : body;

      // Common pattern: { return: <value> }
      const ret =
        (payload as any)?.return !== undefined
          ? (payload as any).return
          : payload;

      return { success: true, data: ret };
    } catch (e: any) {
      const snippet =
        typeof response === 'string' ? response.slice(0, 200) : JSON.stringify(response ?? '', null, 0).slice(0, 200);
      return { success: false, error: `Failed to parse SOAP response: ${e?.message ?? e}. Snippet: ${snippet}` };
    }
  }

  /** Convert object to XML string */
  private objectToXml(obj: unknown): string {
    if (typeof obj !== 'object' || obj === null) return this.escapeXml(String(obj));
    let xml = '';
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) xml += `<${key}>${this.objectToXml(item)}</${key}>`;
      } else if (typeof value === 'object' && value !== null) {
        xml += `<${key}>${this.objectToXml(value)}</${key}>`;
      } else {
        xml += `<${key}>${this.escapeXml(String(value))}</${key}>`;
      }
    }
    return xml;
  }

  /** Escape XML special characters */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** Extract UUID from login response */
  static extractUuidFromResponse(response: SoapResponse): string | null {
    if (!response.success || response.data == null) return null;

    if (typeof response.data === 'string' && /^[a-f0-9-]{36}$/i.test(response.data)) return response.data;

    const maybe =
      (response.data as any).uuid ||
      (response.data as any).UUID ||
      (response.data as any).token ||
      (response.data as any).sessionId;
    if (typeof maybe === 'string' && /^[a-f0-9-]{36}$/i.test(maybe)) return maybe;

    return null;
  }
}
