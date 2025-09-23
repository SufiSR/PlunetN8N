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
  import { labelize } from '../core/utils';
  import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
  import {
    extractStatusMessage,
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
    MANDATORY_FIELDS,
  } from '../core/field-definitions';
  import {
    generateOperationOptionsFromRegistry,
  } from '../core/service-utils';
  
  const RESOURCE = 'DataJob30_2.0';
  const ENDPOINT = 'DataJob30';
  const RESOURCE_DISPLAY_NAME = 'Job_2.0';
  
  /** ────────────────────────────────────────────────────────────────────────────
   * Registry (base operations)
   * ─────────────────────────────────────────────────────────────────────────── */
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
      titleName: 'Create a Job',
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
    insertPriceLine: {
      soapAction: 'insertPriceLine',
      endpoint: ENDPOINT,
      uiName: 'Create Price Line',
      subtitleName: 'create price line: job',
      titleName: 'Create Price Line',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create a new price line in a job',
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
    setPricelistById: {
      soapAction: 'setPriceListeID',
      endpoint: ENDPOINT,
      uiName: 'Update PricelistID',
      subtitleName: 'update pricelistid: job',
      titleName: 'Update PricelistID',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update the pricelist for a job by ID',
      returnType: 'Void',
      paramOrder: ['projectType', 'priceListID', 'jobID'],
      active: false,
    },
    getPricelists: {
      soapAction: 'getPricelist_List',
      endpoint: ENDPOINT,
      uiName: 'Get all available Pricelists (Job)',
      subtitleName: 'get availablepricelists job: job',
      titleName: 'Get all available Pricelists for Job',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all available pricelists for a job',
      returnType: 'PricelistList',
      paramOrder: ['jobID', 'projectType'],
      active: true,
    },
    getPricelistEntries: {
      soapAction: 'getPricelistEntry_List',
      endpoint: ENDPOINT,
      uiName: 'Get all Pricelist Entries',
      subtitleName: 'get all pricelist entries: job',
      titleName: 'Get all Pricelist Entries',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all pricelist entries for a pricelist',
      returnType: 'PricelistEntryList',
      paramOrder: ['PricelistID', 'SourceLanguage', 'TargetLanguage'],
      active: true,
    },
    // Price Unit Operations
    getPriceUnits: {
      soapAction: 'getPriceUnit_List',
      endpoint: ENDPOINT,
      uiName: 'Get all available Price Units',
      subtitleName: 'get all available price units: job',
      titleName: 'Get all available Price Units',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Retrieve all available price units',
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
      active: false,
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
      uiName: 'Create Job Tracking Time',
      subtitleName: 'create job tracking time: job',
      titleName: 'Create Job Tracking Time',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create tracking time for a job',
      returnType: 'Void',
      paramOrder: ['jobID', 'projectType', ...JOB_TRACKING_TIME_IN_FIELDS],
      active: false,
    },
    addJobTrackingTimesList: {
      soapAction: 'addJobTrackingTimesList',
      endpoint: ENDPOINT,
      uiName: 'Create Job Tracking Times (List)',
      subtitleName: 'create job tracking times list: job',
      titleName: 'Create Job Tracking Times List',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Create multiple tracking times for a job',
      returnType: 'Void',
      paramOrder: ['jobID', 'projectType', 'JobTrackingTimeListIN'],
      active: false,
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
      active: false,
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
      uiName: 'Update Resource ID',
      subtitleName: 'update resource id: job',
      titleName: 'Update Resource ID',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update resource ID for a job',
      returnType: 'Void',
      paramOrder: ['projectType', 'resourceID', 'jobID'],
      active: false,
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
      active: false,
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
      active: false,
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
      active: false,
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
      active: false,
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
      active: false,
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
      active: false,
    },
    // CAT Report Operations
    setCatReport: {
      soapAction: 'setCatReport',
      endpoint: ENDPOINT,
      uiName: 'Update CAT Report',
      subtitleName: 'update cat report: job',
      titleName: 'Update CAT Report',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update CAT report for a job',
      returnType: 'Void',
      paramOrder: ['pathOrUrl', 'overwriteExistingPriceLines', 'catType', 'projectType', 'analyzeAndCopyResultToJob', 'jobID'],
      active: false,
    },
    setCatReport2: {
      soapAction: 'setCatReport2',
      endpoint: ENDPOINT,
      uiName: 'Update CAT Report',
      subtitleName: 'update cat report: job',
      titleName: 'Update CAT Report',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Update CAT report for a job using file stream',
      returnType: 'Void',
      paramOrder: ['FileByteStream', 'FilePathName', 'Filesize', 'catType', 'projectType', 'analyzeAndCopyResultToJob', 'jobID'],
      active: true,
    },
  };
  
  /** ─ Composite (synthetic) operations ─ */
  const COMPOSITE_PREFIX = '__composite__';
  const REG_COMPOSITE: ServiceOperationRegistry = {
    getJobPlus: {
      soapAction: `${COMPOSITE_PREFIX}:getJobPlus`,
      endpoint: ENDPOINT,
      uiName: 'Get Job (with meta)',
      subtitleName: 'get job + meta',
      titleName: 'Get Job (with Meta)',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'getJob_ForView + meta getters merged into one object',
      returnType: 'Job',
      paramOrder: ['jobID', 'projectType'],
      active: true,
    },
    insert3Plus: {
      soapAction: `${COMPOSITE_PREFIX}:insert3Plus`,
      endpoint: ENDPOINT,
      uiName: 'Create Job (with meta)',
      subtitleName: 'insert3 + setters + meta',
      titleName: 'Create Job (with Meta)',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'insert3, then optional setters, then fetch meta',
      returnType: 'Job',
      paramOrder: ['projectID','projectType','jobTypeShort','comment?','description?','contactPersonID?','dueDate?','deliveryNote?'],
      active: true,
    },
    updatePlus: {
      soapAction: `${COMPOSITE_PREFIX}:updatePlus`,
      endpoint: ENDPOINT,
      uiName: 'Update Job (with meta)',
      subtitleName: 'update + setters + meta',
      titleName: 'Update Job (with Meta)',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'update, then optional setters, then fetch meta',
      returnType: 'Job',
      paramOrder: [...JOB_IN_FIELDS, 'enableNullOrEmptyValues','comment?','description?','contactPersonID?','dueDate?','deliveryNote?'],
      active: true,
    },
  };
  
  Object.assign(OPERATION_REGISTRY, REG_COMPOSITE);
  
  /** ─ Legacy compatibility mappings ─ */
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY)
      .filter(op => op.active)
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
      .filter(op => op.active)
      .map(op => [op.soapAction, op.returnType as R])
  );
  
  /** ────────────────────────────────────────────────────────────────────────────
   * UI wiring
   * ─────────────────────────────────────────────────────────────────────────── */
  const isEnableEmptyParam = (op: string, p: string) =>
    op === 'update' && p.toLowerCase() === 'enablenulloremptyvalues';
  
  const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
  const isCurrencyTypeParam = (op: string, p: string) =>
    op === 'getPriceLine_ListByCurrencyType' && p === 'currencyType';
  const isCatTypeParam = (op: string, p: string) =>
    (op === 'setCatReport' || op === 'setCatReport2') && p === 'catType';
  const isJobStatusParam = (op: string, p: string) =>
    op === 'setJobStatus' && p === 'status';
  
  const NUMERIC_PARAM_NAMES = new Set([
    'jobID', 'projectID', 'resourceID', 'itemID', 'userID', 'contactID',
    'priceLineID', 'PriceUnitID', 'priceListID', 'PricelistID', 'projectId',
  ]);
  
  const isNumericParam = (op: string, p: string) =>
    (op === 'setCatReport2' && p === 'Filesize') || NUMERIC_PARAM_NAMES.has(p);
  
  const isDateParam = (p: string) =>
    p === 'startDate' || p === 'dueDate' || p === 'deliveryDate' || p === 'endDate' || p === 'dateInitialContact';
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> =
    generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    // Mandatory fields panel for insert3 (from MANDATORY_FIELDS)
    ...Object.entries(PARAM_ORDER).flatMap(([op]) => {
      if (op !== 'insert3') return [];
      const mandatoryFields = MANDATORY_FIELDS[op] || [];
      return mandatoryFields.map<INodeProperties>((p) => {
        if (isProjectTypeParam(p)) {
          return {
            displayName: 'Project Type',
            name: p,
            type: 'options',
            options: ProjectTypeOptions,
            default: 3,
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
  
    // Standard properties for other operations (except insert3/update, we handle those separately)
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
      if (op === 'insert3' || op === 'update') return [];
      return params.map<INodeProperties>((p) => {
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
        if (isProjectTypeParam(p)) {
          return {
            displayName: 'Project Type',
            name: p,
            type: 'options',
            options: ProjectTypeOptions,
            default: 3,
            description: `${p} parameter for ${op} (ProjectType enum)`,
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
          };
        }
        if (isCurrencyTypeParam(op, p)) {
          return {
            displayName: 'Currency Type',
            name: p,
            type: 'options',
            options: CurrencyTypeOptions,
            default: 1,
            description: `${p} parameter for ${op} (CurrencyType enum)`,
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
          };
        }
        if (isCatTypeParam(op, p)) {
          return {
            displayName: 'CAT Type',
            name: p,
            type: 'options',
            options: CatTypeOptions,
            default: 1,
            description: `${p} parameter for ${op} (CatType enum)`,
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
          };
        }
        if (isJobStatusParam(op, p)) {
          return {
            displayName: 'Status',
            name: p,
            type: 'options',
            options: JobStatusOptions,
            default: 0,
            description: `${p} parameter for ${op} (JobStatus enum)`,
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
          };
        }
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
  
    // Composite-op optional inputs (only show on insert3Plus/updatePlus)
    {
      displayName: 'Comment',
      name: 'comment',
      type: 'string',
      default: '',
      displayOptions: {
        show: { resource: [RESOURCE], operation: [`${COMPOSITE_PREFIX}:insert3Plus`, `${COMPOSITE_PREFIX}:updatePlus`] },
      },
    },
    {
      displayName: 'Description',
      name: 'description',
      type: 'string',
      default: '',
      displayOptions: {
        show: { resource: [RESOURCE], operation: [`${COMPOSITE_PREFIX}:insert3Plus`, `${COMPOSITE_PREFIX}:updatePlus`] },
      },
    },
    {
      displayName: 'Contact Person ID',
      name: 'contactPersonID',
      type: 'number',
      default: 0,
      typeOptions: { minValue: 0, step: 1 },
      displayOptions: {
        show: { resource: [RESOURCE], operation: [`${COMPOSITE_PREFIX}:insert3Plus`, `${COMPOSITE_PREFIX}:updatePlus`] },
      },
    },
    {
      displayName: 'Due Date',
      name: 'dueDate',
      type: 'dateTime',
      default: '',
      displayOptions: {
        show: { resource: [RESOURCE], operation: [`${COMPOSITE_PREFIX}:insert3Plus`, `${COMPOSITE_PREFIX}:updatePlus`] },
      },
    },
    {
      displayName: 'Delivery Note',
      name: 'deliveryNote',
      type: 'string',
      default: '',
      displayOptions: {
        show: { resource: [RESOURCE], operation: [`${COMPOSITE_PREFIX}:insert3Plus`, `${COMPOSITE_PREFIX}:updatePlus`] },
      },
    },
  ];
  
  /** ────────────────────────────────────────────────────────────────────────────
   * Helpers
   * ─────────────────────────────────────────────────────────────────────────── */
  function toSoapParamValue(raw: unknown, paramName: string): string {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'boolean') {
      return NUMERIC_BOOLEAN_PARAMS.has(paramName) ? (raw ? '1' : '0') : (raw ? 'true' : 'false');
    }
    return String(raw);
  }
  
  function escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
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
          const projectID = itemParams.projectID as number;
          const projectType = itemParams.projectType as number;
          const jobTypeShort = itemParams.jobTypeShort as string;
  
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          const selectedOptionalFields = Object.keys(additionalFields).filter(key =>
            additionalFields[key] !== '' && additionalFields[key] !== null && additionalFields[key] !== undefined
          );
  
          let jobInXml = '<JobIN>';
          jobInXml += `<projectID>${escapeXml(String(projectID))}</projectID>`;
          jobInXml += `<projectType>${escapeXml(String(projectType))}</projectType>`;
  
          selectedOptionalFields.forEach(key => {
            const value = additionalFields[key];
            let xmlValue: string;
            if (key === 'startDate' || key === 'dueDate') {
              if (value instanceof Date) xmlValue = value.toISOString();
              else if (typeof value === 'string' && value) xmlValue = value;
              else return;
            } else {
              xmlValue = toSoapParamValue(value, key);
            }
            jobInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
          });
  
          jobInXml += '</JobIN>';
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${jobInXml}\n<JobTypeShort>${escapeXml(jobTypeShort)}</JobTypeShort>`;
        } else if (op === 'update') {
          const jobID = itemParams.jobID as number;
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          const selectedOptionalFields = Object.keys(additionalFields).filter(key =>
            additionalFields[key] !== '' && additionalFields[key] !== null && additionalFields[key] !== undefined
          );
  
          let jobInXml = '<JobIN>';
          jobInXml += `<jobID>${escapeXml(String(jobID))}</jobID>`;
  
          selectedOptionalFields.forEach(key => {
            const value = additionalFields[key];
            let xmlValue: string;
            if (key === 'startDate' || key === 'dueDate') {
              if (value instanceof Date) xmlValue = value.toISOString();
              else if (typeof value === 'string' && value) xmlValue = value;
              else return;
            } else {
              xmlValue = toSoapParamValue(value, key);
            }
            jobInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
          });
  
          jobInXml += '</JobIN>';
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${jobInXml}`;
        } else if (op === 'insertPriceLine' || op === 'updatePriceLine') {
          const jobID = itemParams.jobID as number;
          const projectType = itemParams.projectType as number;
          const amount = itemParams.amount as number;
          const amount_perUnit = itemParams.amount_perUnit as number;
          const priceUnitID = itemParams.priceUnitID as number;
          const unit_price = itemParams.unit_price as number;
          const taxType = itemParams.taxType as number;
  
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          const selectedOptionalFields = Object.keys(additionalFields).filter(key =>
            additionalFields[key] !== '' && additionalFields[key] !== null && additionalFields[key] !== undefined
          );
  
          let priceLineInXml = '<priceLineIN>';
          if (op === 'updatePriceLine') {
            priceLineInXml += `<priceLineID>${escapeXml(String(itemParams.priceLineID))}</priceLineID>`;
          }
          priceLineInXml += `<amount>${escapeXml(String(amount))}</amount>`;
          priceLineInXml += `<amount_perUnit>${escapeXml(String(amount_perUnit))}</amount_perUnit>`;
          priceLineInXml += `<priceUnitID>${escapeXml(String(priceUnitID))}</priceUnitID>`;
          priceLineInXml += `<taxType>${escapeXml(String(taxType))}</taxType>`;
          priceLineInXml += `<unit_price>${escapeXml(String(unit_price))}</unit_price>`;
  
          selectedOptionalFields.forEach(key => {
            const value = additionalFields[key];
            const xmlValue = toSoapParamValue(value, key);
            priceLineInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
          });
  
          priceLineInXml += '</priceLineIN>';
  
          if (op === 'insertPriceLine') {
            const createAsFirstItem = itemParams.createAsFirstItem as boolean;
            return `<UUID>${escapeXml(sessionId)}</UUID>
  <jobID>${escapeXml(String(jobID))}</jobID>
  <projectType>${escapeXml(String(projectType))}</projectType>
  ${priceLineInXml}
  <createAsFirstItem>${createAsFirstItem ? '1' : '0'}</createAsFirstItem>`;
          }
  
          return `<UUID>${escapeXml(sessionId)}</UUID>
  <jobID>${escapeXml(String(jobID))}</jobID>
  <projectType>${escapeXml(String(projectType))}</projectType>
  ${priceLineInXml}`;
        }
        return null;
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
            payload = { pricelistEntries: r.entries, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'JobTrackingTimeList': {
            const r = parseJobTrackingTimeListResult(xml);
            payload = { jobTrackingTimes: r.times, completed: r.completed, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
  
  const isProvided = (v: unknown) =>
    v !== undefined && v !== null && `${v}`.trim() !== '';
  
  async function call(
    ctx: IExecuteFunctions,
    op: string,
    params: IDataObject,
    config: ExecuteConfig,
    itemIndex: number,
  ): Promise<IDataObject> {
    return await executeOperation(ctx, op, params, config, itemIndex) as IDataObject;
  }
  
  async function fetchMeta(
    ctx: IExecuteFunctions,
    jobID: number,
    projectType: number,
    config: ExecuteConfig,
    itemIndex: number,
  ) {
    const [
      comment, description, deliveryDate, creationDate,
      jobNumber, currency, deliveryNote, payableID, contactPersonID
    ] = await Promise.all([
      call(ctx, 'getComment',         { projectType, jobID }, config, itemIndex),
      call(ctx, 'getDescription',     { projectType, jobID }, config, itemIndex),
      call(ctx, 'getDeliveryDate',    { projectType, jobID }, config, itemIndex),
      call(ctx, 'getCreationDate',    { projectType, jobID }, config, itemIndex),
      call(ctx, 'getJobNumber',       { projectType, jobID }, config, itemIndex),
      call(ctx, 'getCurrency',        { jobID, projectType }, config, itemIndex),
      call(ctx, 'getDeliveryNote',    { projectType, jobID }, config, itemIndex),
      call(ctx, 'getPayableID',       { jobID, projectType }, config, itemIndex),
      call(ctx, 'getContactPersonID', { projectType, jobID }, config, itemIndex),
    ]);
  
    return {
      comment: comment?.data ?? '',
      description: description?.data ?? '',
      contactPersonID: contactPersonID?.value ?? null,
      deliveryDate: deliveryDate?.date ?? '',
      creationDate: creationDate?.date ?? '',
      jobNumber: jobNumber?.data ?? '',
      currency: currency?.data ?? '',
      deliveryNote: deliveryNote?.data ?? '',
      payableID: payableID?.value ?? null,
    };
  }
  
  /** ────────────────────────────────────────────────────────────────────────────
   * Composite orchestrators
   * ─────────────────────────────────────────────────────────────────────────── */
  async function executeGetJobPlus(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
  ): Promise<IDataObject> {
    const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
    const jobID = Number(ctx.getNodeParameter('jobID', itemIndex));
    const projectType = Number(ctx.getNodeParameter('projectType', itemIndex));
  
    const jobRes = await call(ctx, 'getJob_ForView', { jobID, projectType }, config, itemIndex);
    const meta = await fetchMeta(ctx, jobID, projectType, config, itemIndex);
  
    return {
      success: true,
      resource: RESOURCE,
      operation: 'getJobPlus',
      job: jobRes.job,
      meta,
      statusMessage: jobRes.statusMessage,
      statusCode: jobRes.statusCode,
    };
  }
  
  async function executeInsert3Plus(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
  ): Promise<IDataObject> {
    const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
  
    const projectID = Number(ctx.getNodeParameter('projectID', itemIndex));
    const projectType = Number(ctx.getNodeParameter('projectType', itemIndex));
    const jobTypeShort = String(ctx.getNodeParameter('jobTypeShort', itemIndex));
  
    const comment         = ctx.getNodeParameter('comment', itemIndex, '') as string;
    const description     = ctx.getNodeParameter('description', itemIndex, '') as string;
    const contactPersonID = Number(ctx.getNodeParameter('contactPersonID', itemIndex, 0));
    const dueDate         = ctx.getNodeParameter('dueDate', itemIndex, '') as string;
    const deliveryNote    = ctx.getNodeParameter('deliveryNote', itemIndex, '') as string;
  
    // 1) insert -> jobID
    const insertRes = await call(ctx, 'insert3', { projectID, projectType, jobTypeShort }, config, itemIndex);
    const jobID = Number(insertRes.value);
  
    // 2) setters (conditionally)
    if (isProvided(contactPersonID) && contactPersonID > 0)
      await call(ctx, 'setContactPersonID', { projectType, jobID, resourceID: contactPersonID }, config, itemIndex);
    if (isProvided(dueDate))
      await call(ctx, 'setDueDate', { projectType, jobID, dueDate }, config, itemIndex);
    if (isProvided(comment))
      await call(ctx, 'setComment', { projectType, jobID, comment }, config, itemIndex);
    if (isProvided(description))
      await call(ctx, 'setDescription', { projectType, jobID, description }, config, itemIndex);
    if (isProvided(deliveryNote))
      await call(ctx, 'setDeliveryNote', { projectType, jobID, note: deliveryNote }, config, itemIndex);
  
    // 3) final snapshot + meta
    const jobRes = await call(ctx, 'getJob_ForView', { jobID, projectType }, config, itemIndex);
    const meta = await fetchMeta(ctx, jobID, projectType, config, itemIndex);
  
    return {
      success: true,
      resource: RESOURCE,
      operation: 'insert3Plus',
      job: jobRes.job,
      meta,
      statusMessage: jobRes.statusMessage,
      statusCode: jobRes.statusCode,
    };
  }
  
  async function executeUpdatePlus(
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
  ): Promise<IDataObject> {
    const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
  
    const jobID = Number(ctx.getNodeParameter('jobID', itemIndex));
    const projectType = Number(ctx.getNodeParameter('projectType', itemIndex));
  
    // build update params from standard update order (so XML builder can work normally)
    const paramNames = PARAM_ORDER['update'] ?? [];
    const itemParams: IDataObject = {};
    for (const p of paramNames) itemParams[p] = ctx.getNodeParameter(p, itemIndex, '');
  
    const comment         = ctx.getNodeParameter('comment', itemIndex, '') as string;
    const description     = ctx.getNodeParameter('description', itemIndex, '') as string;
    const contactPersonID = Number(ctx.getNodeParameter('contactPersonID', itemIndex, 0));
    const dueDate         = ctx.getNodeParameter('dueDate', itemIndex, '') as string;
    const deliveryNote    = ctx.getNodeParameter('deliveryNote', itemIndex, '') as string;
  
    // 1) base update
    await call(ctx, 'update', itemParams, config, itemIndex);
  
    // 2) setters (conditionally)
    if (isProvided(contactPersonID) && contactPersonID > 0)
      await call(ctx, 'setContactPersonID', { projectType, jobID, resourceID: contactPersonID }, config, itemIndex);
    if (isProvided(dueDate))
      await call(ctx, 'setDueDate', { projectType, jobID, dueDate }, config, itemIndex);
    if (isProvided(comment))
      await call(ctx, 'setComment', { projectType, jobID, comment }, config, itemIndex);
    if (isProvided(description))
      await call(ctx, 'setDescription', { projectType, jobID, description }, config, itemIndex);
    if (isProvided(deliveryNote))
      await call(ctx, 'setDeliveryNote', { projectType, jobID, note: deliveryNote }, config, itemIndex);
  
    // 3) final snapshot + meta
    const jobRes = await call(ctx, 'getJob_ForView', { jobID, projectType }, config, itemIndex);
    const meta = await fetchMeta(ctx, jobID, projectType, config, itemIndex);
  
    return {
      success: true,
      resource: RESOURCE,
      operation: 'updatePlus',
      job: jobRes.job,
      meta,
      statusMessage: jobRes.statusMessage,
      statusCode: jobRes.statusCode,
    };
  }
  
  /** ────────────────────────────────────────────────────────────────────────────
   * Service export
   * ─────────────────────────────────────────────────────────────────────────── */
  export const DataJob30Service_2_0: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Job-related endpoints 2.0',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
  
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
      if (operation.startsWith(`${COMPOSITE_PREFIX}:`)) {
        const key = operation.split(':')[1];
        if (key === 'getJobPlus')  return await executeGetJobPlus(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
        if (key === 'insert3Plus') return await executeInsert3Plus(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
        if (key === 'updatePlus')  return await executeUpdatePlus(ctx, creds, url, baseUrl, timeoutMs, itemIndex);
        throw new Error(`Unknown composite op: ${operation}`);
      }
  
      const paramNames = PARAM_ORDER[operation];
      if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
  
      const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
  
      const itemParams: IDataObject = {};
      for (const paramName of paramNames) {
        itemParams[paramName] = ctx.getNodeParameter(paramName, itemIndex, '');
      }
  
      const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
      return Array.isArray(result) ? result[0] || {} : result;
    },
  };
  