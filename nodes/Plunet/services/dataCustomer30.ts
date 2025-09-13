import { IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { extractStatusMessage } from '../core/xml';
import { ensureSession } from '../core/session';

const RESOURCE = 'DataCustomer30';

/**
 * Argument list for each DataCustomer30 operation (UUID is always injected automatically).
 * Excludes register/deregister ops per your request.
 */
const PARAM_ORDER: Record<string, string[]> = {
  delete: ['customerID'],
  getAcademicTitle: ['customerID'],
  getAccount: ['AccountID'],
  getAccountManagerID: ['customerID'],
  getAllCustomerObjects: ['Status'],
  getAllCustomerObjects2: ['integerList'],
  getAvailableAccountIDList: [],
  getAvailablePaymentMethodList: [],
  getAvailableWorkflows: ['customerID'],
  getCreatedByResourceID: ['customerID'],
  getCurrency: ['customerID'],
  getCustomerObject: ['customerID'],
  getDateOfInitialContact: ['customerID'],
  getDossier: ['customerID'],
  getEmail: ['customerID'],
  getExternalID: ['customerID'],
  getFax: ['customerID'],
  getFormOfAddress: ['customerID'],
  getFullName: ['customerID'],
  getMobilePhone: ['customerID'],
  getName1: ['customerID'],
  getName2: ['customerID'],
  getOpening: ['customerID'],
  getPaymentInformation: ['customerID'],
  getPaymentMethodDescription: ['customerID'],
  getPhone: ['customerID'],
  getProjectManagerID: ['customerID'],
  getSkypeID: ['customerID'],
  getSourceOfContact: ['customerID'],
  getStatus: ['customerID'],
  getWebsite: ['customerID'],

  // Create / Update
  insert: [],
  insert2: [
    'academicTitle', 'costCenter', 'currency', 'customerID', 'email',
    'externalID', 'fax', 'formOfAddress', 'fullName', 'mobilePhone',
    'name1', 'name2', 'opening', 'phone', 'skypeID', 'status', 'userId', 'website',
  ],
  update: [
    'academicTitle', 'costCenter', 'currency', 'customerID', 'email',
    'externalID', 'fax', 'formOfAddress', 'fullName', 'mobilePhone',
    'name1', 'name2', 'opening', 'phone', 'skypeID', 'status', 'userId', 'website',
    'enableNullOrEmptyValues',
  ],

  // Search (kept generic per YAML; adjust names if your schema differs)
  search: [
    'avaliablePropertyValueIDList', 'mainPropertyNameEnglish', 'propertyNameEnglish',
    'propertyType', 'selectedPropertyValueID', 'selectedPropertyValueList', 'availableValues',
    'dateValue', 'flag', 'flag_MainTextModule', 'selectedValues', 'stringValue',
    'textModuleLabel', 'textModuleType',
  ],

  // Lookups & setters
  seekByExternalID: ['ExternalID'],
  setAcademicTitle: ['customerID', 'academicTitle'],
  setAccountManagerID: ['customerID', 'resourceID'],
  setDateOfInitialContact: ['customerID', 'date'],
  setDossier: ['customerID', 'dossier'],
  setEmail: ['customerID', 'Email'],
  setExternalID: ['customerID', 'ExternalID'],
  setFax: ['customerID', 'fax'],
  setFormOfAddress: ['customerID', 'formOfAddress'],
  setMobilePhone: ['customerID', 'mobilePhone'],
  setName1: ['customerID', 'name1'],
  setName2: ['customerID', 'name2'],
  setOpening: ['customerID', 'opening'],
  setPaymentInformation: [
    'customerID', 'accountHolder', 'accountID', 'BIC', 'contractNumber',
    'debitAccount', 'IBAN', 'paymentMethodID', 'preselectedTaxID', 'salesTaxID',
  ],
  setPhone: ['customerID', 'phone'],
  setProjectManagerID: ['customerID', 'resourceID'],
  setSkypeID: ['customerID', 'skypeID'],
  setSourceOfContact: ['customerID', 'sourceOfContact'],
  setStatus: ['customerID', 'status'],
  setWebsite: ['customerID', 'website'],
};

/** Label formatter for Operation dropdown */
function labelize(op: string): string {
  if (op.includes('_')) return op.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  return op.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Ensure a non-empty array at type level */
function asNonEmpty<T>(arr: T[], errMsg = 'Expected non-empty array'): [T, ...T[]] {
  if (arr.length === 0) throw new Error(errMsg);
  return arr as [T, ...T[]];
}

/** Operations list for the UI (NonEmptyArray to satisfy the Service type) */
const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
  Object.keys(PARAM_ORDER)
    .sort()
    .map((op) => ({
      name: labelize(op),
      value: op,
      action: labelize(op),
      description: `Call ${op} on ${RESOURCE}`,
    })),
  `No operations defined for ${RESOURCE}`,
);

/** Per-operation UI fields (string inputs; SOAP receives text) */
const extraProperties: INodeProperties[] = Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
  params.map<INodeProperties>((p) => ({
    displayName: p,
    name: p,
    type: 'string',
    default: '',
    description: `${p} parameter for ${op}`,
    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
  })),
);

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

async function runOp(
  ctx: IExecuteFunctions,
  creds: Creds,
  url: string,
  baseUrl: string,
  timeoutMs: number,
  itemIndex: number,
  op: string,
  paramNames: string[],
): Promise<IDataObject> {
  // ✅ Pass itemIndex (5th arg) to satisfy ensureSession signature
  const uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);

  const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];

  for (const name of paramNames) {
    const valRaw = ctx.getNodeParameter(name, itemIndex, '') as string;
    const val = typeof valRaw === 'string' ? valRaw.trim() : String(valRaw ?? '');
    if (val !== '') {
      parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }
  }

  const env11 = buildEnvelope(op, parts.join('\n'));
  const soapAction = `http://API.Integration/${op}`;

  const body = await sendSoapWithFallback(ctx, url, env11, soapAction, timeoutMs);

  const statusMessage = extractStatusMessage(body);
  const out: IDataObject = { success: true, resource: RESOURCE, operation: op, rawResponse: body };
  if (statusMessage) out.statusMessage = statusMessage;
  return out;
}

export const DataCustomer30Service: Service = {
  resource: RESOURCE,
  resourceDisplayName: 'Customers (DataCustomer30)',
  resourceDescription: 'Customer-related endpoints',
  endpoint: 'DataCustomer30',
  operationOptions,
  extraProperties,
  async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
    const paramNames = PARAM_ORDER[operation];
    if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
    return runOp(ctx, creds, url, baseUrl, timeoutMs, itemIndex, operation, paramNames);
  },
};
