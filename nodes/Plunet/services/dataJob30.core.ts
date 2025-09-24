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
  import { ProjectTypeOptions } from '../enums/project-type';
  import { JobStatusOptions } from '../enums/job-status';
  import { MANDATORY_FIELDS } from '../core/field-definitions';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  
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
  ) as Record<string, 'Void' | 'Integer' | 'String' | 'Job' | 'JobList'>;
  
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
  ];
  
  function toSoapParamValue(raw: unknown, paramName: string): string {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'boolean') return NUMERIC_BOOLEAN_PARAMS.has(paramName) ? (raw ? '1' : '0') : raw ? 'true' : 'false';
    return String(raw);
  }
  
  function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
    resourceDescription: 'Job-related endpoints',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
      const paramNames = PARAM_ORDER[operation];
      if (!paramNames) throw new Error(`Unsupported operation for ${RESOURCE}: ${operation}`);
      const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
      const itemParams: IDataObject = {};
      for (const paramName of paramNames) itemParams[paramName] = ctx.getNodeParameter(paramName, itemIndex, '');
      const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
      return Array.isArray(result) ? result[0] || {} : result;
    },
  };
  