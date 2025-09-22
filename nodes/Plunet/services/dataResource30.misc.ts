import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
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
    generateOperationOptionsFromRegistry,
    createStringProperty,
    createOptionsProperty,
    handleVoidResult,
} from '../core/service-utils';

const RESOURCE = 'DataResource30Misc';
const ENDPOINT = 'DataResource30';
const RESOURCE_DISPLAY_NAME = 'Resource Fields';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    seekByExternalID: {
        soapAction: 'seekByExternalID',
        endpoint: ENDPOINT,
        uiName: 'Get Many by External ID',
        subtitleName: 'get many by external id: resource fields',
        titleName: 'Get Many by External ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get many by external ID',
        returnType: 'Integer',
        paramOrder: ['ExternalID'],
        active: true,
    },
    getAllResourceObjects: {
        soapAction: 'getAllResourceObjects',
        endpoint: ENDPOINT,
        uiName: 'Get Many Resource Objects (By Status)',
        subtitleName: 'get many resource objects by status: resource fields',
        titleName: 'Get Many Resource Objects (By Status)',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get many resource objects by status',
        returnType: 'ResourceList',
        paramOrder: ['WorkingStatus','Status'],
        active: true,
    },
    getPricelists: {
        soapAction: 'getPricelists',
        endpoint: ENDPOINT,
        uiName: 'Get Pricelists',
        subtitleName: 'get pricelists: resource fields',
        titleName: 'Get Pricelists',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get pricelists for resource',
        returnType: 'PricelistList',
        paramOrder: ['resourceID'],
        active: true,
    },
    getPricelists2: {
        soapAction: 'getPricelists2',
        endpoint: ENDPOINT,
        uiName: 'Get Pricelists (by Language Pair)',
        subtitleName: 'get pricelists language pair: resource fields',
        titleName: 'Get Pricelists (by Language Pair)',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get pricelists for language pair',
        returnType: 'PricelistList',
        paramOrder: ['sourcelanguage','targetlanguage','resourceID'],
        active: true,
    },
    getPaymentInformation: {
        soapAction: 'getPaymentInformation',
        endpoint: ENDPOINT,
        uiName: 'Get Payment Information',
        subtitleName: 'get payment information: resource fields',
        titleName: 'Get Payment Information',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get payment information for resource',
        returnType: 'PaymentInfo',
        paramOrder: ['resourceID'],
        active: true,
    },
    setPaymentInformation: {
        soapAction: 'setPaymentInformation',
        endpoint: ENDPOINT,
        uiName: 'Update Payment Information',
        subtitleName: 'update payment information: resource fields',
        titleName: 'Update Payment Information',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Set payment information for resource',
        returnType: 'Void',
        paramOrder: [
            'resourceID','accountHolder','accountID','BIC','contractNumber',
            'debitAccount','IBAN','paymentMethodID','preselectedTaxID','salesTaxID',
        ],
        active: true,
    },
    getAvailableAccountIDs: {
        soapAction: 'getAvailableAccountIDList',
        endpoint: ENDPOINT,
        uiName: 'Get Available Account IDs',
        subtitleName: 'get available account ids: resource fields',
        titleName: 'Get Available Account IDs',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get list of available account IDs',
        returnType: 'IntegerArray',
        paramOrder: [],
        active: true,
    },
    getAvailablePaymentMethods: {
        soapAction: 'getAvailablePaymentMethodList',
        endpoint: ENDPOINT,
        uiName: 'Get Available Payment Methods',
        subtitleName: 'get available payment methods: resource fields',
        titleName: 'Get Available Payment Methods',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get list of available payment methods',
        returnType: 'IntegerArray',
        paramOrder: [],
        active: true,
    },
    getPaymentMethodDescription: {
        soapAction: 'getPaymentMethodDescription',
        endpoint: ENDPOINT,
        uiName: 'Get Payment Method Description',
        subtitleName: 'get payment method description: resource fields',
        titleName: 'Get Payment Method Description',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get payment method description',
        returnType: 'String',
        paramOrder: ['paymentMethodID','systemLanguageCode'],
        active: true,
    },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.paramOrder])
);

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Resource'|'ResourceList'|'PricelistList'|'PaymentInfo';
const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.returnType as R])
);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

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
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Non-core operations for DataResource30',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
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