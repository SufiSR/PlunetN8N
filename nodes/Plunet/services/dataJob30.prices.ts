// nodes/Plunet/services/dataJob30.prices.ts
// Job Price Actions - Price-related operations, metrics, and services

import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { labelize, asNonEmpty } from '../core/utils';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import {
    extractResultBase, extractStatusMessage, extractSoapFault, parseIntegerResult, parseIntegerArrayResult, parseVoidResult,
} from '../core/xml';
import { 
    parseJobMetricResult,
    parsePriceLineListResult,
    parsePriceLineResult,
    parsePriceUnitListResult,
    parsePriceUnitResult,
    parseServicesListResult
} from '../core/parsers/job';
import { parsePricelistResult, parsePricelistListResult, parsePricelistEntryListResult } from '../core/parsers/pricelist';
import { parseStringArrayResult } from '../core/xml';
import {
    toSoapParamValue,
    escapeXml,
    createStandardExecuteConfig,
    executeStandardService,
    generateOperationOptionsFromRegistry,
    createStringProperty,
    createBooleanProperty,
    createOptionsProperty,
    createTypedProperty,
    handleVoidResult,
} from '../core/service-utils';
import {
    MANDATORY_FIELDS,
    FIELD_TYPES,
} from '../core/field-definitions';
import { ProjectTypeOptions } from '../enums/project-type';

const RESOURCE = 'DataJob30Prices';
const ENDPOINT = 'DataJob30';
const RESOURCE_DISPLAY_NAME = 'Job Prices';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    getJobMetrics: {
        soapAction: 'getJobMetrics',
        endpoint: ENDPOINT,
        uiName: 'Get Job Metrics',
        subtitleName: 'get job metrics: job',
        titleName: 'Get Job Metrics',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get metrics for a job',
        returnType: 'JobMetric',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    getPriceLines: {
        soapAction: 'getPriceLine_List',
        endpoint: ENDPOINT,
        uiName: 'Get Price Lines',
        subtitleName: 'get price lines: job',
        titleName: 'Get Price Lines',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get all price lines for a job',
        returnType: 'PriceLineList',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    getPriceLinesByCurrency: {
        soapAction: 'getPriceLine_ListByCurrencyType',
        endpoint: ENDPOINT,
        uiName: 'Get Price Lines by Currency',
        subtitleName: 'get price lines by currency: job',
        titleName: 'Get Price Lines by Currency',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get price lines filtered by currency type',
        returnType: 'PriceLineList',
        paramOrder: ['jobID', 'projectType', 'currencyType'],
        active: true,
    },
    insertPriceLine: {
        soapAction: 'insertPriceLine',
        endpoint: ENDPOINT,
        uiName: 'Create Price Line',
        subtitleName: 'create price line: job',
        titleName: 'Create Price Line',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new price line for a job',
        returnType: 'PriceLine',
        paramOrder: ['jobID', 'projectType', 'amount', 'amount_perUnit', 'priceUnitID', 'unit_price', 'taxType', 'createAsFirstItem'],
        active: true,
    },
    updatePriceLine: {
        soapAction: 'updatePriceLine',
        endpoint: ENDPOINT,
        uiName: 'Update Price Line',
        subtitleName: 'update price line: job',
        titleName: 'Update Price Line',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update an existing price line',
        returnType: 'PriceLine',
        paramOrder: ['jobID', 'projectType', 'priceLineID', 'amount', 'amount_perUnit', 'priceUnitID', 'unit_price', 'taxType'],
        active: true,
    },
    deletePriceLine: {
        soapAction: 'deletePriceLine',
        endpoint: ENDPOINT,
        uiName: 'Delete Price Line',
        subtitleName: 'delete price line: job',
        titleName: 'Delete Price Line',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Delete a price line from a job',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType', 'priceLineID'],
        active: true,
    },
    getPricelist: {
        soapAction: 'getPricelist',
        endpoint: ENDPOINT,
        uiName: 'Get Pricelist',
        subtitleName: 'get pricelist: job',
        titleName: 'Get Pricelist',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get pricelist information for a job',
        returnType: 'Pricelist',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    setPricelist: {
        soapAction: 'setPricelist',
        endpoint: ENDPOINT,
        uiName: 'Update Pricelist ID',
        subtitleName: 'update pricelistid: job',
        titleName: 'Update Pricelist ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update the pricelist ID for a job',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType', 'priceListID'],
        active: true,
    },
    getPricelists: {
        soapAction: 'getPricelist_List',
        endpoint: ENDPOINT,
        uiName: 'Get All Pricelists',
        subtitleName: 'get all pricelists: job',
        titleName: 'Get All Pricelists',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get all available pricelists',
        returnType: 'PricelistList',
        paramOrder: ['languageCode'],
        active: true,
    },
    getPricelistEntries: {
        soapAction: 'getPricelistEntry_List',
        endpoint: ENDPOINT,
        uiName: 'Get Pricelist Entries',
        subtitleName: 'get pricelist entries: job',
        titleName: 'Get Pricelist Entries',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get entries from a specific pricelist',
        returnType: 'PricelistEntryList',
        paramOrder: ['priceListID', 'languageCode'],
        active: true,
    },
    getPriceUnits: {
        soapAction: 'getPriceUnit_List',
        endpoint: ENDPOINT,
        uiName: 'Get Price Units',
        subtitleName: 'get price units: job',
        titleName: 'Get Price Units',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get all available price units',
        returnType: 'PriceUnitList',
        paramOrder: ['languageCode'],
        active: true,
    },
    getPriceUnit: {
        soapAction: 'getPriceUnit',
        endpoint: ENDPOINT,
        uiName: 'Get Price Unit',
        subtitleName: 'get price unit: job',
        titleName: 'Get Price Unit',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get a specific price unit by ID',
        returnType: 'PriceUnit',
        paramOrder: ['PriceUnitID', 'languageCode'],
        active: true,
    },
    getServices: {
        soapAction: 'getServices_List',
        endpoint: ENDPOINT,
        uiName: 'Get all available Services',
        subtitleName: 'get all available services: job',
        titleName: 'Get all available Services',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve all available services',
        returnType: 'StringArray',
        paramOrder: ['languageCode'],
        active: true,
    },
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

export const DataJob30PricesService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Price-related operations, metrics, and services for jobs',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties: [],
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const paramOrder = Object.fromEntries(
            Object.entries(OPERATION_REGISTRY).map(([op, meta]) => [op, meta.paramOrder])
        );
        
        const config: ExecuteConfig = createStandardExecuteConfig(
            creds,
            url,
            baseUrl,
            timeoutMs,
            paramOrder,
            (xml: string, op: string) => {
                switch (op) {
                    case 'getJobMetrics':
                        return parseJobMetricResult(xml);
                    case 'getPriceLines':
                    case 'getPriceLinesByCurrency':
                        return parsePriceLineListResult(xml);
                    case 'insertPriceLine':
                    case 'updatePriceLine':
                        return parsePriceLineResult(xml);
                    case 'deletePriceLine':
                    case 'setPricelist':
                        return parseVoidResult(xml);
                    case 'getPricelist':
                        return parsePricelistResult(xml);
                    case 'getPricelists':
                        return parsePricelistListResult(xml);
                    case 'getPricelistEntries':
                        return parsePricelistEntryListResult(xml);
                    case 'getPriceUnits':
                        return parsePriceUnitListResult(xml);
                    case 'getPriceUnit':
                        return parsePriceUnitResult(xml);
                    case 'getServices':
                        return parseStringArrayResult(xml);
                    default:
                        throw new Error(`Unknown operation: ${op}`);
                }
            }
        );

        return executeStandardService(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex, paramOrder, config);
    },
};
