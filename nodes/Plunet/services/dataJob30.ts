import {
    IExecuteFunctions,
    IDataObject,
    INodeProperties,
    INodePropertyOptions,
    NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
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
} from '../core/service-utils';

const RESOURCE = 'DataJob30';

/** ─────────────────────────────────────────────────────────────────────────────
 *  Operation → parameters (order matters). UUID is auto-included.
 *  ─────────────────────────────────────────────────────────────────────────── */
const PARAM_ORDER: Record<string, string[]> = {
    addJobTrackingTime: ['jobID', 'projectType', ...JOB_TRACKING_TIME_IN_FIELDS],
    addJobTrackingTimesList: ['jobID', 'projectType', 'JobTrackingTimeListIN'], // TODO: Expand this
    assignJob: ['projectType', 'jobID', 'resourceID'],
    deleteJob: ['jobID', 'projectType'],
    deletePriceLine: ['jobID', 'projectType', 'priceLineID'],
    getActionLink: ['projectType', 'jobID', 'userID', 'actionLinkType'],
    getComment: ['projectType', 'jobID'],
    getContactPersonID: ['projectType', 'jobID'],
    getCreationDate: ['projectType', 'jobID'],
    getCurrency: ['jobID', 'projectType'],
    getDeliveryDate: ['projectType', 'jobID'],
    getDeliveryNote: ['projectType', 'jobID'],
    getDescription: ['projectType', 'jobID'],
    getDownloadUrl_SourceData: ['targetFileName', 'projectType', 'jobID'],
    getDueDate: ['projectType', 'jobID'],
    getItemIndependentJobs: ['projectType', 'projectId'],
    getJobMetrics: ['jobID', 'projectType', 'languageCode'],
    getJobNumber: ['projectType', 'jobID'],
    getJobList_ForView: ['jobIDs', 'projectType'],
    getJobListOfItem_ForView: ['itemID', 'projectType'],
    getJobTrackingTimesList: ['jobID', 'projectType'],
    getJob_ForView: ['jobID', 'projectType'],
    getPayableID: ['jobID', 'projectType'],
    getPriceLine_List: ['jobID', 'projectType'],
    getPriceLine_ListByCurrencyType: ['jobID', 'projectType', 'currencyType'],
    getPriceUnit: ['PriceUnitID', 'languageCode'],
    getPriceUnit_List: ['languageCode', 'service'],
    getPricelist: ['jobID', 'projectType'],
    getPricelistEntry_List: ['PricelistID', 'SourceLanguage', 'TargetLanguage'],
    getPricelist_List: ['jobID', 'projectType'],
    getResourceContactPersonID: ['projectType', 'jobID'],
    getResourceID: ['projectType', 'jobID'],
    getJobType_LongName: ['projectType', 'jobID'],
    getJobType_ShortName: ['projectType', 'jobID'],
    getServices_List: ['languageCode'],
    insert: ['projectID', 'projectType', 'jobTypeAbbrevation'],
    insert2: ['projectID', 'projectType', 'jobTypeAbbrevation', 'itemID'],
    insert3: [...JOB_IN_FIELDS, 'JobTypeShort'],
    insertPriceLine: ['jobID', 'projectType', ...PRICE_LINE_IN_FIELDS, 'createAsFirstItem'],
    runAutomaticJob: ['jobID', 'projectType'],
    setCatReport: ['pathOrUrl', 'overwriteExistingPriceLines', 'catType', 'projectType', 'analyzeAndCopyResultToJob', 'jobID'],
    setCatReport2: ['FileByteStream', 'FilePathName', 'Filesize', 'catType', 'projectType', 'analyzeAndCopyResultToJob', 'jobID'],
    setComment: ['projectType', 'jobID', 'comment'],
    setContactPersonID: ['projectType', 'jobID', 'resourceID'],
    setDeliveryNote: ['projectType', 'jobID', 'note'],
    setDescription: ['projectType', 'jobID', 'description'],
    setDueDate: ['projectType', 'dueDate', 'jobID'],
    setItemID: ['projectType', 'itemID', 'jobID'],
    setJobStatus: ['projectType', 'jobID', 'status'],
    setPriceListeID: ['projectType', 'priceListID', 'jobID'],
    setPricelist: ['jobID', 'projectType', 'priceListID'],
    setResourceContactPersonID: ['projectType', 'jobID', 'contactID'],
    setResourceID: ['projectType', 'resourceID', 'jobID'],
    setStartDate: ['projectType', 'startDate', 'jobID'],
    update: [...JOB_IN_FIELDS, 'enableNullOrEmptyValues'],
    updatePriceLine: ['jobID', 'projectType', ...PRICE_LINE_IN_FIELDS],
};

/** Return types (so we can dispatch to typed parsers) */
type R =
    | 'Void' | 'String' | 'Integer' | 'IntegerArray' | 'Date'
    | 'Job' | 'JobList' | 'JobMetric'
    | 'PriceLine' | 'PriceLineList'
    | 'PriceUnit' | 'PriceUnitList'
    | 'Pricelist' | 'PricelistList' | 'PricelistEntryList'
    | 'JobTrackingTimeList' | 'StringArray';

const RETURN_TYPE: Record<string, R> = {
    addJobTrackingTime: 'Void',
    addJobTrackingTimesList: 'Void',
    assignJob: 'Void',
    deleteJob: 'Void',
    deletePriceLine: 'Void',
    getActionLink: 'String',
    getComment: 'String',
    getContactPersonID: 'Integer',
    getCreationDate: 'Date',
    getCurrency: 'String',
    getDeliveryDate: 'Date',
    getDeliveryNote: 'String',
    getDescription: 'String',
    getDownloadUrl_SourceData: 'String',
    getDueDate: 'Date',
    getItemIndependentJobs: 'JobList',
    getJobMetrics: 'JobMetric',
    getJobNumber: 'String',
    getJobList_ForView: 'JobList',
    getJobListOfItem_ForView: 'JobList',
    getJobTrackingTimesList: 'JobTrackingTimeList',
    getJob_ForView: 'Job',
    getPayableID: 'Integer',
    getPriceLine_List: 'PriceLineList',
    getPriceLine_ListByCurrencyType: 'PriceLineList',
    getPriceUnit: 'PriceUnit',
    getPriceUnit_List: 'PriceUnitList',
    getPricelist: 'Pricelist',
    getPricelistEntry_List: 'PricelistEntryList',
    getPricelist_List: 'PricelistList',
    getResourceContactPersonID: 'Integer',
    getResourceID: 'Integer',
    getJobType_LongName: 'String',
    getJobType_ShortName: 'String',
    getServices_List: 'StringArray',
    insert: 'Integer',
    insert2: 'Integer',
    insert3: 'Integer',
    insertPriceLine: 'PriceLine',
    runAutomaticJob: 'Void',
    setCatReport: 'Void',
    setCatReport2: 'Void',
    setComment: 'Void',
    setContactPersonID: 'Void',
    setDeliveryNote: 'Void',
    setDescription: 'Void',
    setDueDate: 'Void',
    setItemID: 'Void',
    setJobStatus: 'Void',
    setPriceListeID: 'Void',
    setPricelist: 'Void',
    setResourceContactPersonID: 'Void',
    setResourceID: 'Void',
    setStartDate: 'Void',
    update: 'Void',
    updatePriceLine: 'PriceLine',
};

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

const FRIENDLY_LABEL: Record<string, string> = {
    getJob_ForView: 'Get Job',
    getJobList_ForView: 'Get Jobs (by IDs)',
    getJobListOfItem_ForView: 'Get Jobs for Item',
    insert: 'Create Job',
    insert2: 'Create Job (with Item)',
    insert3: 'Create Job (from Object)',
    update: 'Update Job',
    deleteJob: 'Delete Job',
    assignJob: 'Assign Job',
    setJobStatus: 'Set Job Status',
    getJobMetrics: 'Get Job Metrics',
    getPriceLine_List: 'Get Price Lines',
    insertPriceLine: 'Add Price Line',
    updatePriceLine: 'Update Price Line',
    deletePriceLine: 'Delete Price Line',
    getPricelist: 'Get Pricelist',
    setPricelist: 'Set Pricelist',
    setPriceListeID: 'Set Pricelist (by ID)',
    getPricelist_List: 'Get Pricelists (Job)',
    getPricelistEntry_List: 'Get Pricelist Entries',
    getPriceUnit_List: 'Get Price Units',
    getPriceUnit: 'Get Price Unit',
    getServices_List: 'Get Services',
    getActionLink: 'Get Action Link',
    runAutomaticJob: 'Run Automatic Job',
};

const OP_ORDER: string[] = [
    'getJob_ForView', 'getJobList_ForView', 'getJobListOfItem_ForView',
    'insert', 'insert2', 'insert3', 'update', 'deleteJob',
    'assignJob', 'setJobStatus', 'getJobMetrics',
    'getPriceLine_List', 'insertPriceLine', 'updatePriceLine', 'deletePriceLine',
    'getPricelist', 'setPricelist', 'setPriceListeID', 'getPricelist_List', 'getPricelistEntry_List',
    'getPriceUnit_List', 'getPriceUnit', 'getServices_List',
    'getActionLink', 'runAutomaticJob',
];

const operationOptions: NonEmptyArray<INodePropertyOptions> = asNonEmpty(
    [...new Set([...OP_ORDER, ...Object.keys(PARAM_ORDER)])]
        .filter((op) => op in PARAM_ORDER)
        .map((op) => {
            const label = FRIENDLY_LABEL[op] ?? labelize(op);
            return { name: label, value: op, action: label, description: `Call ${label} on ${RESOURCE}` };
        }),
) as NonEmptyArray<INodePropertyOptions>;

// Make update.enableNullOrEmptyValues a boolean; plus enum dropdowns
const extraProperties: INodeProperties[] = Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
    params.map<INodeProperties>((p) => {
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
    }),
);

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
        buildCustomBodyXml: () => null, // No custom body building needed for job operations
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
    resourceDisplayName: 'Jobs (DataJob30)',
    resourceDescription: 'Job-related endpoints',
    endpoint: 'DataJob30',
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

        const result = await executeOperation(ctx, operation, itemParams, config);
        // Ensure we return a single IDataObject, not an array
        return Array.isArray(result) ? result[0] || {} : result;
    },
};