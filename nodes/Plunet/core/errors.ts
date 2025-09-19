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

export function throwForSoapFaultOrStatus(
  xmlObj: any,
  op: string,
  url: string,
  soapAction: string,
  envelope: string,
  statusCode?: number,
  statusMessage?: string,
) {
  const body = xmlObj?.['soap:Envelope']?.['soap:Body'] ?? xmlObj?.Envelope?.Body ?? null;
  const fault = body?.['soap:Fault'] ?? body?.Fault;
  if (fault) {
    const msg = String(fault?.faultstring || fault?.faultcode || 'SOAP Fault');
    throw withSnippet(op, url, soapAction, envelope, msg);
  }
  if (statusCode !== undefined && statusCode !== 0) {
    const msg = `Plunet returned status ${statusCode}${statusMessage ? `: ${statusMessage}` : ''}`;
    throw withSnippet(op, url, soapAction, envelope, msg);
  }
}

function withSnippet(op: string, url: string, soapAction: string, envelope: string, msg: string) {
  const snippet = envelope.length > 2000 ? envelope.slice(0, 2000) + '…' : envelope;
  const fullMessage = `${msg}\n\nRequest Details:\nURL: ${url}\nSOAP Action: ${soapAction}\nEnvelope:\n${snippet}`;
  return new SoapRequestError(op, url, soapAction, snippet, fullMessage);
}
