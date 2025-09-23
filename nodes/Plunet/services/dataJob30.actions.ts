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

// Helper functions for field type detection
const isProjectTypeParam = (p: string) => p === 'projectType';
const isNumericParam = (op: string, p: string) => {
    const numericParams = ['jobID', 'projectID', 'itemID', 'projectType'];
    return numericParams.includes(p);
};
const isDateParam = (p: string) => 
    p === 'startDate' || p === 'dueDate' || p === 'deliveryDate' || p === 'endDate' || p === 'dateInitialContact';

// Enhanced properties with mandatory/optional field pattern for insert3
const extraProperties: INodeProperties[] = [
    
    // Mandatory fields for insert3 operation
    ...Object.entries(OPERATION_REGISTRY).flatMap(([op, meta]) => {
        if (op !== 'createJobFromObject') return [];
        
        const mandatoryFields = ['projectID', 'projectType', 'jobTypeShort'];
        
        return mandatoryFields.map<INodeProperties>((p) => {
            // Handle special cases for mandatory fields
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
            
            if (p === 'projectID') {
                return {
                    displayName: 'Project ID',
                    name: p,
                    type: 'number',
                    default: 0,
                    typeOptions: { minValue: 0, step: 1 },
                    description: `${p} parameter for ${op} (number)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            
            if (p === 'jobTypeShort') {
                return {
                    displayName: 'Job Type Short',
                    name: p,
                    type: 'string',
                    default: '',
                    description: `${p} parameter for ${op} (string)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }
            
            // Default for other mandatory fields
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
    
    // Standard properties for other operations
    ...Object.entries(OPERATION_REGISTRY).flatMap(([op, meta]) => {
        if (op === 'createJobFromObject') return []; // Skip createJobFromObject as it's handled above
        
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
    
    // Collection field for optional fields
    ...Object.entries(OPERATION_REGISTRY).flatMap(([op, meta]) => {
        if (op !== 'createJobFromObject' && op !== 'updateJob') return [];

        const mandatoryFields = ['projectID', 'projectType', 'jobTypeShort'];
        
        // Only include the specific JobIN fields from the SOAP envelope
        const jobInFields = ['contactPersonID', 'dueDate', 'itemID', 'jobID', 'startDate', 'status'];
        const optionalFields = jobInFields.filter(f => 
            !mandatoryFields.includes(f) && 
            f !== 'jobID' // jobID is auto-generated
        );

        // Create options for the collection
        const collectionOptions = optionalFields.map(field => {
            const displayName = labelize(field);

            // Handle specific JobIN fields
            if (field === 'status') {
                return {
                    displayName: 'Status',
                    name: field,
                    type: 'options' as const,
                    options: [
                        { name: 'Please select...', value: '' },
                        // Add JobStatusOptions here when available
                    ],
                    default: '',
                    description: `${field} parameter (JobStatus enum)`,
                };
            }
            
            if (field === 'startDate' || field === 'dueDate') {
                return {
                    displayName: displayName,
                    name: field,
                    type: 'dateTime' as const,
                    default: '',
                    description: `${field} parameter (date)`,
                };
            }
            
            if (field === 'contactPersonID' || field === 'itemID') {
                return {
                    displayName: displayName,
                    name: field,
                    type: 'number' as const,
                    default: 0,
                    typeOptions: { minValue: 0, step: 1 },
                    description: `${field} parameter (number)`,
                };
            }
            
            // Default string field
            return {
                displayName: displayName,
                name: field,
                type: 'string' as const,
                default: '',
                description: `${field} parameter (string)`,
            };
        });

        return [{
            displayName: 'Additional Fields',
            name: 'additionalFields',
            type: 'collection' as const,
            placeholder: 'Add Field',
            default: {},
            options: collectionOptions,
            description: 'Additional job fields to include (optional)',
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
        }];
    }),
];

export const DataJob30ActionsService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core job operations for creating, updating, and managing jobs',
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
