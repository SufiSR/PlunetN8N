import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { labelize, asNonEmpty } from '../core/utils';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import {
    extractResultBase, extractStatusMessage, extractSoapFault,
    parseStringResult, parseIntegerResult, parseIntegerArrayResult, parseVoidResult,
} from '../core/xml';
import { parseResourceResult, parseResourceListResult } from '../core/parsers/resource';
import { parsePricelistListResult } from '../core/parsers/pricelist';
import { parsePaymentInfoResult } from '../core/parsers/account';

import { ResourceStatusOptions, idToResourceStatusName } from '../enums/resource-status';
import { ResourceTypeOptions, idToResourceTypeName } from '../enums/resource-type';
import { FormOfAddressOptions, idToFormOfAddressName } from '../enums/form-of-address';
import { TaxTypeOptions, idToTaxTypeName } from '../enums/tax-type';
import { WorkingStatusOptions } from '../enums/working-status';
import {
    toSoapParamValue,
    escapeXml,
    createStandardExecuteConfig,
    executeStandardService,
    generateOperationOptionsFromParams,
    createStringProperty,
    createOptionsProperty,
    handleVoidResult,
} from '../core/service-utils';

const RESOURCE = 'DataResource30Misc';
const ENDPOINT = 'DataResource30';

/** Operations → parameters */
const PARAM_ORDER: Record<string,string[]> = {
    // search / lookups
    seekByExternalID: ['ExternalID'],
    getAllResourceObjects: ['WorkingStatus','Status'],

    // pricelists
    getPricelists: ['resourceID'],
    getPricelists2: ['sourcelanguage','targetlanguage','resourceID'],

    // payment info
    getPaymentInformation: ['resourceID'],
    setPaymentInformation: [
        'resourceID','accountHolder','accountID','BIC','contractNumber',
        'debitAccount','IBAN','paymentMethodID','preselectedTaxID','salesTaxID',
    ],
    getAvailableAccountIDList: [],
    getAvailablePaymentMethodList: [],
    getPaymentMethodDescription: ['paymentMethodID','systemLanguageCode'],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Resource'|'ResourceList'|'PricelistList'|'PaymentInfo';
const RETURN_TYPE: Record<string,R> = {
    seekByExternalID: 'Integer',
    getAllResourceObjects: 'ResourceList',
    getPricelists: 'PricelistList',
    getPricelists2: 'PricelistList',
    getPaymentInformation: 'PaymentInfo',
    setPaymentInformation: 'Void',
    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getPaymentMethodDescription: 'String',
};

/** UI */
const FRIENDLY_LABEL: Record<string,string> = {
    seekByExternalID: 'Search by External ID',
    getAllResourceObjects: 'Get All Resources (By Status)',
    getPricelists2: 'Get Pricelists (Language Pair)',
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    Object.keys(PARAM_ORDER).sort().map((op) => {
        const label = FRIENDLY_LABEL[op] ?? labelize(op);
        return { name: label, value: op, action: label, description: `Call ${label} on ${ENDPOINT}` };
    }),
) as NonEmptyArray<INodePropertyOptions>;

// enum detectors
const isStatusParam = (p: string) => p === 'Status' || p === 'status';
const isWorkingStatusParam = (p: string) => p === 'WorkingStatus' || p === 'workingStatus';
const isResourceTypeParam = (p: string) => p === 'ResourceType' || p === 'resourceType';
const isFormOfAddressParam = (p: string) => p === 'FormOfAddress' || p === 'formOfAddress';

const extraProperties: INodeProperties[] =
    Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params.map<INodeProperties>((p) => {
            if (isStatusParam(p)) {
                return {
                    displayName: 'Status',
                    name: p, type: 'options', options: ResourceStatusOptions, default: 1,
                    description: `${p} parameter for ${op} (ResourceStatus enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (isWorkingStatusParam(p)) {
                return {
                    displayName: 'Working Status',
                    name: p, type: 'options', options: WorkingStatusOptions, default: 1,
                    description: `${p} parameter for ${op} (1=INTERNAL, 2=EXTERNAL)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (isResourceTypeParam(p)) {
                return {
                    displayName: 'Resource Type',
                    name: p, type: 'options', options: ResourceTypeOptions, default: 0,
                    description: `${p} parameter for ${op} (ResourceType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (isFormOfAddressParam(p)) {
                return {
                    displayName: 'Form of Address',
                    name: p, type: 'options', options: FormOfAddressOptions, default: 3,
                    description: `${p} parameter for ${op} (FormOfAddressType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            if (p === 'preselectedTaxID') {
                return {
                    displayName: 'Preselected Tax',
                    name: p, type: 'options', options: TaxTypeOptions, default: 0,
                    description: `${p} parameter for ${op} (TaxType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            return {
                displayName: p, name: p, type: 'string', default: '',
                description: `${p} parameter for ${op}`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        }),
    );

// Common utility functions are now imported from service-utils

// Create the execution configuration
function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return {
        url,
        soapActionFor: (op: string) => `http://API.Integration/${op}`,
        paramOrder: PARAM_ORDER,
        numericBooleans: NUMERIC_BOOLEAN_PARAMS,
        getSessionId: async (ctx: IExecuteFunctions) => {
            return await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0);
        },
        buildCustomBodyXml: () => null, // No custom body building needed for misc operations
        parseResult: (xml: string, op: string) => {
            const rt = RETURN_TYPE[op] as R|undefined;
            let payload: IDataObject;

            switch (rt) {
                case 'Resource': {
                    const r = parseResourceResult(xml);
                    payload = { resource: r.resource, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'ResourceList': {
                    const r = parseResourceListResult(xml);
                    payload = { resources: r.resources, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PricelistList': {
                    const r = parsePricelistListResult(xml);
                    payload = { pricelists: r.pricelists, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PaymentInfo': {
                    const r = parsePaymentInfoResult(xml);
                    const idNum = r.paymentInfo?.preselectedTaxID != null ? Number(r.paymentInfo.preselectedTaxID) : undefined;
                    const taxName = Number.isFinite(idNum as number) ? idToTaxTypeName(idNum as number) : undefined;
                    const paymentInfo = r.paymentInfo ? { ...r.paymentInfo, ...(taxName ? { preselectedTaxName: taxName } : {}) } : undefined;
                    payload = { paymentInfo, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'String': {
                    const r = parseStringResult(xml);
                    payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Integer': {
                    const r = parseIntegerResult(xml);
                    if (op === 'getStatus') {
                        payload = { statusId: r.value ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    } else if (op === 'getWorkingStatus') {
                        const name = r.value === 1 ? 'INTERNAL' : r.value === 2 ? 'EXTERNAL' : undefined;
                        payload = { workingStatusId: r.value ?? null, workingStatus: name ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    } else if (op === 'getResourceType') {
                        const name = idToResourceTypeName(r.value ?? undefined);
                        payload = { resourceTypeId: r.value ?? null, resourceType: name ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    } else if (op === 'getFormOfAddress') {
                        const name = idToFormOfAddressName(r.value ?? undefined);
                        payload = { formOfAddressId: r.value ?? null, formOfAddress: name ?? null, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    } else {
                        payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    }
                    break;
                }
                case 'IntegerArray': {
                    const r = parseIntegerArrayResult(xml);
                    payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Void': {
                    const r = parseVoidResult(xml);
                    if (!r.ok) {
                        const msg = r.statusMessage || 'Operation failed';
                        throw new NodeOperationError({} as any, `${op}: ${msg}${r.statusCode!==undefined?` [${r.statusCode}]`:''}`, { itemIndex: 0 });
                    }
                    payload = { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                default: {
                    payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
                }
            }
            return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
        },
    };
}

/** Service export */
export const DataResource30MiscService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Resources (Fields/Misc)',
    resourceDescription: 'Non-core operations for DataResource30',
    endpoint: ENDPOINT,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramNames = PARAM_ORDER[operation];
        if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);

        const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
        
        // Get parameters from the context
        const itemParams: IDataObject = {};
        for (const paramName of paramNames) {
            itemParams[paramName] = ctx.getNodeParameter(paramName, itemIndex, '');
        }

        const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
        // Ensure we return a single IDataObject, not an array
        return Array.isArray(result) ? result[0] || {} : result;
    },
};