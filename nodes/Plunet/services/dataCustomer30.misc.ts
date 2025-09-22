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
import { parseCustomerResult, parseCustomerListResult } from '../core/parsers/customer';
import { idToCustomerStatusName } from '../core/parsers/common';
import { parsePaymentInfoResult, parseAccountResult } from '../core/parsers/account';
import { parseWorkflowListResult } from '../core/parsers/workflow';
import { CustomerStatusOptions } from '../enums/customer-status';
import { TaxTypeOptions, idToTaxTypeName } from '../enums/tax-type';
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
    buildSearchFilterXml,
} from '../core/service-utils';
import { CUSTOMER_SEARCH_FILTER_FIELDS } from '../core/field-definitions';

const RESOURCE = 'DataCustomer30Misc';
const ENDPOINT = 'DataCustomer30';
const RESOURCE_DISPLAY_NAME = 'Customer Fields';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    seekByExternalID: {
        soapAction: 'seekByExternalID',
        endpoint: ENDPOINT,
        uiName: 'Get Many by External ID',
        subtitleName: 'get many by external id: customer fields',
        titleName: 'Get Many by External ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get many by external ID',
        returnType: 'Integer',
        paramOrder: ['ExternalID'],
    },
    getAllCustomersByStatus: {
        soapAction: 'getAllCustomerObjects',
        endpoint: ENDPOINT,
        uiName: 'Get Many Customer Objects (By Status)',
        subtitleName: 'get many customer objects by status: customer fields',
        titleName: 'Get Many Customer Objects (By Status)',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get many customers objects by status',
        returnType: 'CustomerList',
        paramOrder: ['Status'],
    },
    getAllCustomersByStatusList: {
        soapAction: 'getAllCustomerObjects2',
        endpoint: ENDPOINT,
        uiName: 'Get Many Customer Objects (By Status List)',
        subtitleName: 'get many customer objects by status list: customer fields',
        titleName: 'Get Many Customer Objects (By Status List)',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get many customers objects filtered by status list',
        returnType: 'CustomerList',
        paramOrder: ['StatusList'],
    },
    getAvailableAccountIDs: {
        soapAction: 'getAvailableAccountIDList',
        endpoint: ENDPOINT,
        uiName: 'Get Available Account IDs',
        subtitleName: 'get available account ids: customer fields',
        titleName: 'Get Available Account IDs',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get list of available account IDs',
        returnType: 'IntegerArray',
        paramOrder: [],
    },
    getAvailablePaymentMethods: {
        soapAction: 'getAvailablePaymentMethodList',
        endpoint: ENDPOINT,
        uiName: 'Get Available Payment Methods',
        subtitleName: 'get available payment methods: customer fields',
        titleName: 'Get Available Payment Methods',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get list of available payment methods',
        returnType: 'IntegerArray',
        paramOrder: [],
    },
    getAvailableWorkflows: {
        soapAction: 'getAvailableWorkflows',
        endpoint: ENDPOINT,
        uiName: 'Get Available Workflows',
        subtitleName: 'get available workflows: customer fields',
        titleName: 'Get Available Workflows',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get available workflows for customer',
        returnType: 'WorkflowList',
        paramOrder: ['customerID'],
    },
    getAccount: {
        soapAction: 'getAccount',
        endpoint: ENDPOINT,
        uiName: 'Get Account',
        subtitleName: 'get account: customer fields',
        titleName: 'Get Account',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get account information by account ID',
        returnType: 'Account',
        paramOrder: ['AccountID'],
    },
    getPaymentInformation: {
        soapAction: 'getPaymentInformation',
        endpoint: ENDPOINT,
        uiName: 'Get Payment Information',
        subtitleName: 'get payment information: customer fields',
        titleName: 'Get Payment Information',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get payment information for customer',
        returnType: 'PaymentInfo',
        paramOrder: ['customerID'],
    },
    getPaymentMethodDescription: {
        soapAction: 'getPaymentMethodDescription',
        endpoint: ENDPOINT,
        uiName: 'Get Payment Method Description',
        subtitleName: 'get payment method description: customer fields',
        titleName: 'Get Payment Method Description',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get payment method description',
        returnType: 'String',
        paramOrder: ['paymentMethodID', 'systemLanguageCode'],
    },
    getCreatedByResourceID: {
        soapAction: 'getCreatedByResourceID',
        endpoint: ENDPOINT,
        uiName: 'Get Created By Resource ID',
        subtitleName: 'get created by resource id: customer fields',
        titleName: 'Get Created By Resource ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get resource ID who created the customer',
        returnType: 'Integer',
        paramOrder: ['customerID'],
    },
    getProjectManagerID: {
        soapAction: 'getProjectManagerID',
        endpoint: ENDPOINT,
        uiName: 'Get Project Manager ID',
        subtitleName: 'get project manager id: customer fields',
        titleName: 'Get Project Manager ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get project manager ID for customer',
        returnType: 'Integer',
        paramOrder: ['customerID'],
    },
    getSourceOfContact: {
        soapAction: 'getSourceOfContact',
        endpoint: ENDPOINT,
        uiName: 'Get Source of Contact',
        subtitleName: 'get source of contact: customer fields',
        titleName: 'Get Source of Contact',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get source of contact for customer',
        returnType: 'String',
        paramOrder: ['customerID'],
    },
    getDateOfInitialContact: {
        soapAction: 'getDateOfInitialContact',
        endpoint: ENDPOINT,
        uiName: 'Get Date of Initial Contact',
        subtitleName: 'get date of initial contact: customer fields',
        titleName: 'Get Date of Initial Contact',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get date of initial contact for customer',
        returnType: 'String',
        paramOrder: ['customerID'],
    },
    getDossier: {
        soapAction: 'getDossier',
        endpoint: ENDPOINT,
        uiName: 'Get Dossier',
        subtitleName: 'get dossier: customer fields',
        titleName: 'Get Dossier',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get dossier information for customer',
        returnType: 'String',
        paramOrder: ['customerID'],
    },
    setPaymentInformation: {
        soapAction: 'setPaymentInformation',
        endpoint: ENDPOINT,
        uiName: 'Update Payment Information',
        subtitleName: 'update payment information: customer fields',
        titleName: 'Update Payment Information',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update payment information for customer',
        returnType: 'Void',
        paramOrder: [
        'customerID','accountHolder','accountID','BIC','contractNumber',
        'debitAccount','IBAN','paymentMethodID','preselectedTaxID','salesTaxID',
    ],
    },
    setProjectManagerID: {
        soapAction: 'setProjectManagerID',
        endpoint: ENDPOINT,
        uiName: 'Update Project Manager ID',
        subtitleName: 'update project manager id: customer fields',
        titleName: 'Update Project Manager ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update project manager ID for customer',
        returnType: 'Void',
        paramOrder: ['resourceID', 'customerID'],
    },
    setSourceOfContact: {
        soapAction: 'setSourceOfContact',
        endpoint: ENDPOINT,
        uiName: 'Update Source of Contact',
        subtitleName: 'update source of contact: customer fields',
        titleName: 'Update Source of Contact',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update source of contact for customer',
        returnType: 'Void',
        paramOrder: ['sourceOfContact', 'customerID'],
    },
    setDateOfInitialContact: {
        soapAction: 'setDateOfInitialContact',
        endpoint: ENDPOINT,
        uiName: 'Update Date of Initial Contact',
        subtitleName: 'update date of initial contact: customer fields',
        titleName: 'Update Date of Initial Contact',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update date of initial contact for customer',
        returnType: 'Void',
        paramOrder: ['dateInitialContact', 'customerID'],
    },
    setDossier: {
        soapAction: 'setDossier',
        endpoint: ENDPOINT,
        uiName: 'Update Dossier',
        subtitleName: 'update dossier: customer fields',
        titleName: 'Update Dossier',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update dossier information for customer',
        returnType: 'Void',
        paramOrder: ['dossier', 'customerID'],
    },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).map(op => [op.soapAction, op.paramOrder])
);

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Customer'|'CustomerList'|'PaymentInfo'|'Account'|'WorkflowList';
const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).map(op => [op.soapAction, op.returnType as R])
);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

const extraProperties: INodeProperties[] =
    Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params.map<INodeProperties>((p) => {
            if (p.toLowerCase() === 'status') {
                return createOptionsProperty(
                    p,
                    'Status',
                    `${p} parameter for ${op} (CustomerStatus enum)`,
                    RESOURCE,
                    op,
                    CustomerStatusOptions,
                    1,
                );
            }
            if (p === 'preselectedTaxID') {
                return createOptionsProperty(
                    p,
                    'Preselected Tax',
                    `${p} parameter for ${op} (TaxType enum)`,
                    RESOURCE,
                    op,
                    TaxTypeOptions,
                    0,
                );
            }
            if (p === 'StatusList') {
                return {
                    displayName: 'Status List',
                    name: p,
                    type: 'fixedCollection',
                    typeOptions: {
                        multipleValues: true,
                    },
                    default: {},
                    description: 'List of customer status values to filter by',
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                    options: [
                        {
                            name: 'statusValues',
                            displayName: 'Status Values',
                            values: [
                                {
                                    displayName: 'Status',
                                    name: 'status',
                                    type: 'options',
                                    options: CustomerStatusOptions,
                                    default: 1,
                                },
                            ],
                        },
                    ],
                };
            }
            return createStringProperty(
                p,
                p,
                `${p} parameter for ${op}`,
                RESOURCE,
                op,
            );
        }),
    );

// Common utility functions are now imported from service-utils

// Create the execution configuration
function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return createStandardExecuteConfig(
        creds,
        url,
        baseUrl,
        timeoutMs,
        PARAM_ORDER,
        (xml: string, op: string) => {
            const rt = RETURN_TYPE[op] as R|undefined;
            let payload: IDataObject;
            switch (rt) {
                case 'Customer': {
                    const r = parseCustomerResult(xml);
                    const customer = (r as any).customer || undefined;
                    const statusId = typeof customer?.statusId === 'number' ? customer.statusId : 
                                   typeof customer?.status === 'number' ? customer.status : undefined;
                    const statusName = idToCustomerStatusName(statusId);
                    const enrichedCustomer = customer ? {
                        ...customer,
                        ...(statusName ? { status: statusName } : {}),
                    } : undefined;
                    payload = { customer: enrichedCustomer, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'CustomerList': {
                    const r = parseCustomerListResult(xml);
                    const enrichedCustomers = r.customers?.map(customer => {
                        const statusId = typeof customer?.statusId === 'number' ? customer.statusId : 
                                       typeof customer?.status === 'number' ? customer.status : undefined;
                        const statusName = idToCustomerStatusName(statusId);
                        return {
                            ...customer,
                            ...(statusName ? { status: statusName } : {}),
                        };
                    });
                    payload = { customers: enrichedCustomers, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PaymentInfo': {
                    const r = parsePaymentInfoResult(xml);
                    // optional: add friendly name for preselectedTaxID
                    const idNum = r.paymentInfo?.preselectedTaxID != null ? Number(r.paymentInfo.preselectedTaxID) : undefined;
                    const taxName = Number.isFinite(idNum as number) ? idToTaxTypeName(idNum as number) : undefined;
                    const paymentInfo = r.paymentInfo ? { ...r.paymentInfo, ...(taxName ? { preselectedTaxName: taxName } : {}) } : undefined;
                    payload = { paymentInfo, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Account': {
                    const r = parseAccountResult(xml);
                    payload = { account: r.account, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'WorkflowList': {
                    const r = parseWorkflowListResult(xml);
                    payload = { workflows: r.workflows, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
                    payload = handleVoidResult(xml, op, parseVoidResult);
                    break;
                }
                default: {
                    payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
                }
            }
            return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
        },
        (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
            if (op === 'getAllCustomerObjects2') {
                // Handle StatusList parameter
                const statusList = itemParams.StatusList as any;
                let statusListXml = '<StatusList>';
                if (statusList && statusList.statusValues && Array.isArray(statusList.statusValues)) {
                    for (const statusItem of statusList.statusValues) {
                        if (statusItem.status !== undefined) {
                            statusListXml += `<integerList>${escapeXml(String(statusItem.status))}</integerList>`;
                        }
                    }
                }
                statusListXml += '</StatusList>';
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${statusListXml}`;
            }
            return null;
        },
    );
}

/** ─ Service export ─ */
export const DataCustomer30MiscService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Non-core operations for DataCustomer30',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
        return await executeStandardService(
            operation,
            ctx,
            creds,
            url,
            baseUrl,
            timeoutMs,
            itemIndex,
            PARAM_ORDER,
            config,
        );
    },
};