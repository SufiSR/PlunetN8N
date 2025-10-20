// nodes/Plunet/core/service-utils.ts
import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions, NodeOperationError,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, OperationMetadata, ServiceOperationRegistry } from './types';
import type { ExecuteConfig } from './executor';
import { ensureSession } from './session';
import { executeOperation } from './executor';
import { labelize, asNonEmpty } from './utils';
import { NUMERIC_BOOLEAN_PARAMS } from './constants';
import { extractStatusMessage } from './xml';
import { escapeXml } from './soap';

// ============================================================================
// COMMON UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert raw parameter values to SOAP-compatible strings
 */
export function toSoapParamValue(raw: unknown, paramName: string): string {
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

// escapeXml function moved to soap.ts to avoid duplication

// ============================================================================
// COMMON SERVICE CONFIGURATION
// ============================================================================

/**
 * Create a standard execution configuration for services
 */
export function createStandardExecuteConfig(
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    paramOrder: Record<string, string[]>,
    parseResult: (xml: string, op: string) => IDataObject,
    buildCustomBodyXml?: (op: string, itemParams: IDataObject, sessionId: string, ctx: IExecuteFunctions, itemIndex: number) => string | null,
): ExecuteConfig {
    return {
        url,
        soapActionFor: (op: string) => `http://API.Integration/${op}`,
        paramOrder,
        numericBooleans: NUMERIC_BOOLEAN_PARAMS,
        getSessionId: async (ctx: IExecuteFunctions, itemIndex: number) => {
            return await ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, itemIndex);
        },
        buildCustomBodyXml: buildCustomBodyXml || (() => null),
        parseResult,
        creds, // Pass credentials for debug mode
    };
}

// ============================================================================
// COMMON SERVICE EXECUTION
// ============================================================================

/**
 * Standard service execution logic
 */
export async function executeStandardService(
    operation: string,
    ctx: IExecuteFunctions,
    creds: Creds,
    url: string,
    baseUrl: string,
    timeoutMs: number,
    itemIndex: number,
    paramOrder: Record<string, string[]>,
    config: ExecuteConfig,
): Promise<IDataObject> {
    const paramNames = paramOrder[operation];
    if (!paramNames) {
        throw new Error(`Unsupported operation: ${operation}`);
    }

    // Get parameters from the context
    const itemParams: IDataObject = {};
    for (const paramName of paramNames) {
        itemParams[paramName] = ctx.getNodeParameter(paramName, itemIndex, '');
    }

    const result = await executeOperation(ctx, operation, itemParams, config, itemIndex);
    // Ensure we return a single IDataObject, not an array
    return Array.isArray(result) ? result[0] || {} : result;
}

// ============================================================================
// COMMON UI PROPERTY GENERATION
// ============================================================================

/**
 * Generate operation options from operation list
 */
export function generateOperationOptions(
    operations: readonly string[],
    friendlyLabels: Record<string, string>,
    endpoint: string,
): NonEmptyArray<INodePropertyOptions> {
    const options = operations.map((op) => {
        const label = friendlyLabels[op] ?? labelize(op);
        return { 
            name: label, 
            value: op, 
            action: label, 
            description: `Call ${label} on ${endpoint}` 
        };
    });
    return asNonEmpty(options) as NonEmptyArray<INodePropertyOptions>;
}

/**
 * Generate operation options from parameter order keys
 */
export function generateOperationOptionsFromParams(
    paramOrder: Record<string, string[]>,
    friendlyLabels: Record<string, string>,
    endpoint: string,
): NonEmptyArray<INodePropertyOptions> {
    const options = Object.keys(paramOrder).sort().map((op) => {
        const label = friendlyLabels[op] ?? labelize(op);
        return { 
            name: label, 
            value: op, 
            action: label, 
            description: `Call ${label} on ${endpoint}` 
        };
    });
    return asNonEmpty(options) as NonEmptyArray<INodePropertyOptions>;
}

/**
 * Generate operation options from operation registry
 */
export function generateOperationOptionsFromRegistry(
    operationRegistry: ServiceOperationRegistry,
): NonEmptyArray<INodePropertyOptions> {
    const options = Object.values(operationRegistry)
        .filter((metadata) => metadata.active) // Only include active operations
        .map((metadata) => ({
            name: metadata.uiName,
            value: metadata.soapAction,
            action: metadata.uiName,
            description: metadata.description,
        }));
    return asNonEmpty(options) as NonEmptyArray<INodePropertyOptions>;
}

/**
 * Get operation metadata by SOAP action
 */
export function getOperationMetadata(
    operationRegistry: ServiceOperationRegistry,
    soapAction: string,
): OperationMetadata | undefined {
    return Object.values(operationRegistry).find(op => op.soapAction === soapAction);
}

/**
 * Build subtitle lookup table from operation registry
 */
export function buildSubtitleLookup(operationRegistry: ServiceOperationRegistry): Record<string, string> {
    const lookup: Record<string, string> = {};
    Object.values(operationRegistry)
        .filter((metadata) => metadata.active) // Only include active operations
        .forEach(metadata => {
            lookup[metadata.soapAction] = metadata.subtitleName;
        });
    return lookup;
}

/**
 * Create a standard string property
 */
export function createStringProperty(
    name: string,
    displayName: string,
    description: string,
    resource: string,
    operation: string,
    required: boolean = false,
): INodeProperties {
    return {
        displayName,
        name,
        type: 'string',
        default: '',
        required,
        description,
        displayOptions: { show: { resource: [resource], operation: [operation] } },
    };
}

/**
 * Create a date property
 */
export function createDateProperty(
    name: string,
    displayName: string,
    description: string,
    resource: string,
    operation: string,
    required: boolean = false,
): INodeProperties {
    return {
        displayName,
        name,
        type: 'dateTime',
        default: '',
        required,
        description,
        displayOptions: { show: { resource: [resource], operation: [operation] } },
    };
}

/**
 * Create a standard number property
 */
export function createNumberProperty(
    name: string,
    displayName: string,
    description: string,
    resource: string,
    operation: string,
    defaultValue: number = 0,
    required: boolean = false,
): INodeProperties {
    return {
        displayName,
        name,
        type: 'number',
        default: defaultValue,
        required,
        typeOptions: { minValue: 0, step: 1 },
        description,
        displayOptions: { show: { resource: [resource], operation: [operation] } },
    };
}

/**
 * Create a standard boolean property
 */
export function createBooleanProperty(
    name: string,
    displayName: string,
    description: string,
    resource: string,
    operation: string,
    defaultValue: boolean = false,
    required: boolean = false,
): INodeProperties {
    return {
        displayName,
        name,
        type: 'boolean',
        default: defaultValue,
        required,
        description,
        displayOptions: { show: { resource: [resource], operation: [operation] } },
    };
}

/**
 * Create an options property with enum values
 */
export function createOptionsProperty(
    name: string,
    displayName: string,
    description: string,
    resource: string,
    operation: string,
    options: INodePropertyOptions[],
    defaultValue: number | string = 0,
    required: boolean = false,
    addEmptyOption: boolean = false,
): INodeProperties {
    const finalOptions = addEmptyOption 
        ? [{ name: 'Please select...', value: '' }, ...options]
        : options;
    
    return {
        displayName,
        name,
        type: 'options',
        options: finalOptions,
        default: defaultValue,
        required,
        description,
        displayOptions: { show: { resource: [resource], operation: [operation] } },
    };
}

// ============================================================================
// COMMON ERROR HANDLING
// ============================================================================

/**
 * Standard error handling for void operations
 */
export function handleVoidResult(
    xml: string,
    operation: string,
    parseVoidResult: (xml: string) => { ok: boolean; statusMessage?: string; statusCode?: number },
    resource: string = 'Unknown',
): IDataObject {
    const r = parseVoidResult(xml);
    if (!r.ok) {
        const msg = r.statusMessage || 'Operation failed';
        throw new NodeOperationError(
            {} as any,
            `[${resource}] ${operation}: ${msg}${r.statusCode !== undefined ? ` [${r.statusCode}]` : ''}`,
            { itemIndex: 0 },
        );
    }
    return { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode };
}

/**
 * Standard error handling for operations with fallback
 */
export function handleResultWithFallback(
    xml: string,
    operation: string,
    parseFunction: (xml: string) => IDataObject,
    fallbackMessage = 'Operation failed',
): IDataObject {
    try {
        return parseFunction(xml);
    } catch (error) {
        return { 
            statusMessage: extractStatusMessage(xml) || fallbackMessage, 
            rawResponse: xml 
        };
    }
}

/**
 * Create a property based on field type and requirements
 */
export function createTypedProperty(
    name: string,
    displayName: string,
    description: string,
    resource: string,
    operation: string,
    fieldType: 'string' | 'number' | 'boolean' | 'date' = 'string',
    required: boolean = false,
    options?: INodePropertyOptions[],
    defaultValue?: any,
    addEmptyOption: boolean = false,
): INodeProperties {
    const baseProperty = {
        displayName,
        name,
        required,
        description,
        displayOptions: { show: { resource: [resource], operation: [operation] } },
    };

    switch (fieldType) {
        case 'number':
            return {
                ...baseProperty,
                type: 'number',
                default: defaultValue ?? 0,
                typeOptions: { minValue: 0, step: 1 },
            };
        case 'boolean':
            return {
                ...baseProperty,
                type: 'boolean',
                default: defaultValue ?? false,
            };
        case 'date':
            return {
                ...baseProperty,
                type: 'dateTime',
                default: defaultValue ?? '',
            };
        case 'string':
        default:
            if (options) {
                const finalOptions = addEmptyOption 
                    ? [{ name: 'Please select...', value: '' }, ...options]
                    : options;
                return {
                    ...baseProperty,
                    type: 'options',
                    options: finalOptions,
                    default: defaultValue ?? '',
                };
            }
            return {
                ...baseProperty,
                type: 'string',
                default: defaultValue ?? '',
            };
    }
}

/**
 * Build XML for search filter operations
 */
export function buildSearchFilterXml(
    ctx: IExecuteFunctions,
    itemIndex: number,
    fields: readonly string[],
    filterType: string = 'SearchFilter',
): string {
    const lines: string[] = [`<${filterType}>`];
    for (const name of fields) {
        const raw = ctx.getNodeParameter(name, itemIndex, '');
        const val = toSoapParamValue(raw, name);
        if (val !== '') {
            lines.push(`  <${name}>${escapeXml(val)}</${name}>`);
        } else {
            // Add empty tags as self-closing tags
            lines.push(`  <${name}/>`);
        }
    }
    lines.push(`</${filterType}>`);
    return lines.join('\n      ');
}
