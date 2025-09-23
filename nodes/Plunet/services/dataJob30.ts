import {
    IExecuteFunctions,
    IDataObject,
    INodeProperties,
    INodePropertyOptions,
    NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { labelize, asNonEmpty } from '../core/utils';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import {
    extractResultBase,
    extractStatusMessage,
    extractSoapFault,
    parseStringResult,
    parseIntegerResult,
    parseIntegerArrayResult,
    parseVoidResult,
    parseDateResult,
    parseStringArrayResult,
} from '../core/xml';
import {
    parseJobResult,
    parseJobListResult,
    parseJobMetricResult,
    parsePriceLineResult,
    parsePriceLineListResult,
    parsePriceUnitResult,
    parsePriceUnitListResult,
    parseJobTrackingTimeListResult,
} from '../core/parsers/job';
import {
    parsePricelistResult,
    parsePricelistListResult,
    parsePricelistEntryListResult,
} from '../core/parsers/pricelist';
import { CurrencyTypeOptions } from '../enums/currency-type';
import { CatTypeOptions } from '../enums/cat-type';
import { JobStatusOptions } from '../enums/job-status';
import { ProjectTypeOptions } from '../enums/project-type';
import {
    JOB_IN_FIELDS,
    JOB_TRACKING_TIME_IN_FIELDS,
    PRICE_LINE_IN_FIELDS,
    MANDATORY_FIELDS,
    FIELD_TYPES,
} from '../core/field-definitions';
import {
    createTypedProperty,
    createStandardExecuteConfig,
    executeStandardService,
    generateOperationOptionsFromRegistry,
} from '../core/service-utils';

const RESOURCE = 'DataJob30';
const ENDPOINT = 'DataJob30';
const RESOURCE_DISPLAY_NAME = 'Job';

/** ─ Centralized Operation Registry ─ */
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // Core Job Operations
    getJob: {
        soapAction: 'getJob_ForView',
        endpoint: ENDPOINT,
        uiName: 'Get Job',
        subtitleName: 'get: job',
        titleName: 'Get a Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve a single job by ID',
        returnType: 'Job',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    getJobsByIds: {
        // This is not a necessary operation and can be replaced by multiple GetJob_forView operations;
        // Also the parameter job list must be handled in the following format "17;18;19" so a list separated by semicolons
        soapAction: 'getJobList_ForView',
        endpoint: ENDPOINT,
        uiName: 'Get Many Jobs (by IDs)',
        subtitleName: 'get many jobs by ids: job',
        titleName: 'Get Many Jobs by IDs',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve multiple jobs by their IDs',
        returnType: 'JobList',
        paramOrder: ['jobIDs', 'projectType'],
        active: false,
    },
    getJobsForItem: {
        soapAction: 'getJobListOfItem_ForView',
        endpoint: ENDPOINT,
        uiName: 'Get Many Jobs for Item',
        subtitleName: 'get many jobs for item: job',
        titleName: 'Get Many Jobs for Item',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve all jobs associated with an item',
        returnType: 'JobList',
        paramOrder: ['itemID', 'projectType'],
        active: true,
    },
    createJob: {
        soapAction: 'insert',
        endpoint: ENDPOINT,
        uiName: 'Create Empty Job',
        subtitleName: 'create: job',
        titleName: 'Create an empty Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new job',
        returnType: 'Integer',
        paramOrder: ['projectID', 'projectType', 'jobTypeAbbrevation'],
        active: false,
    },
    createJobWithItem: {
        soapAction: 'insert2',
        endpoint: ENDPOINT,
        uiName: 'Create Empty Job (with Item)',
        subtitleName: 'create empty job with item: job',
        titleName: 'Create Empty Job with Item',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new job with an associated item',
        returnType: 'Integer',
        paramOrder: ['projectID', 'projectType', 'jobTypeAbbrevation', 'itemID'],
        active: false,
    },
    createJobFromObject: {
        soapAction: 'insert3',
        endpoint: ENDPOINT,
        uiName: 'Create Job',
        subtitleName: 'create job from object: job',
        titleName: 'Create Job from Object',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new job from a complete job object',
        returnType: 'Integer',
        paramOrder: ['projectID', 'projectType', 'jobTypeShort'],
        active: true,
    },
    updateJob: {
        soapAction: 'update',
        endpoint: ENDPOINT,
        uiName: 'Update Job',
        subtitleName: 'update: job',
        titleName: 'Update a Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update an existing job',
        returnType: 'Void',
        paramOrder: [...JOB_IN_FIELDS, 'enableNullOrEmptyValues'],
        active: true,
    },
    deleteJob: {
        soapAction: 'deleteJob',
        endpoint: ENDPOINT,
        uiName: 'Delete Job',
        subtitleName: 'delete: job',
        titleName: 'Delete a Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Delete a job',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    assignJob: {
        soapAction: 'assignJob',
        endpoint: ENDPOINT,
        uiName: 'Assign Job',
        subtitleName: 'assign: job',
        titleName: 'Assign Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Assign a job to a resource',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'resourceID'],
        active: false,
    },
    setJobStatus: {
        soapAction: 'setJobStatus',
        endpoint: ENDPOINT,
        uiName: 'Update Status',
        subtitleName: 'update status: job',
        titleName: 'Update Job Status',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update the status of a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'jobID', 'status'],
        active: true,
    },
    getJobMetrics: {
        soapAction: 'getJobMetrics',
        endpoint: ENDPOINT,
        uiName: 'Get Job Metrics',
        subtitleName: 'get job metrics: job',
        titleName: 'Get Job Metrics',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve metrics for a job',
        returnType: 'JobMetric',
        paramOrder: ['jobID', 'projectType', 'languageCode'],
        active: true,
    },
    // Price Line Operations
    getPriceLines: {
        soapAction: 'getPriceLine_List',
        endpoint: ENDPOINT,
        uiName: 'Get Price Lines',
        subtitleName: 'get price lines: job',
        titleName: 'Get Price Lines',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve price lines for a job',
        returnType: 'PriceLineList',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    getPriceLinesByCurrency: {
        soapAction: 'getPriceLine_ListByCurrencyType',
        endpoint: ENDPOINT,
        uiName: 'Get Price Lines (by Currency)',
        subtitleName: 'get price lines by currency: job',
        titleName: 'Get Price Lines by Currency',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve price lines for a job by currency type',
        returnType: 'PriceLineList',
        paramOrder: ['jobID', 'projectType', 'currencyType'],
        active: true,
    },
    addPriceLine: {
        soapAction: 'insertPriceLine',
        endpoint: ENDPOINT,
        uiName: 'Add Price Line',
        subtitleName: 'add price line: job',
        titleName: 'Add Price Line',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Add a new price line to a job',
        returnType: 'PriceLine',
        paramOrder: ['jobID', 'projectType', ...PRICE_LINE_IN_FIELDS, 'createAsFirstItem'],
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
        paramOrder: ['jobID', 'projectType', ...PRICE_LINE_IN_FIELDS],  
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
    // Pricelist Operations
    getPricelist: {
        soapAction: 'getPricelist',
        endpoint: ENDPOINT,
        uiName: 'Get Pricelist',
        subtitleName: 'get pricelist: job',
        titleName: 'Get Pricelist',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve the pricelist for a job',
        returnType: 'Pricelist',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    setPricelist: {
        soapAction: 'setPricelist',
        endpoint: ENDPOINT,
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update the pricelist for a job',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType', 'priceListID'],
        active: true,
    },
    setPricelistById: {
        soapAction: 'setPriceListeID',
        endpoint: ENDPOINT,
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update the pricelist for a job by ID',
        returnType: 'Void',
        paramOrder: ['projectType', 'priceListID', 'jobID'],    
        active: true,
    },
    getPricelists: {
        soapAction: 'getPricelist_List',
        endpoint: ENDPOINT,
        uiName: 'Get Pricelists (Job)',
        subtitleName: 'get pricelists job: job',
        titleName: 'Get Pricelists for Job',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve all pricelists for a job',
        returnType: 'PricelistList',
        paramOrder: ['jobID', 'projectType'],
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
        description: 'Retrieve pricelist entries for a pricelist',
        returnType: 'PricelistEntryList',
        paramOrder: ['PricelistID', 'SourceLanguage', 'TargetLanguage'],
        active: true,
    },
    // Price Unit Operations
    getPriceUnits: {
        soapAction: 'getPriceUnit_List',
        endpoint: ENDPOINT,
        uiName: 'Get Price Units',
        subtitleName: 'get price units: job',
        titleName: 'Get Price Units',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve available price units',
        returnType: 'PriceUnitList',
        paramOrder: ['languageCode', 'service'],
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
        description: 'Retrieve a specific price unit',
        returnType: 'PriceUnit',
        paramOrder: ['PriceUnitID', 'languageCode'],
        active: true,
    },
    // Utility Operations
    getServices: {
        soapAction: 'getServices_List',
        endpoint: ENDPOINT,
        uiName: 'Get Services',
        subtitleName: 'get services: job',
        titleName: 'Get Services',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve available services',
        returnType: 'StringArray',
        paramOrder: ['languageCode'],
        active: true,
    },
    getActionLink: {
        soapAction: 'getActionLink',
        endpoint: ENDPOINT,
        uiName: 'Get Action Link',
        subtitleName: 'get action link: job',
        titleName: 'Get Action Link',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get an action link for a job',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID', 'userID', 'actionLinkType'],
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
    // Job Tracking Time Operations
    addJobTrackingTime: {
        soapAction: 'addJobTrackingTime',
        endpoint: ENDPOINT,
        uiName: 'Add Job Tracking Time',
        subtitleName: 'add job tracking time: job',
        titleName: 'Add Job Tracking Time',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Add tracking time to a job',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType', ...JOB_TRACKING_TIME_IN_FIELDS],
        active: true,
    },
    addJobTrackingTimesList: {
        soapAction: 'addJobTrackingTimesList',
        endpoint: ENDPOINT,
        uiName: 'Add Job Tracking Times (List)',
        subtitleName: 'add job tracking times list: job',
        titleName: 'Add Job Tracking Times List',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Add multiple tracking times to a job',
        returnType: 'Void',
        paramOrder: ['jobID', 'projectType', 'JobTrackingTimeListIN'],
        active: true,
    },
    getJobTrackingTimes: {
        soapAction: 'getJobTrackingTimesList',
        endpoint: ENDPOINT,
        uiName: 'Get Job Tracking Times',
        subtitleName: 'get job tracking times: job',
        titleName: 'Get Job Tracking Times',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve tracking times for a job',
        returnType: 'JobTrackingTimeList',
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    // Additional Job Information Operations
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
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        paramOrder: ['jobID', 'projectType'],
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
        description: 'Get resource ID assigned to a job',
        returnType: 'Integer',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    setResourceId: {
        soapAction: 'setResourceID',
        endpoint: ENDPOINT,
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        paramOrder: ['jobID', 'projectType'],
        active: true,
    },
    getJobTypeLongName: {
        soapAction: 'getJobType_LongName',
        endpoint: ENDPOINT,
        uiName: 'Get Job Type (Long Name)',
        subtitleName: 'get job type long name: job',
        titleName: 'Get Job Type Long Name',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get long name of job type',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getJobTypeShortName: {
        soapAction: 'getJobType_ShortName',
        endpoint: ENDPOINT,
        uiName: 'Get Job Type (Short Name)',
        subtitleName: 'get job type short name: job',
        titleName: 'Get Job Type Short Name',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get short name of job type',
        returnType: 'String',
        paramOrder: ['projectType', 'jobID'],
        active: true,
    },
    getDownloadUrlSourceData: {
        soapAction: 'getDownloadUrl_SourceData',
        endpoint: ENDPOINT,
        uiName: 'Get Download URL (Source Data)',
        subtitleName: 'get download url source data: job',
        titleName: 'Get Download URL Source Data',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Get download URL for source data',
        returnType: 'String',
        paramOrder: ['targetFileName', 'projectType', 'jobID'],
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
        description: 'Get jobs that are independent of items',
        returnType: 'JobList',
        paramOrder: ['projectType', 'projectId'],
        active: true,
    },
    setItemId: {
        soapAction: 'setItemID',
        endpoint: ENDPOINT,
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
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
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update start date for a job',
        returnType: 'Void',
        paramOrder: ['projectType', 'startDate', 'jobID'],
        active: true,
    },
    // CAT Report Operations
    setCatReport: {
        soapAction: 'setCatReport',
        endpoint: ENDPOINT,
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update CAT report for a job',
        returnType: 'Void',
        paramOrder: ['pathOrUrl', 'overwriteExistingPriceLines', 'catType', 'projectType', 'analyzeAndCopyResultToJob', 'jobID'],
        active: true,
    },
    setCatReport2: {
        soapAction: 'setCatReport2',
        endpoint: ENDPOINT,
        uiName: 'Update',
        subtitleName: 'update: job',
        titleName: 'Update',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update CAT report for a job using file stream',
        returnType: 'Void',
        paramOrder: ['FileByteStream', 'FilePathName', 'Filesize', 'catType', 'projectType', 'analyzeAndCopyResultToJob', 'jobID'],
        active: true,
    },
};

/** ─ Legacy compatibility mappings ─ */
const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.paramOrder])
);

type R =
    | 'Void' | 'String' | 'Integer' | 'IntegerArray' | 'Date'
    | 'Job' | 'JobList' | 'JobMetric'
    | 'PriceLine' | 'PriceLineList'
    | 'PriceUnit' | 'PriceUnitList'
    | 'Pricelist' | 'PricelistList' | 'PricelistEntryList'
    | 'JobTrackingTimeList' | 'StringArray';

const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
        .filter(op => op.active) // Only include active operations
        .map(op => [op.soapAction, op.returnType as R])
);

/** ─────────────────────────────────────────────────────────────────────────────
 *  UI wiring
 *  ─────────────────────────────────────────────────────────────────────────── */

// Specific param helpers
const isEnableEmptyParam = (op: string, p: string) =>
    op === 'update' && p.toLowerCase() === 'enablenulloremptyvalues';

const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
const isCurrencyTypeParam = (op: string, p: string) =>
    op === 'getPriceLine_ListByCurrencyType' && p === 'currencyType';
const isCatTypeParam = (op: string, p: string) =>
    (op === 'setCatReport' || op === 'setCatReport2') && p === 'catType';
const isJobStatusParam = (op: string, p: string) =>
    op === 'setJobStatus' && p === 'status';

// Flags to render as booleans in the UI
const isBooleanFlagParam = (op: string, p: string) =>
    (op === 'insertPriceLine' && p === 'createAsFirstItem') ||
    ((op === 'setCatReport' || op === 'setCatReport2') && (p === 'overwriteExistingPriceLines' || p === 'analyzeAndCopyResultToJob'));

const NUMERIC_PARAM_NAMES = new Set([
    'jobID',
    'projectID',
    'resourceID',
    'itemID',
    'userID',
    'contactID',
    'priceLineID',
    'PriceUnitID',
    'priceListID',
    'PricelistID',
    'projectId',      // note lowercase 'd' in your PARAM_ORDER
]);

const isNumericParam = (op: string, p: string) =>
    (op === 'setCatReport2' && p === 'Filesize') || NUMERIC_PARAM_NAMES.has(p);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

// Enhanced properties with mandatory/optional field pattern for insert3
const extraProperties: INodeProperties[] = [
    
    // Mandatory fields for insert3 operation
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        if (op !== 'insert3') return [];
        
        const mandatoryFields = MANDATORY_FIELDS[op] || [];
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
    
    // Collection field for optional fields - exactly like customer/resource operations
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        if (op !== 'insert3') return [];

        const mandatoryFields = MANDATORY_FIELDS[op] || [];
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
                        ...JobStatusOptions
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
            typeOptions: {
                multipleValues: true,
                sortable: true,
            },
            options: collectionOptions,
            description: 'Additional job fields to include (optional)',
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
        }];
    }),
    
    // Standard properties for other operations
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        if (op === 'insert3') return []; // Skip insert3 as it's handled above
        
        return params.map<INodeProperties>((p) => {
            // 1) enableNullOrEmptyValues → boolean
            if (isEnableEmptyParam(op, p)) {
                return {
                    displayName: 'Overwrite with Empty Values',
                    name: p,
                    type: 'boolean',
                    default: false,
                    description:
                        'If enabled, empty inputs overwrite existing values in Plunet. If disabled, empty inputs are ignored and existing values are preserved.',
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // 2) projectType → dropdown everywhere it appears
            if (isProjectTypeParam(p)) {
                return {
                    displayName: 'Project Type',
                    name: p,
                    type: 'options',
                    options: ProjectTypeOptions,   // QUOTE(1), ORDER(3)
                    default: 3,                    // ORDER
                    description: `${p} parameter for ${op} (ProjectType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // 3) currencyType → dropdown on getPriceLine_ListByCurrencyType
            if (isCurrencyTypeParam(op, p)) {
                return {
                    displayName: 'Currency Type',
                    name: p,
                    type: 'options',
                    options: CurrencyTypeOptions,  // PROJECTCURRENCY(1), HOMECURRENCY(2)
                    default: 1,
                    description: `${p} parameter for ${op} (CurrencyType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // 4) catType → dropdown on CAT endpoints
            if (isCatTypeParam(op, p)) {
                return {
                    displayName: 'CAT Type',
                    name: p,
                    type: 'options',
                    options: CatTypeOptions,       // TRADOS(1) ... PHRASE(16)
                    default: 1,                    // TRADOS
                    description: `${p} parameter for ${op} (CatType enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // 5) status → dropdown on setJobStatus
            if (isJobStatusParam(op, p)) {
                return {
                    displayName: 'Status',
                    name: p,
                    type: 'options',
                    options: JobStatusOptions,     // IN_PREPERATION(0) ... OVERDUE(13)
                    default: 0,                    // IN_PREPERATION
                    description: `${p} parameter for ${op} (JobStatus enum)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // 6) boolean flags → boolean
            if (isBooleanFlagParam(op, p)) {
                return {
                    displayName: p,
                    name: p,
                    type: 'boolean',
                    default: false,
                    description: `${p} parameter for ${op} (boolean)`,
                    displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
                };
            }

            // 7) numeric params (IDs + Filesize) → number
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

            // 8) default: plain string
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

function toSoapParamValue(raw: unknown, paramName: string): string {
    if (raw == null) return '';               // guard null/undefined
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'boolean') {
        return NUMERIC_BOOLEAN_PARAMS.has(paramName)
            ? (raw ? '1' : '0')                   // numeric boolean
            : (raw ? 'true' : 'false');           // normal boolean
    }
    return String(raw);                        // fallback
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

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
        buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
            if (op === 'insert3') {
                // Get mandatory fields
                const projectID = itemParams.projectID as number;
                const projectType = itemParams.projectType as number;
                const jobTypeShort = itemParams.jobTypeShort as string;
                
                // Get additional fields from collection
                const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
                
                // Build JobIN XML with mandatory and optional fields
                let jobInXml = '<JobIN>';
                
                // Add mandatory fields
                jobInXml += `<projectID>${escapeXml(String(projectID))}</projectID>`;
                jobInXml += `<projectType>${escapeXml(String(projectType))}</projectType>`;
                
                // Add optional fields from collection
                Object.entries(additionalFields).forEach(([key, value]) => {
                    if (value !== '' && value !== null && value !== undefined) {
                        let xmlValue: string;
                        
                        // Handle datetime fields properly
                        if (key === 'startDate' || key === 'dueDate') {
                            if (value instanceof Date) {
                                xmlValue = value.toISOString();
                            } else if (typeof value === 'string' && value) {
                                xmlValue = value;
                            } else {
                                return; // Skip if not a valid date
                            }
                        } else {
                            xmlValue = toSoapParamValue(value, key);
                        }
                        
                        jobInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
                    }
                });
                
                jobInXml += '</JobIN>';
                
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${jobInXml}\n<JobTypeShort>${escapeXml(jobTypeShort)}</JobTypeShort>`;
            }
            return null; // No custom body building needed for other operations
        },
        parseResult: (xml: string, op: string) => {
            const rt = RETURN_TYPE[op] as R | undefined;
            let payload: IDataObject;

            switch (rt) {
                case 'Job': {
                    const r = parseJobResult(xml);
                    payload = { job: r.job, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'JobList': {
                    const r = parseJobListResult(xml);
                    payload = { jobs: r.jobs, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'JobMetric': {
                    const r = parseJobMetricResult(xml);
                    payload = { jobMetric: r.jobMetric, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PriceLine': {
                    const r = parsePriceLineResult(xml);
                    payload = { priceLine: r.priceLine, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PriceLineList': {
                    const r = parsePriceLineListResult(xml);
                    payload = { priceLines: r.priceLines, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PriceUnit': {
                    const r = parsePriceUnitResult(xml);
                    payload = { priceUnit: r.priceUnit, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PriceUnitList': {
                    const r = parsePriceUnitListResult(xml);
                    payload = { priceUnits: r.priceUnits, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Pricelist': {
                    const r = parsePricelistResult(xml);
                    payload = { pricelist: r.pricelist, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PricelistList': {
                    const r = parsePricelistListResult(xml);
                    payload = { pricelists: r.pricelists, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'PricelistEntryList': {
                    const r = parsePricelistEntryListResult(xml);
                    payload = {
                        pricelistEntries: r.entries,              // ← use r.entries
                        statusMessage: r.statusMessage,
                        statusCode: r.statusCode,
                    };
                    break;
                }
                case 'JobTrackingTimeList': {
                    const r = parseJobTrackingTimeListResult(xml);
                    payload = {
                        jobTrackingTimes: r.times,                // ← use r.times
                        completed: r.completed,                   // ← optional extra, if you want it surfaced
                        statusMessage: r.statusMessage,
                        statusCode: r.statusCode,
                    };
                    break;
                }
                case 'StringArray': {
                    const r = parseStringArrayResult(xml);
                    payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'String': {
                    const r = parseStringResult(xml);
                    payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Integer': {
                    const r = parseIntegerResult(xml);
                    payload = { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'IntegerArray': {
                    const r = parseIntegerArrayResult(xml);
                    payload = { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Date': {
                    const r = parseDateResult(xml);
                    payload = { date: r.date ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
                    break;
                }
                case 'Void': {
                    const r = parseVoidResult(xml);
                    if (!r.ok) {
                        const msg = r.statusMessage || 'Operation failed';
                        throw new NodeOperationError(
                            {} as any,
                            `${op}: ${msg}${r.statusCode !== undefined ? ` [${r.statusCode}]` : ''}`,
                            { itemIndex: 0 },
                        );
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

/** ─────────────────────────────────────────────────────────────────────────────
 *  Service export
 *  ─────────────────────────────────────────────────────────────────────────── */
export const DataJob30Service: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Job-related endpoints',
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