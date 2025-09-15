import { IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError } from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { escapeXml, sendSoapWithFallback } from '../core/soap';
import { ensureSession } from '../core/session';
import {
    extractResultBase,
    extractStatusMessage,
    parseStringResult,
    parseIntegerResult,
    parseIntegerArrayResult,
    parseVoidResult,
} from '../core/xml';
import {
    parseCustomerResult,
    parseCustomerListResult,
    parsePaymentInfoResult,
    parseAccountResult,
    parseWorkflowListResult,
} from '../core/parsers';

const RESOURCE = 'DataCustomer30';

/** Arguments per operation (UUID injected automatically; register/deregister excluded) */
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
    getPaymentMethodDescription: ['paymentMethodID', 'systemLanguageCode'],
    getPhone: ['customerID'],
    getProjectManagerID: ['customerID'],
    getSkypeID: ['customerID'],
    getSourceOfContact: ['customerID'],
    getStatus: ['customerID'],
    getWebsite: ['customerID'],
    insert: [],
    insert2: [
        'academicTitle', 'costCenter', 'currency', 'customerID', 'email',
        'externalID', 'fax', 'formOfAddress', 'fullName', 'mobilePhone',
        'name1', 'name2', 'opening', 'phone', 'skypeID', 'status', 'userId', 'website',
    ],
    update: [
        'academicTitle', 'costCenter', 'currency', 'customerID', 'email',
        'externalID', 'fax', 'formOfAddress', 'fullName',
        'mobilePhone', 'name1', 'name2', 'opening', 'phone', 'skypeID',
        'status', 'userId', 'website', 'enableNullOrEmptyValues',
    ],
    search: ['SearchFilter'], // XML filter or criteria string
    seekByExternalID: ['ExternalID'],
    setAcademicTitle: ['customerID', 'academicTitle'],
    setAccountManagerID: ['customerID', 'resourceID'],
    setDateOfInitialContact: ['customerID', 'dateInitialContact'],
    setDossier: ['customerID', 'dossier'],
    setEmail: ['customerID', 'EMail'],
    setExternalID: ['customerID', 'ExternalID'],
    setFax: ['customerID', 'Fax'],
    setFormOfAddress: ['FormOfAddress', 'customerID'],
    setMobilePhone: ['PhoneNumber', 'customerID'],
    setName1: ['Name', 'customerID'],
    setName2: ['Name', 'customerID'],
    setOpening: ['Opening', 'customerID'],
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

/** Return shapes so we know which parser to apply */
type R =
    | 'Void' | 'String' | 'Integer' | 'IntegerArray'
    | 'Customer' | 'CustomerList' | 'PaymentInfo' | 'Account' | 'WorkflowList';

const RETURN_TYPE: Record<string, R> = {
    delete: 'Void',
    getAcademicTitle: 'String',
    getAccount: 'Account',
    getAccountManagerID: 'Integer',
    getAllCustomerObjects: 'CustomerList',
    getAllCustomerObjects2: 'CustomerList',
    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getAvailableWorkflows: 'WorkflowList',
    getCreatedByResourceID: 'Integer',
    getCurrency: 'String',
    getCustomerObject: 'Customer',
    getDateOfInitialContact: 'String',
    getDossier: 'String',
    getEmail: 'String',
    getExternalID: 'String',
    getFax: 'String',
    getFormOfAddress: 'Integer',
    getFullName: 'String',
    getMobilePhone: 'String',
    getName1: 'String',
    getName2: 'String',
    getOpening: 'String',
    getPaymentInformation: 'PaymentInfo',
    getPaymentMethodDescription: 'String',
    getPhone: 'String',
    getProjectManagerID: 'Integer',
    getSkypeID: 'String',
    getSourceOfContact: 'String',
    getStatus: 'Integer',
    getWebsite: 'String',
    insert: 'Integer',
    insert2: 'Integer',
    update: 'Void',
    search: 'IntegerArray',
    seekByExternalID: 'Integer',
    setAcademicTitle: 'Void',
    setAccountManagerID: 'Void',
    setDateOfInitialContact: 'Void',
    setDossier: 'Void',
    setEmail: 'Void',
    setExternalID: 'Void',
    setFax: 'Void',
    setFormOfAddress: 'Void',
    setMobilePhone: 'Void',
    setName1: 'Void',
    setName2: 'Void',
    setOpening: 'Void',
    setPaymentInformation: 'Void',
    setPhone: 'Void',
    setProjectManagerID: 'Void',
    setSkypeID: 'Void',
    setSourceOfContact: 'Void',
    setStatus: 'Void',
    setWebsite: 'Void',
};

/** -------- UI wiring -------- */
function labelize(op: string): string {
    if (op.includes('_')) return op.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    return op.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/\b\w/g, (m) => m.toUpperCase());
}
function asNonEmpty<T>(arr: T[], err = 'Expected non-empty array'): [T, ...T[]] {
    if (arr.length === 0) throw new Error(err);
    return arr as [T, ...T[]];
}

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    Object.keys(PARAM_ORDER).sort().map((op) => ({
        name: labelize(op),
        value: op,
        action: labelize(op),
        description: `Call ${op} on ${RESOURCE}`,
    })),
);

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

/** -------- SOAP + dispatch -------- */
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
    // UUID is always pulled from storage / auto-login
    const uuid = await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);

    const parts: string[] = [`<UUID>${escapeXml(uuid)}</UUID>`];
    for (const name of paramNames) {
        const valRaw = ctx.getNodeParameter(name, itemIndex, '') as string;
        const val = typeof valRaw === 'string' ? valRaw.trim() : String(valRaw ?? '');
        if (val !== '') parts.push(`<${name}>${escapeXml(val)}</${name}>`);
    }

    const env11 = buildEnvelope(op, parts.join('\n'));
    const soapAction = `http://API.Integration/${op}`;
    const body = await sendSoapWithFallback(ctx, url, env11, soapAction, timeoutMs);

    /** Enforce rule: any non-"OK" statusMessage is a hard error */
    const base = extractResultBase(body);
    if (base.statusMessage && base.statusMessage !== 'OK') {
        throw new NodeOperationError(
            ctx.getNode(),
            `Plunet error (${op}): ${base.statusMessage}${base.statusCode !== undefined ? ` [${base.statusCode}]` : ''}`,
            { itemIndex },
        );
    }

    // Dispatch to proper parser
    const rt = RETURN_TYPE[op] as R | undefined;
    let payload: IDataObject;

    switch (rt) {
        case 'Customer': {
            const r = parseCustomerResult(body);
            payload = { customer: r.customer, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'CustomerList': {
            const r = parseCustomerListResult(body);
            payload = { customers: r.customers, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'PaymentInfo': {
            const r = parsePaymentInfoResult(body);
            payload = { paymentInfo: r.paymentInfo, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Account': {
            const r = parseAccountResult(body);
            payload = { account: r.account, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'WorkflowList': {
            const r = parseWorkflowListResult(body);
            payload = { workflows: r.workflows, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'String': {
            const r = parseStringResult(body);
            payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Integer': {
            const r = parseIntegerResult(body);
            payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'IntegerArray': {
            const r = parseIntegerArrayResult(body);
            payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        case 'Void': {
            const r = parseVoidResult(body);
            payload = { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
        }
        default: {
            // Fallback: still return something useful
            payload = { statusMessage: extractStatusMessage(body), rawResponse: body };
        }
    }

    return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
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
