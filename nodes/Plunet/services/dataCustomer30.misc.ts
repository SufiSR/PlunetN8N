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
import { parseCustomerResult, parseCustomerListResult } from '../core/parsers/customer';
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
    createStringProperty,
    createOptionsProperty,
    handleVoidResult,
} from '../core/service-utils';

const RESOURCE = 'DataCustomer30Misc';
const ENDPOINT = 'DataCustomer30';

/** ─ Ops kept here: everything except the five "core" ones ─ */
const PARAM_ORDER: Record<string, string[]> = {
    // finders/lists
    seekByExternalID: ['ExternalID'],
    getAllCustomerObjects: ['Status'],
    getAllCustomerObjects2: ['StatusList'], // Takes array of status values
    getAvailableAccountIDList: [],
    getAvailablePaymentMethodList: [],
    getAvailableWorkflows: ['customerID'],
    getAccount: ['AccountID'],
    getPaymentInformation: ['customerID'],
    getPaymentMethodDescription: ['paymentMethodID', 'systemLanguageCode'],
    getCreatedByResourceID: ['customerID'],
    getProjectManagerID: ['customerID'],
    getSourceOfContact: ['customerID'],
    getDateOfInitialContact: ['customerID'],
    getDossier: ['customerID'],

    // setters
    setPaymentInformation: [
        'customerID','accountHolder','accountID','BIC','contractNumber',
        'debitAccount','IBAN','paymentMethodID','preselectedTaxID','salesTaxID',
    ],
    setProjectManagerID: ['resourceID', 'customerID'],
    setSourceOfContact: ['sourceOfContact', 'customerID'],
    setDateOfInitialContact: ['dateInitialContact', 'customerID'],
    setDossier: ['dossier', 'customerID'],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Customer'|'CustomerList'|'PaymentInfo'|'Account'|'WorkflowList';
const RETURN_TYPE: Record<string, R> = {
    seekByExternalID: 'Integer',
    getAllCustomerObjects: 'CustomerList',
    getAllCustomerObjects2: 'CustomerList',
    getAvailableAccountIDList: 'IntegerArray',
    getAvailablePaymentMethodList: 'IntegerArray',
    getAvailableWorkflows: 'WorkflowList',
    getAccount: 'Account',
    getPaymentInformation: 'PaymentInfo',
    getPaymentMethodDescription: 'String',
    getCreatedByResourceID: 'Integer',
    getProjectManagerID: 'Integer',
    getSourceOfContact: 'String',
    getDateOfInitialContact: 'String',
    getDossier: 'String',
    setPaymentInformation: 'Void',
    setProjectManagerID: 'Void',
    setSourceOfContact: 'Void',
    setDateOfInitialContact: 'Void',
    setDossier: 'Void',
};

/** ─ UI ─ */
const FRIENDLY_LABEL: Record<string,string> = {
    seekByExternalID: 'Search by External ID',
    getAllCustomerObjects: 'Get All Customers (By Status)',
    getAllCustomerObjects2: 'Get All Customers (By Status List)',
    getAvailableAccountIDList: 'Get Available Account IDs',
    getAvailablePaymentMethodList: 'Get Available Payment Methods',
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromParams(
    PARAM_ORDER,
    FRIENDLY_LABEL,
    ENDPOINT,
);

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
                    payload = { customer: r.customer, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'CustomerList': {
                    const r = parseCustomerListResult(xml);
                    payload = { customers: r.customers, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
        (op: string, itemParams: IDataObject, sessionId: string) => {
            if (op === 'getAllCustomerObjects2') {
                // Handle StatusList parameter
                const statusList = itemParams.StatusList as any;
                let statusListXml = '<StatusList>';
                if (statusList && statusList.statusValues && Array.isArray(statusList.statusValues)) {
                    for (const statusItem of statusList.statusValues) {
                        if (statusItem.status !== undefined) {
                            statusListXml += `<int>${escapeXml(String(statusItem.status))}</int>`;
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
    resourceDisplayName: 'Customers (Fields/Misc)',
    resourceDescription: 'Non-core operations for DataCustomer30',
    endpoint: ENDPOINT,
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