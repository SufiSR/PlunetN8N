export class SoapRequestError extends Error {
  constructor(
    public readonly op: string,
    public readonly url: string,
    public readonly soapAction: string,
    public readonly envelopeSnippet: string,
    public readonly rawMessage: string,
  ) {
    super(rawMessage);
    this.name = 'SoapRequestError';
  }
}

/**
 * Enhanced error class for Plunet operations with standardized formatting
 */
export class PlunetOperationError extends Error {
  constructor(
    public readonly operation: string,
    public readonly resource: string,
    public readonly statusCode?: number,
    public readonly statusMessage?: string,
    public readonly envelopeSnippet?: string,
    public readonly url?: string,
    public readonly soapAction?: string,
  ) {
    const message = formatErrorMessage(operation, resource, statusMessage, statusCode);
    super(message);
    this.name = 'PlunetOperationError';
  }
}

/**
 * Format error message with operation context
 */
function formatErrorMessage(
  operation: string,
  resource: string,
  statusMessage?: string,
  statusCode?: number
): string {
  const context = `[${resource}] ${operation}`;
  const message = statusMessage || 'Operation failed';
  const code = statusCode !== undefined ? ` [${statusCode}]` : '';
  return `${context}: ${message}${code}`;
}

/**
 * Factory methods for creating standardized Plunet errors
 */
export class PlunetErrorFactory {
  /**
   * Create a SOAP fault error
   */
  static createSoapFaultError(
    operation: string,
    resource: string,
    fault: string,
    envelope?: string
  ): PlunetOperationError {
    return new PlunetOperationError(
      operation,
      resource,
      undefined,
      fault,
      envelope
    );
  }

  /**
   * Create a status error
   */
  static createStatusError(
    operation: string,
    resource: string,
    statusCode: number,
    statusMessage: string,
    envelope?: string
  ): PlunetOperationError {
    return new PlunetOperationError(
      operation,
      resource,
      statusCode,
      statusMessage,
      envelope
    );
  }

  /**
   * Create a network error
   */
  static createNetworkError(
    operation: string,
    resource: string,
    error: string,
    envelope?: string
  ): PlunetOperationError {
    return new PlunetOperationError(
      operation,
      resource,
      undefined,
      error,
      envelope
    );
  }
}

export function throwForSoapFaultOrStatus(
  xmlObj: any,
  op: string,
  url: string,
  soapAction: string,
  envelope: string,
  statusCode?: number,
  statusMessage?: string,
  resource?: string,
) {
  const body = xmlObj?.['soap:Envelope']?.['soap:Body'] ?? xmlObj?.Envelope?.Body ?? null;
  const fault = body?.['soap:Fault'] ?? body?.Fault;
  if (fault) {
    const msg = String(fault?.faultstring || fault?.faultcode || 'SOAP Fault');
    throw PlunetErrorFactory.createSoapFaultError(op, resource || 'Unknown', msg, envelope);
  }
  if (statusCode !== undefined && statusCode !== 0) {
    // Exclude specific error codes that should be handled as success cases
    const excludedErrorCodes = [-57, -24, 7028];
    if (!excludedErrorCodes.includes(statusCode)) {
      throw PlunetErrorFactory.createStatusError(
        op,
        resource || 'Unknown',
        statusCode,
        statusMessage || 'Plunet returned error status',
        envelope
      );
    }
  }
}

function withSnippet(op: string, url: string, soapAction: string, envelope: string, msg: string) {
  const snippet = envelope.length > 2000 ? envelope.slice(0, 2000) + '…' : envelope;
  const fullMessage = `${msg}\n\nRequest Details:\nURL: ${url}\nSOAP Action: ${soapAction}\nEnvelope:\n${snippet}`;
  return new SoapRequestError(op, url, soapAction, snippet, fullMessage);
}
