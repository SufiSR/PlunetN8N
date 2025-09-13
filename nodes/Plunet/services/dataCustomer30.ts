import { IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { Creds, Service } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { extractStatusMessage } from '../core/xml';
import { ensureSession } from '../core/session';

const RESOURCE = 'DataCustomer30';

/**
 * Full operation list pulled from your OpenAPI (Postman → OpenAPI) file.
 * These become the actions shown when Resource = DataCustomer30.
 */
const OPS: string[] = [
  'delete',
  'deregisterCallback_Notify',
  'deregisterCallback_Observer',
  'getAcademicTitle',
  'getAccount',
  'getAccountManagerID',
  'getAllCustomerObjects',
  'getAllCustomerObjects2',
  'getAvailableAccountIDList',
  'getAvailablePaymentMethodList',
  'getAvailableWorkflows',
  'getCreatedByResourceID',
  'getCurrency',
  'getCustomerObject',
  'getDateOfInitialContact',
  'getDossier',
  'getEmail',
  'getExternalID',
  'getFax',
  'getFormOfAddress',
  'getFullName',
  'getMobilePhone',
  'getName1',
  'getName2',
  'getOpening',
  'getPaymentInformation',
  'getPaymentMethodDescription',
  'getPhone',
  'getProjectManagerID',
  'getSkypeID',
  'getSourceOfContact',
  'getStatus',
  'getWebsite',
  'insert',
  'insert2',
  'registerCallback_Notify',
  'registerCallback_Observer',
  'search',
  'seekByExternalID',
  'setAcademicTitle',
  'setAccountManagerID',
  'setDateOfInitialContact',
  'setDossier',
  'setEmail',
  'setExternalID',
  'setFax',
  'setFormOfAddress',
  'setMobilePhone',
  'setName1',
  'setName2',
  'setOpening',
  'setPaymentInformation',
  'setPhone',
  'setProjectManagerID',
  'setSkypeID',
  'setSourceOfContact',
  'setStatus',
  'setWebsite',
  'update',
];

/** Pretty label for the Operations dropdown */
function labelize(op: string): string {
  if (op.includes('_')) return op.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return op.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/\b\w/g, (m) => m.toUpperCase());
}

const operationOptions: INodePropertyOptions[] = OPS.map((op) => ({
  name: labelize(op),
  value: op,
  action: labelize(op),
  description: `Call ${op} on ${RESOURCE}`,
}));

/**
 * Generic extra properties usable by all DataCustomer30 operations.
 * - UseStoredSession/UUID: same convenience as PlunetAPI.
 * - Params (JSON): a JSON object of extra elements to include under <api:OPERATION>.
 * - Raw XML (advanced): raw children XML inserted as-is (for nested structures).
 */
const extraProperties: INodeProperties[] = [
  {
    displayName: 'Use Stored Session',
    name: 'useStoredSession',
    type: 'boolean',
    default: true,
    description:
      'Use workflow-stored UUID or auto-login if none is stored. Disable to provide a UUID manually.',
    displayOptions: { show: { resource: [RESOURCE] } },
  },
  {
    displayName: 'UUID',
    name: 'uuid',
    type: 'string',
    default: '',
    description: 'Session UUID (leave empty to use stored session when enabled)',
    displayOptions: { show: { resource: [RESOURCE] } },
  },
  {
    displayName: 'Params (JSON)',
    name: 'paramsJson',
    type: 'string',
    typeOptions: { rows: 6 },
    default: '',
    placeholder:
      '{ "customerID": 123, "Status": 2 }   // For nested: { "CustomerIN": { "name1": "Acme", ... } }',
    description:
      'Key-value object converted into child XML elements of the SOAP operation. Use exact element names (case-sensitive) like "customerID", "Status", "CustomerIN". Arrays repeat elements.',
    displayOptions: { show: { resource: [RESOURCE] } },
  },
  {
    displayName: 'Raw XML (advanced)',
    name: 'rawXml',
    type: 'string',
    typeOptions: { rows: 6 },
    default: '',
    placeholder:
      '<customerID>123</customerID>\n<Status>2</Status>\n<SearchFilter>...</SearchFilter>',
    description:
      'Raw XML snippet inserted verbatim inside <api:OPERATION>. Useful for complex nested inputs like CustomerIN, SearchFilter, paymentInfo.',
    displayOptions: { show: { resource: [RESOURCE] } },
  },
];

/** JSON → XML helper (very small, enough for SOAP child elements) */
function jsonToXml(value: unknown, key?: string): string {
  if (value === null || value === undefined) return key ? `<${key}/>` : '';
  if (Array.isArray(value)) {
    // Repeat same element name for array items
    return value.map((v) => jsonToXml(v, key)).join('');
  }
  switch (typeof value) {
    case 'object': {
      const obj = value as Record<string, unknown>;
      if (!key) {
        // top-level object → concatenate children
        return Object.entries(obj)
          .map(([k, v]) => jsonToXml(v, k))
          .join('');
      }
      // <key>...</key> with nested children
      const inner = Object.entries(obj)
        .map(([k, v]) => jsonToXml(v, k))
        .join('');
      return `<${key}>${inner}</${key}>`;
    }
    case 'boolean':
    case 'number':
    case 'bigint':
      return key ? `<${key}>${String(value)}</${key}>` : String(value);
    default: {
      const s = String(value);
      return key ? `<${key}>${escapeXml(s)}</${key}>` : escapeXml(s);
    }
  }
}

/** Build the inner children for the <api:OPERATION> element */
function buildChildrenXml(uuid: string, paramsObj: unknown, rawXml: string): string {
  const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];

  // Append JSON-driven fields
  if (typeof paramsObj === 'object' && paramsObj !== null) {
    parts.push(jsonToXml(paramsObj));
  }

  // Append raw XML after JSON (raw wins if conflicting)
  if (rawXml && rawXml.trim().length > 0) {
    parts.push(rawXml.trim());
  }
  return parts.join('\n');
}

/** Build a SOAP 1.1 envelope for an operation with given children */
function buildEnvelope(op: string, childrenXml: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:api="http://API.Integration/">
  <soapenv:Header/>
  <soapenv:Body>
    <api:${op}>
${childrenXml.split('\n').map((l) => (l ? '      ' + l : l)).join('\n')}
    </api:${op}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function runGenericOp(
  ctx: IExecuteFunctions,
  creds: Creds,
  url: string,
  baseUrl: string,
  timeoutMs: number,
  itemIndex: number,
  op: string,
): Promise<IDataObject> {
  // UUID handling
  const useStored = ctx.getNodeParameter('useStoredSession', itemIndex, true) as boolean;
  let uuid = (ctx.getNodeParameter('uuid', itemIndex, '') as string).trim();
  if (useStored && !uuid) {
    uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);
  }

  // Params JSON (optional)
  const paramsJson = (ctx.getNodeParameter('paramsJson', itemIndex, '') as string).trim();
  let paramsObj: unknown = undefined;
  if (paramsJson) {
    try {
      paramsObj = JSON.parse(paramsJson);
    } catch {
      throw new Error('Params (JSON) is not valid JSON.');
    }
  }

  // Raw XML (optional)
  const rawXml = (ctx.getNodeParameter('rawXml', itemIndex, '') as string).trim();

  const children = buildChildrenXml(uuid, paramsObj, rawXml);
  const env11 = buildEnvelope(op, children);
  const soapAction = `http://API.Integration/${op}`;

  const body = await sendSoapWithFallback(ctx, url, env11, soapAction, timeoutMs);

  const statusMessage = extractStatusMessage(body);
  const result: IDataObject = {
    operation: op,
    rawResponse: body,
  };
  if (statusMessage) result.statusMessage = statusMessage;
  return result;
}

export const DataCustomer30Service: Service = {
  resource: RESOURCE,
  resourceDisplayName: 'Customers (DataCustomer30)',
  resourceDescription: 'Customer-related endpoints',
  endpoint: 'DataCustomer30',
  operationOptions,
  extraProperties,
  async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
    // All 59 operations handled through the same generic path.
    // Supply any required parameters via "Params (JSON)" or "Raw XML".
    if (OPS.includes(operation)) {
      return runGenericOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation);
    }
    throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
  },
};
