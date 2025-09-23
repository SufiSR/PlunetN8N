// nodes/Plunet/services/dataJob30.actions.ts
// Job Actions - Core job operations

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
import { parseJobResult, parseJobListResult } from '../core/parsers/job';
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

const RESOURCE = 'DataJob30Actions';
const ENDPOINT = 'DataJob30';
const RESOURCE_DISPLAY_NAME = 'Job Actions';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    getJob: {
        soapAction: 'getJob_ForView',
        endpoint: ENDPOINT,
        uiName: 'Get Job',
        subtitleName: 'get job: job',
        titleName: 'Get Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get a single job by ID',
        returnType: 'Job',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    getJobsbyID: {
        soapAction: 'getJobList_ForView',
        endpoint: ENDPOINT,
        uiName: 'Get Jobs by ID',
        subtitleName: 'get jobs by id: job',
        titleName: 'Get Jobs by ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get multiple jobs by their IDs (semicolon-separated list)',
        returnType: 'JobList',
        paramOrder: ['jobIDList', 'projectType'],
        active: true,
    },
    getJobsForItem: {
        soapAction: 'getJobListOfItem_ForView',
        endpoint: ENDPOINT,
        uiName: 'Get Jobs for Item',
        subtitleName: 'get jobs for item: job',
        titleName: 'Get Jobs for Item',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get all jobs for a specific item',
        returnType: 'JobList',
        paramOrder: ['itemID', 'projectType'],
        active: true,
    },
    createJobFromObject: {
        soapAction: 'insert3',
        endpoint: ENDPOINT,
        uiName: 'Create Job from Object',
        subtitleName: 'create job from object: job',
        titleName: 'Create Job from Object',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new job with detailed object structure',
        returnType: 'Void',
        paramOrder: ['projectID', 'projectType', 'jobTypeShort'],
        active: true,
    },
    updateJob: {
        soapAction: 'update',
        endpoint: ENDPOINT,
        uiName: 'Update Job',
        subtitleName: 'update job: job',
        titleName: 'Update Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update an existing job',
        returnType: 'Void',
        paramOrder: ['jobID'],
        active: true,
    },
    deleteJob: {
        soapAction: 'deleteJob',
        endpoint: ENDPOINT,
        uiName: 'Delete Job',
        subtitleName: 'delete job: job',
        titleName: 'Delete Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Delete a job',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    runAutomaticJob: {
        soapAction: 'runAutomaticJob',
        endpoint: ENDPOINT,
        uiName: 'Run Automatic Job',
        subtitleName: 'run automatic job: job',
        titleName: 'Run Automatic Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Run an automatic job process',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    getItemIndependentJobs: {
        soapAction: 'getItemIndependentJobs',
        endpoint: ENDPOINT,
        uiName: 'Get Item Independent Jobs',
        subtitleName: 'get item independent jobs: job',
        titleName: 'Get Item Independent Jobs',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get jobs that are not dependent on items',
        returnType: 'JobList',
        paramOrder: ['projectType'],
        active: true,
    },
};

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

export const DataJob30ActionsService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core job operations for creating, updating, and managing jobs',
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
                    case 'getJob':
                        return parseJobResult(xml);
                    case 'getJobsbyID':
                    case 'getJobsForItem':
                    case 'getItemIndependentJobs':
                        return parseJobListResult(xml);
                    case 'createJobFromObject':
                    case 'updateJob':
                    case 'deleteJob':
                    case 'runAutomaticJob':
                        return parseVoidResult(xml);
                    default:
                        throw new Error(`Unknown operation: ${op}`);
                }
            }
        );

        return executeStandardService(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex, paramOrder, config);
    },
};
