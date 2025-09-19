import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray } from '../core/types';
import { ensureSession } from '../core/session';
import { executeOperation, type ExecuteConfig } from '../core/executor';
import { labelize, asNonEmpty } from '../core/utils';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import {
    extractResultBase, extractStatusMessage, extractSoapFault, parseIntegerResult, parseIntegerArrayResult, parseVoidResult,
} from '../core/xml';
// import { parseCustomerResult } from '../core/parsers'; // Removed: not exported from '../core/parsers'
import { CustomerStatusOptions } from '../enums/customer-status';
import {
    toSoapParamValue,
    escapeXml,
    createStandardExecuteConfig,
    executeStandardService,
    generateOperationOptions,
    createStringProperty,
    createBooleanProperty,
    createOptionsProperty,
    createTypedProperty,
    handleVoidResult,
    buildSearchFilterXml,
} from '../core/service-utils';
import {
    CUSTOMER_IN_FIELDS,
    CUSTOMER_SEARCH_FILTER_FIELDS,
    MANDATORY_FIELDS,
    FIELD_TYPES,
} from '../core/field-definitions';
import { parseCustomerResult } from '../core/parsers/customer';

const RESOURCE = 'DataCustomer30Core';
const ENDPOINT = 'DataCustomer30';

/** ─ Params per operation (UUID auto-included) ─ */
const PARAM_ORDER: Record<string, string[]> = {
    insert2: [...CUSTOMER_IN_FIELDS.filter(f => f !== 'customerID')],
    update: [
        'customerID', 'status', ...CUSTOMER_IN_FIELDS.filter(f => f !== 'customerID' && f !== 'status'),
        'enableNullOrEmptyValues',
    ],
    delete: ['customerID'],
    getCustomerObject: ['customerID'],
};

type R = 'Void'|'String'|'Integer'|'IntegerArray'|'Customer';
const RETURN_TYPE: Record<string, R> = {
    insert2: 'Integer',
    update: 'Void',
    delete: 'Void',
    getCustomerObject: 'Customer',
};

/** ─ UI wiring ─ */
const FRIENDLY_LABEL: Record<string,string> = {
    insert2: 'Create Customer',
    update: 'Update Customer',
    delete: 'Delete Customer',
    getCustomerObject: 'Get Customer',
};

const OP_ORDER = ['getCustomerObject','insert2','update','delete'] as const;

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptions(
    OP_ORDER,
    FRIENDLY_LABEL,
    ENDPOINT,
);

const extraProperties: INodeProperties[] =
    Object.entries(PARAM_ORDER).flatMap(([op, params]) =>
        params.map<INodeProperties>((p) => {
            const isMandatory = MANDATORY_FIELDS[op]?.includes(p) || false;
            const fieldType = FIELD_TYPES[p] || 'string';
            
            // Handle special cases
            if (p.toLowerCase() === 'status') {
                return createTypedProperty(
                    p,
                    'Status',
                    `${p} parameter for ${op} (CustomerStatus enum)`,
                    RESOURCE,
                    op,
                    'string',
                    isMandatory,
                    CustomerStatusOptions,
                    1,
                );
            }
            if (op === 'update' && p === 'enableNullOrEmptyValues') {
                return createBooleanProperty(
                    p,
                    'Overwrite with Empty Values',
                    'If enabled, empty inputs overwrite existing values in Plunet.',
                    RESOURCE,
                    op,
                    false,
                    true,
                );
            }
            
            // Create user-friendly display names
            const displayName = labelize(p);
            
            return createTypedProperty(
                p,
                displayName,
                `${displayName} parameter for ${op}`,
                RESOURCE,
                op,
                fieldType,
                isMandatory,
            );
        }),
    );

// Field definitions are now imported from field-definitions.ts

// Build <CustomerIN>…</CustomerIN>. If includeEmpty=true, sends empty tags too.
function buildCustomerINXml(
    ctx: IExecuteFunctions,
    itemIndex: number,
    fields: readonly string[],
    includeEmpty: boolean,
): string {
    const lines: string[] = ['<CustomerIN>'];
    for (const name of fields) {
        try {
            const raw = ctx.getNodeParameter(name, itemIndex, '');
            const val = toSoapParamValue(raw, name);
            if (includeEmpty || val !== '') {
                lines.push(`  <${name}>${escapeXml(val)}</${name}>`);
            }
        } catch (error) {
            // Log the error and continue with empty value
            const errorMsg = `Error getting parameter '${name}' for item ${itemIndex}: ${error instanceof Error ? error.message : String(error)}`;
            // In n8n context, errors will be visible in the workflow execution logs
            // Add empty tag to maintain XML structure
            lines.push(`  <${name}></${name}>`);
        }
    }
    lines.push('</CustomerIN>');
    return lines.join('\n      ');
}

// Build <SearchFilter_Customer>…</SearchFilter_Customer>

// Common utility functions are now imported from service-utils

// Create the execution configuration
function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
    return createStandardExecuteConfig(
        creds,
        url,
        baseUrl,
        timeoutMs,
        PARAM_ORDER,
        (xml: string, op: string) => {
            const rt = RETURN_TYPE[op] as R|undefined;
            let payload: IDataObject;
            switch (rt) {
                case 'Customer': {
                    const r = parseCustomerResult(xml);
                    payload = { customer: r.customer, statusMessage: r.statusMessage, statusCode: r.statusCode };
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
                    payload = handleVoidResult(xml, op, parseVoidResult);
                    break;
                }
                default: {
                    payload = { statusMessage: extractStatusMessage(xml), rawResponse: xml };
                }
            }
            return { success: true, resource: RESOURCE, operation: op, ...payload } as IDataObject;
        },
        (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => {
            if (op === 'update') {
                // Build <CustomerIN>…> with the update fields,
                // include empty tags only if user chose to overwrite with empty values
                const en = itemParams.enableNullOrEmptyValues as boolean || false;
                const customerIn = buildCustomerINXml(ctx, itemIndex, CUSTOMER_IN_FIELDS, en);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${customerIn}\n<enableNullOrEmptyValues>${en ? '1' : '0'}</enableNullOrEmptyValues>`;
            } else if (op === 'insert2') {
                const customerIn = buildCustomerINXml(ctx, itemIndex, CUSTOMER_IN_FIELDS, false);
                return `<UUID>${escapeXml(sessionId)}</UUID>\n${customerIn}`;
            }
            return null;
        },
    );
}

/** ─ Service export ─ */
export const DataCustomer30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: 'Customers (Core)',
    resourceDescription: 'Core operations for DataCustomer30',
    endpoint: ENDPOINT,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
        return await executeStandardService(
            operation,
            ctx,
            creds,
            url,
            baseUrl,
            timeoutMs,
            itemIndex,
            PARAM_ORDER,
            config,
        );
    },
};