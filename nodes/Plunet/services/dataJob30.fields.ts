// nodes/Plunet/services/dataJob30.fields.ts
// Job Fields - Field operations for jobs

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
    parseStringResult,
    parseDateResult,
} from '../core/xml';
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

const RESOURCE = 'DataJob30Fields';
const ENDPOINT = 'DataJob30';
const RESOURCE_DISPLAY_NAME = 'Job Fields';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    setJobStatus: {
        soapAction: 'setJobStatus',
        endpoint: ENDPOINT,
        uiName: 'Update Job Status',
        subtitleName: 'update status: job',
        titleName: 'Update Job Status',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update the status of a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'status'],
        active: true,
    },
    getComment: {
        soapAction: 'getComment',
        endpoint: ENDPOINT,
        uiName: 'Get Comment',
        subtitleName: 'get comment: job',
        titleName: 'Get Comment',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get comment for a job',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setComment: {
        soapAction: 'setComment',
        endpoint: ENDPOINT,
        uiName: 'Update Comment',
        subtitleName: 'update comment: job',
        titleName: 'Update Comment',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update comment for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'comment'],
        active: true,
    },
    getDescription: {
        soapAction: 'getDescription',
        endpoint: ENDPOINT,
        uiName: 'Get Description',
        subtitleName: 'get description: job',
        titleName: 'Get Description',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get description for a job',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setDescription: {
        soapAction: 'setDescription',
        endpoint: ENDPOINT,
        uiName: 'Update Description',
        subtitleName: 'update description: job',
        titleName: 'Update Description',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update description for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'description'],
        active: true,
    },
    getDueDate: {
        soapAction: 'getDueDate',
        endpoint: ENDPOINT,
        uiName: 'Get Due Date',
        subtitleName: 'get due date: job',
        titleName: 'Get Due Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get due date for a job',
        returnType: 'Date',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setDueDate: {
        soapAction: 'setDueDate',
        endpoint: ENDPOINT,
        uiName: 'Update Due Date',
        subtitleName: 'update due date: job',
        titleName: 'Update Due Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update due date for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'dueDate', 'jobID'],
        active: true,
    },
    getDeliveryDate: {
        soapAction: 'getDeliveryDate',
        endpoint: ENDPOINT,
        uiName: 'Get Delivery Date',
        subtitleName: 'get delivery date: job',
        titleName: 'Get Delivery Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get delivery date for a job',
        returnType: 'Date',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getCreationDate: {
        soapAction: 'getCreationDate',
        endpoint: ENDPOINT,
        uiName: 'Get Creation Date',
        subtitleName: 'get creation date: job',
        titleName: 'Get Creation Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get creation date for a job',
        returnType: 'Date',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getJobNumber: {
        soapAction: 'getJobNumber',
        endpoint: ENDPOINT,
        uiName: 'Get Job Number',
        subtitleName: 'get job number: job',
        titleName: 'Get Job Number',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get job number for a job',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getCurrency: {
        soapAction: 'getCurrency',
        endpoint: ENDPOINT,
        uiName: 'Get Currency',
        subtitleName: 'get currency: job',
        titleName: 'Get Currency',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get currency for a job',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getResourceId: {
        soapAction: 'getResourceID',
        endpoint: ENDPOINT,
        uiName: 'Get Resource ID',
        subtitleName: 'get resource id: job',
        titleName: 'Get Resource ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get resource ID for a job',
        returnType: 'Integer',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setResourceId: {
        soapAction: 'setResourceID',
        endpoint: ENDPOINT,
        uiName: 'Update Resource ID',
        subtitleName: 'update resource id: job',
        titleName: 'Update Resource ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update resource ID for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'resourceID', 'jobID'],
        active: true,
    },
    getContactPersonId: {
        soapAction: 'getContactPersonID',
        endpoint: ENDPOINT,
        uiName: 'Get Contact Person ID',
        subtitleName: 'get contact person id: job',
        titleName: 'Get Contact Person ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get contact person ID for a job',
        returnType: 'Integer',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setContactPersonId: {
        soapAction: 'setContactPersonID',
        endpoint: ENDPOINT,
        uiName: 'Update Contact Person ID',
        subtitleName: 'update contact person id: job',
        titleName: 'Update Contact Person ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update contact person ID for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'resourceID'],
        active: true,
    },
    getResourceContactPersonId: {
        soapAction: 'getResourceContactPersonID',
        endpoint: ENDPOINT,
        uiName: 'Get Resource Contact Person ID',
        subtitleName: 'get resource contact person id: job',
        titleName: 'Get Resource Contact Person ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get resource contact person ID for a job',
        returnType: 'Integer',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setResourceContactPersonId: {
        soapAction: 'setResourceContactPersonID',
        endpoint: ENDPOINT,
        uiName: 'Update Resource Contact Person ID',
        subtitleName: 'update resource contact person id: job',
        titleName: 'Update Resource Contact Person ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update resource contact person ID for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'contactID'],
        active: true,
    },
    getDeliveryNote: {
        soapAction: 'getDeliveryNote',
        endpoint: ENDPOINT,
        uiName: 'Get Delivery Note',
        subtitleName: 'get delivery note: job',
        titleName: 'Get Delivery Note',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get delivery note for a job',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setDeliveryNote: {
        soapAction: 'setDeliveryNote',
        endpoint: ENDPOINT,
        uiName: 'Update Delivery Note',
        subtitleName: 'update delivery note: job',
        titleName: 'Update Delivery Note',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update delivery note for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'note'],
        active: true,
    },
    getPayableId: {
        soapAction: 'getPayableID',
        endpoint: ENDPOINT,
        uiName: 'Get Payable ID',
        subtitleName: 'get payable id: job',
        titleName: 'Get Payable ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get payable ID for a job',
        returnType: 'Integer',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getJobTypeLongName: {
        soapAction: 'getJobType_LongName',
        endpoint: ENDPOINT,
        uiName: 'Get Job Type Long Name',
        subtitleName: 'get job type long name: job',
        titleName: 'Get Job Type Long Name',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get long name for job type',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getJobTypeShortName: {
        soapAction: 'getJobType_ShortName',
        endpoint: ENDPOINT,
        uiName: 'Get Job Type Short Name',
        subtitleName: 'get job type short name: job',
        titleName: 'Get Job Type Short Name',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get short name for job type',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setItemId: {
        soapAction: 'setItemID',
        endpoint: ENDPOINT,
        uiName: 'Update Item ID for Job',
        subtitleName: 'update item id: job',
        titleName: 'Update Item ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update item ID for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'itemID', 'jobID'],
        active: true,
    },
    setStartDate: {
        soapAction: 'setStartDate',
        endpoint: ENDPOINT,
        uiName: 'Update Start Date',
        subtitleName: 'update start date: job',
        titleName: 'Update Start Date',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update start date for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'startDate', 'jobID'],
        active: true,
    },
    setCatReport2: {
        soapAction: 'setCatReport2',
        endpoint: ENDPOINT,
        uiName: 'Update CAT Report',
        subtitleName: 'update cat report: job',
        titleName: 'Update CAT Report',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update CAT report for a job',
        returnType: 'Void',
        paramOrder: ['pathOrUrl', 'overwriteExistingPriceLines', 'catType', 'projectType', 'analyzeAndCopyResultToJob', 'jobID', 'Filesize'],
        active: true,
    },
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

// Helper functions for field type detection
const isProjectTypeParam = (p: string) => p === 'projectType';
const isNumericParam = (op: string, p: string) => {
    const numericParams = ['jobID', 'projectID', 'itemID', 'projectType', 'resourceID', 'contactID', 'Filesize'];
    return numericParams.includes(p);
};
const isDateParam = (p: string) => 
    p === 'startDate' || p === 'dueDate' || p === 'deliveryDate' || p === 'endDate' || p === 'dateInitialContact';

// Enhanced properties for field operations
const extraProperties: INodeProperties[] = [
    
    // Standard properties for all operations
    ...Object.entries(OPERATION_REGISTRY).flatMap(([op, meta]) => {
        return meta.paramOrder.map<INodeProperties>((p) => {
            // projectType → dropdown everywhere it appears
            if (isProjectTypeParam(p)) {
                return {
                    displayName: 'Project Type',
                    name: p,
                    type: 'options',
                    options: ProjectTypeOptions,
                    default: 3, // ORDER
                    description: `${p} parameter for ${op} (ProjectType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // numeric params (IDs) → number
            if (isNumericParam(op, p)) {
                return {
                    displayName: p,
                    name: p,
                    type: 'number',
                    default: 0,
                    typeOptions: { minValue: 0, step: 1 },
                    description: `${p} parameter for ${op} (number)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // date parameters → dateTime
            if (isDateParam(p)) {
                return {
                    displayName: p,
                    name: p,
                    type: 'dateTime',
                    default: '',
                    description: `${p} parameter for ${op} (date)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // languageCode → string with default 'EN'
            if (p === 'languageCode') {
                return {
                    displayName: 'Language Code',
                    name: p,
                    type: 'string',
                    default: 'EN',
                    description: `${p} parameter for ${op} (defaults to EN)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // default: plain string
            return {
                displayName: p,
                name: p,
                type: 'string',
                default: '',
                description: `${p} parameter for ${op}`,
                displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            };
        });
    }),
];

export const DataJob30FieldsService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Field operations for getting and setting job properties',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
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
                    case 'setJobStatus':
                    case 'setComment':
                    case 'setDescription':
                    case 'setDueDate':
                    case 'setResourceId':
                    case 'setContactPersonId':
                    case 'setResourceContactPersonId':
                    case 'setDeliveryNote':
                    case 'setItemId':
                    case 'setStartDate':
                    case 'setCatReport2':
                        return parseVoidResult(xml);
                    case 'getComment':
                    case 'getDescription':
                    case 'getJobNumber':
                    case 'getCurrency':
                    case 'getDeliveryNote':
                    case 'getJobTypeLongName':
                    case 'getJobTypeShortName':
                        return parseStringResult(xml);
                    case 'getResourceId':
                    case 'getContactPersonId':
                    case 'getResourceContactPersonId':
                    case 'getPayableId':
                        return parseIntegerResult(xml);
                    case 'getDueDate':
                    case 'getDeliveryDate':
                    case 'getCreationDate':
                        return parseDateResult(xml);
                    default:
                        throw new Error(`Unknown operation: ${op}`);
                }
            }
        );

        return executeStandardService(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex, paramOrder, config);
    },
};
