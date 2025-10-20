import { IDataObject } from 'n8n-workflow';
import { Creds } from './types';
import { sanitizeEnvelope } from './soap';

/**
 * Centralized debug management for Plunet N8N integration
 * Handles debug mode checking and output formatting with proper sanitization
 */
export class DebugManager {
    /**
     * Check if debug mode is enabled for the given credentials
     */
    static shouldDebug(creds: Creds): boolean {
        return creds.enableDebugMode === true;
    }

    /**
     * Create standardized debug output with sanitized SOAP envelope
     * @param envelope - The SOAP envelope sent to Plunet
     * @param soapAction - The SOAP action used
     * @param url - The endpoint URL
     * @param responseXml - The response XML from Plunet
     * @returns Debug information object
     */
    static createDebugOutput(
        envelope: string,
        soapAction: string,
        url: string,
        responseXml: string
    ): IDataObject {
        return {
            debugInfo: {
                request: {
                    url,
                    soapAction,
                    envelope: sanitizeEnvelope(envelope)
                },
                response: {
                    xml: responseXml
                },
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Create debug output for errors with sanitized envelope
     * @param envelope - The SOAP envelope sent to Plunet
     * @param soapAction - The SOAP action used
     * @param url - The endpoint URL
     * @param error - The error that occurred
     * @returns Debug information object for errors
     */
    static createErrorDebugOutput(
        envelope: string,
        soapAction: string,
        url: string,
        error: string
    ): IDataObject {
        return {
            debugInfo: {
                request: {
                    url,
                    soapAction,
                    envelope: sanitizeEnvelope(envelope)
                },
                error: {
                    message: error
                },
                timestamp: new Date().toISOString()
            }
        };
    }
}
