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
  import { extractStatusMessage, parseStringResult, parseIntegerResult, parseVoidResult } from '../core/xml';
  import { parseJobResult, parseJobListResult } from '../core/parsers/job';
  import { parseIntegerArrayResult } from '../core/xml';
  import { ProjectTypeOptions } from '../enums/project-type';
  import { JobStatusOptions } from '../enums/job-status';
  import { ItemStatusOptions } from '../enums/item-status';
  import { MANDATORY_FIELDS } from '../core/field-definitions';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  import { escapeXml } from '../core/soap';
  
  const RESOURCE = 'DataJob30Core';
  const ENDPOINT = 'DataJob30';
  const RESOURCE_DISPLAY_NAME = 'Job';
  
  /** ─ Active operations only ─ */
  const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // ── Active ops ──
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
      paramOrder: ['jobID', 'enableNullOrEmptyValues'],
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
    searchJobs: {
      soapAction: 'search',
      endpoint: 'ReportJob30',
      uiName: 'Search Jobs',
      subtitleName: 'search: jobs',
      titleName: 'Search Jobs',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Search for jobs using various filter criteria',
      returnType: 'IntegerArray',
      paramOrder: [],
      active: true,
    },
  
    // ── Inactive ops (kept for reference) ──
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
  };
  
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
  );
  
  const RETURN_TYPE = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType])
  ) as Record<string, 'Void' | 'Integer' | 'String' | 'Job' | 'JobList' | 'IntegerArray'>;
  
  /** ─ UI wiring (lean) ─ */
  const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
  const NUMERIC_PARAM_NAMES = new Set(['jobID', 'projectID', 'itemID', 'projectId']);
  const isNumericParam = (p: string) => NUMERIC_PARAM_NAMES.has(p);
  const isDateParam = (p: string) => p === 'startDate' || p === 'dueDate';
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    // Mandatory fields for insert3
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      op !== 'insert3'
        ? []
        : (MANDATORY_FIELDS[op] || []).map<INodeProperties>(p => {
            if (isProjectTypeParam(p))
              return { displayName: 'Project Type', name: p, type: 'options', options: ProjectTypeOptions, default: 3, description: `${p} parameter for ${op} (ProjectType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
            if (p === 'projectID')
              return { displayName: 'Project ID', name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
            if (p === 'jobTypeShort')
              return { displayName: 'Job Type Short', name: p, type: 'string', default: '', description: `${p} parameter for ${op} (string)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
            return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
          })
    ),
  
    // Standard properties for other operations
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      op === 'insert3'
        ? []
        : params.map<INodeProperties>(p => {
            if (isProjectTypeParam(p))
              return { displayName: 'Project Type', name: p, type: 'options', options: ProjectTypeOptions, default: 3, description: `${p} parameter for ${op} (ProjectType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
            if (p === 'enableNullOrEmptyValues')
              return { displayName: 'Overwrite with Empty Values', name: p, type: 'boolean', default: false, description: 'If enabled, empty inputs overwrite existing values in Plunet. If disabled, empty inputs are ignored.', displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
            if (isNumericParam(p))
              return { displayName: p, name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
            if (isDateParam(p))
              return { displayName: p, name: p, type: 'dateTime', default: '', description: `${p} parameter for ${op} (date)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
            return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
          })
    ),
  
    // Optional JobIN fields (for insert3 + update)
    ...(['insert3', 'update'] as const).map(op => ({
      displayName: 'Additional Fields',
      name: 'additionalFields',
      type: 'collection' as const,
      placeholder: 'Add Field',
      default: {},
      options: [
        { displayName: 'Contact Person ID', name: 'contactPersonID', type: 'number' as const, default: 0, typeOptions: { minValue: 0, step: 1 }, description: 'number' },
        { displayName: 'Item ID', name: 'itemID', type: 'number' as const, default: 0, typeOptions: { minValue: 0, step: 1 }, description: 'number' },
        { displayName: 'Start Date', name: 'startDate', type: 'dateTime' as const, default: '' },
        { displayName: 'Due Date', name: 'dueDate', type: 'dateTime' as const, default: '' },
        { displayName: 'Status', name: 'status', type: 'options' as const, options: [{ name: 'Please select...', value: '' }, ...JobStatusOptions], default: '' },
      ],
      description: 'Additional job fields to include (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
    })),

    // Search operation fields (ordered as requested)
    {
      displayName: 'Job Status',
      name: 'job_Status',
      type: 'options',
      options: [{ name: 'Any', value: '' }, ...JobStatusOptions],
      default: '',
      description: 'Filter by job status (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Job Resource ID',
      name: 'job_resourceID',
      type: 'number',
      default: undefined,
      typeOptions: { minValue: 0, step: 1 },
      description: 'Filter by resource ID (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Customer ID',
      name: 'customerID',
      type: 'number',
      default: undefined,
      typeOptions: { minValue: 0, step: 1 },
      description: 'Filter by customer ID (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Item Status',
      name: 'item_Status',
      type: 'options',
      options: [{ name: 'Any', value: '' }, ...ItemStatusOptions],
      default: '',
      description: 'Filter by item status (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Job Abbreviation',
      name: 'jobAbbreviation',
      type: 'string',
      default: '',
      description: 'Filter by job abbreviation (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Job Source Language',
      name: 'job_SourceLanguage',
      type: 'string',
      default: '',
      description: 'Filter by source language (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Job Target Language',
      name: 'job_TargetLanguage',
      type: 'string',
      default: '',
      description: 'Filter by target language (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Job Creation Date From',
      name: 'job_CreationDate_from',
      type: 'dateTime',
      default: '',
      description: 'Filter jobs created from this date (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
    {
      displayName: 'Job Creation Date To',
      name: 'job_CreationDate_to',
      type: 'dateTime',
      default: '',
      description: 'Filter jobs created until this date (optional)',
      displayOptions: { show: { resource: [RESOURCE], operation: ['search'] } },
    },
  ];
  
  function toSoapParamValue(raw: unknown, paramName: string): string {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'boolean') return NUMERIC_BOOLEAN_PARAMS.has(paramName) ? (raw ? '1' : '0') : raw ? 'true' : 'false';
    return String(raw);
  }
  
  
  function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return {
      url,
      soapActionFor: (op: string) => `http://API.Integration/${op}`,
      paramOrder: PARAM_ORDER,
      numericBooleans: NUMERIC_BOOLEAN_PARAMS,
      getSessionId: async (ctx: IExecuteFunctions) => ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0),
      buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
        if (op === 'insert3') {
          const projectID = itemParams.projectID as number;
          const projectType = itemParams.projectType as number;
          const jobTypeShort = itemParams.jobTypeShort as string;
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          const selected = Object.keys(additionalFields).filter(k => additionalFields[k] !== '' && additionalFields[k] != null);
          let jobInXml = '<JobIN>';
          jobInXml += `<projectID>${escapeXml(String(projectID))}</projectID>`;
          jobInXml += `<projectType>${escapeXml(String(projectType))}</projectType>`;
          selected.forEach(key => {
            const value = additionalFields[key];
            const xmlValue = key === 'startDate' || key === 'dueDate'
              ? typeof value === 'string' && value ? value : value instanceof Date ? value.toISOString() : ''
              : toSoapParamValue(value, key);
            if (xmlValue) jobInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
          });
          jobInXml += '</JobIN>';
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${jobInXml}\n<JobTypeShort>${escapeXml(jobTypeShort)}</JobTypeShort>`;
        }
        if (op === 'update') {
          const jobID = itemParams.jobID as number;
          const additionalFields = ctx.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
          const selected = Object.keys(additionalFields).filter(k => additionalFields[k] !== '' && additionalFields[k] != null);
          let jobInXml = '<JobIN>';
          jobInXml += `<jobID>${escapeXml(String(jobID))}</jobID>`;
          selected.forEach(key => {
            const value = additionalFields[key];
            const xmlValue = key === 'startDate' || key === 'dueDate'
              ? typeof value === 'string' && value ? value : value instanceof Date ? value.toISOString() : ''
              : toSoapParamValue(value, key);
            if (xmlValue) jobInXml += `<${key}>${escapeXml(xmlValue)}</${key}>`;
          });
          jobInXml += '</JobIN>';
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${jobInXml}`;
        }
        if (op === 'search') {
          // Get search filter parameters
          const customerID = ctx.getNodeParameter('customerID', itemIndex, undefined) as number | undefined;
          const item_Status = ctx.getNodeParameter('item_Status', itemIndex, '') as string;
          const jobAbbreviation = ctx.getNodeParameter('jobAbbreviation', itemIndex, '') as string;
          const job_CreationDate_from = ctx.getNodeParameter('job_CreationDate_from', itemIndex, '') as string;
          const job_CreationDate_to = ctx.getNodeParameter('job_CreationDate_to', itemIndex, '') as string;
          const job_SourceLanguage = ctx.getNodeParameter('job_SourceLanguage', itemIndex, '') as string;
          const job_Status = ctx.getNodeParameter('job_Status', itemIndex, '') as string;
          const job_TargetLanguage = ctx.getNodeParameter('job_TargetLanguage', itemIndex, '') as string;
          const job_resourceID = ctx.getNodeParameter('job_resourceID', itemIndex, undefined) as number | undefined;

          // Build SearchFilter_Job XML - include ALL fields, even if empty
          let searchFilterXml = '<SearchFilter_Job>';
          
          // Always include customerID (empty if not set)
          const customerIDValue = (customerID !== undefined && customerID !== null) ? String(customerID) : '';
          searchFilterXml += `<customerID>${escapeXml(customerIDValue)}</customerID>`;
          
          // Always include item_Status (empty if not set)
          const itemStatusValue = (item_Status && item_Status !== '') ? String(item_Status) : '';
          searchFilterXml += `<item_Status>${escapeXml(itemStatusValue)}</item_Status>`;
          
          // Always include jobAbbreviation (empty if not set)
          searchFilterXml += `<jobAbbreviation>${escapeXml(jobAbbreviation || '')}</jobAbbreviation>`;
          
          // Always include job_CreationDate_from (empty if not set)
          searchFilterXml += `<job_CreationDate_from>${escapeXml(job_CreationDate_from || '')}</job_CreationDate_from>`;
          
          // Always include job_CreationDate_to (empty if not set)
          searchFilterXml += `<job_CreationDate_to>${escapeXml(job_CreationDate_to || '')}</job_CreationDate_to>`;
          
          // Always include job_SourceLanguage (empty if not set)
          searchFilterXml += `<job_SourceLanguage>${escapeXml(job_SourceLanguage || '')}</job_SourceLanguage>`;
          
          // Always include job_Status (empty if not set)
          const jobStatusValue = (job_Status && job_Status !== '') ? String(job_Status) : '';
          searchFilterXml += `<job_Status>${escapeXml(jobStatusValue)}</job_Status>`;
          
          // Always include job_TargetLanguage (empty if not set)
          searchFilterXml += `<job_TargetLanguage>${escapeXml(job_TargetLanguage || '')}</job_TargetLanguage>`;
          
          // Always include job_resourceID (empty if not set)
          const resourceIDValue = (job_resourceID !== undefined && job_resourceID !== null) ? String(job_resourceID) : '';
          searchFilterXml += `<job_resourceID>${escapeXml(resourceIDValue)}</job_resourceID>`;
          
          searchFilterXml += '</SearchFilter_Job>';
          
          return `<UUID>${escapeXml(sessionId)}</UUID>\n${searchFilterXml}`;
        }
        return null;
      },
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op];
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
          case 'Void': {
            const r = parseVoidResult(xml);
            if (!r.ok) {
              const msg = r.statusMessage || 'Operation failed';
              throw new NodeOperationError({} as any, `${op}: ${msg}${r.statusCode !== undefined ? ` [${r.statusCode}]` : ''}`, { itemIndex: 0 });
            }
            payload = { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
            break;
          }
          case 'String': {
            const r = parseStringResult(xml);
            payload = { data: r.data ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
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
  
  export const DataJob30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core operations for DataJob30',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
      const paramNames = PARAM_ORDER[operation];
      if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
      
      // Use different endpoint for search operation (ReportJob30)
      const opConfig = Object.values(OPERATION_REGISTRY).find(op => op.soapAction === operation);
      const actualUrl = opConfig?.endpoint === 'ReportJob30' 
        ? url.replace('/DataJob30', '/ReportJob30')
        : url;
      
      const config = createExecuteConfig(creds, actualUrl, baseUrl, timeoutMs);
      const itemParams: IDataObject = {};
      
      // For search operation, paramNames is empty but we still need to pass an empty object
      if (paramNames.length === 0 && operation === 'search') {
        // Search operation handles parameters directly in buildCustomBodyXml
        itemParams._searchOperation = true; // Marker to indicate this is a search operation
      } else {
        for (const paramName of paramNames) itemParams[paramName] = ctx.getNodeParameter(paramName, itemIndex, '');
      }
      
      const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
      return Array.isArray(result) ? result[0] || {} : result;
    },
  };
  