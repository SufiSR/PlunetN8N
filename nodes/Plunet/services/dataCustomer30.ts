import { IExecuteFunctions, IDataObject, INodeProperties } from 'n8n-workflow';
import { Creds, Service } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { extractStatusMessage } from '../core/xml';

const RESOURCE = 'DataCustomer30';

// Example op (skeleton). Add more here — they’ll appear under Resource=DataCustomer30.
const extraProperties: INodeProperties[] = [
    {
        displayName: 'Customer ID',
        name: 'customerId',
        type: 'string',
        default: '',
        description: 'ID of the customer',
        displayOptions: { show: { resource: [RESOURCE], operation: ['getCustomerById'] } },
    },
];

async function getCustomerByIdOp(
    ctx: IExecuteFunctions,
    _creds: Creds,
    url: string,
    _baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
): Promise<IDataObject> {
    const customerId = (ctx.getNodeParameter('customerId', itemIndex) as string).trim();

    const env11 = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:getCustomerById>
      <customerId>${escapeXml(customerId)}</customerId>
    </api:getCustomerById>
  </soapenv:Body>
</soapenv:Envelope>`;

    const body = await sendSoapWithFallback(ctx, url, env11, 'http://API.Integration/getCustomerById', timeoutMs);

    // For demo we return raw body + statusMessage.
    // In your real implementation, parse specific fields you need from `body`.
    const statusMessage = extractStatusMessage(body);
    const result: IDataObject = { rawResponse: body };
    if (statusMessage) result.statusMessage = statusMessage;
    return result;
}

export const DataCustomer30Service: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Customers (DataCustomer30)',
    resourceDescription: 'Customer-related endpoints',
    endpoint: 'DataCustomer30',
    operationOptions: [
        {
            name: 'Get Customer by ID',
            value: 'getCustomerById',
            action: 'Fetch customer',
            description: 'Retrieve a single customer by ID',
        },
        // Add more “DataCustomer30” operations here…
    ],
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        if (operation === 'getCustomerById') return getCustomerByIdOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
        throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
    },
};
