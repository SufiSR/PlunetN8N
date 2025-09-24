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
  import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
  import { extractStatusMessage, parseStringResult, parseIntegerResult, parseVoidResult, parseDateResult } from '../core/xml';
  import { parseJobListResult } from '../core/parsers/job';
  import { ProjectTypeOptions } from '../enums/project-type';
  import { JobStatusOptions } from '../enums/job-status';
  import { generateOperationOptionsFromRegistry } from '../core/service-utils';
  
  const RESOURCE = 'DataJob30Misc';
  const ENDPOINT = 'DataJob30';
  const RESOURCE_DISPLAY_NAME = 'Job Fields';
  
  /** ─ Centralized Operation Registry ─ */
  const OPERATION_REGISTRY: ServiceOperationRegistry = {
    // ── Active ops ──
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
  
    // ── Inactive ops (kept for reference) ──
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
      paramOrder: ['jobID', 'projectType'], // simplified; original had JOB_TRACKING_TIME_IN_FIELDS
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
      active: false,
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
  };
  
  /** ─ Derived mappings (actives only) ─ */
  const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
  );
  
  type R = 'Void' | 'String' | 'Integer' | 'Date' | 'JobList';
  
  const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType as R])
  );
  
  /** ─ UI wiring (lean) ─ */
  const isProjectTypeParam = (p: string) => p.toLowerCase() === 'projecttype';
  const isJobStatusParam = (op: string, p: string) => op === 'setJobStatus' && p === 'status';
  const isCatTypeParam = (op: string, p: string) => op === 'setCatReport2' && p === 'catType';
  const isBooleanFlagParam = (op: string, p: string) => op === 'setCatReport2' && (p === 'analyzeAndCopyResultToJob');
  const NUMERIC_PARAM_NAMES = new Set(['jobID', 'projectID', 'resourceID', 'itemID', 'userID', 'contactID', 'projectId', 'Filesize']);
  const isNumericParam = (p: string) => NUMERIC_PARAM_NAMES.has(p);
  const isDateParam = (p: string) => p === 'startDate' || p === 'dueDate' || p === 'deliveryDate' || p === 'endDate' || p === 'dateInitialContact';
  
  const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);
  
  const extraProperties: INodeProperties[] = [
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
      params.map<INodeProperties>(p => {
        if (isProjectTypeParam(p))
          return { displayName: 'Project Type', name: p, type: 'options', options: ProjectTypeOptions, default: 3, description: `${p} parameter for ${op} (ProjectType enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isJobStatusParam(op, p))
          return { displayName: 'Status', name: p, type: 'options', options: JobStatusOptions, default: 0, description: `${p} parameter for ${op} (JobStatus enum)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isCatTypeParam(op, p))
          return { displayName: 'CAT Type', name: p, type: 'string', default: '', description: `${p} parameter for ${op}` , displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isBooleanFlagParam(op, p))
          return { displayName: p, name: p, type: 'boolean', default: false, description: `${p} parameter for ${op} (boolean)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isNumericParam(p))
          return { displayName: p, name: p, type: 'number', default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${p} parameter for ${op} (number)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        if (isDateParam(p))
          return { displayName: p, name: p, type: 'dateTime', default: '', description: `${p} parameter for ${op} (date)`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
        return { displayName: p, name: p, type: 'string', default: '', description: `${p} parameter for ${op}`, displayOptions: { show: { resource: [RESOURCE], operation: [op] } } };
      })
    ),
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
      buildCustomBodyXml: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => null,
      parseResult: (xml: string, op: string) => {
        const rt = RETURN_TYPE[op] as R | undefined;
        let payload: IDataObject;
        switch (rt) {
          case 'JobList': {
            const r = parseJobListResult(xml);
            payload = { jobs: r.jobs, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
          case 'Date': {
            const r = parseDateResult(xml);
            payload = { date: r.date ?? '', statusMessage: r.statusMessage, statusCode: r.statusCode };
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
          default: {
            payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
          }
        }
        return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
      },
    };
  }
  
  /** ─ Service export ─ */
  export const DataJob30MiscService: Service = {
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
  