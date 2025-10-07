import {
    IExecuteFunctions, IDataObject, INodeProperties, INodePropertyOptions,
} from 'n8n-workflow';
import type { Creds, Service, NonEmptyArray, ServiceOperationRegistry } from '../core/types';
import { createStandardExecuteConfig, executeStandardService, generateOperationOptionsFromRegistry, createTypedProperty, createBooleanProperty, createStringProperty } from '../core/service-utils';
import { labelize } from '../core/utils';
import { parseIntegerArrayResult, parseIntegerResult, parseVoidResult, extractStatusMessage } from '../core/xml';
import { parseCustomerContactListResult, parseCustomerContactResult } from '../core/parsers/customer-contact';
import { CUSTOMER_CONTACT_IN_FIELDS, MANDATORY_FIELDS, FIELD_TYPES } from '../core/field-definitions';
import { ContactPersonStatusOptions } from '../enums/contact-person-status';
import { idToName } from '../enums/types';

const RESOURCE = 'DataCustomerContact30Core';
const ENDPOINT = 'DataCustomerContact30';
const RESOURCE_DISPLAY_NAME = 'Customer Contact';

type R = 'Void'|'Integer'|'IntegerArray'|'CustomerContact'|'CustomerContactList';

// Operation registry
const OPERATION_REGISTRY: ServiceOperationRegistry = {
    getAllContactObjects: {
        soapAction: 'getAllContactObjects',
        endpoint: ENDPOINT,
        uiName: 'Get Many Contact Objects',
        subtitleName: 'get many: customer contact',
        titleName: 'Get Many Customer Contacts',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve all contact objects for a customer',
        returnType: 'CustomerContactList',
        paramOrder: ['CustomerID'],
        active: true,
    },
    getContactObject: {
        soapAction: 'getContactObject',
        endpoint: ENDPOINT,
        uiName: 'Get Contact Object',
        subtitleName: 'get: customer contact',
        titleName: 'Get a Customer Contact',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve a single customer contact by ID',
        returnType: 'CustomerContact',
        paramOrder: ['ContactID'],
        active: true,
    },
    seekByExternalID: {
        soapAction: 'seekByExternalID',
        endpoint: ENDPOINT,
        uiName: 'Get by External ID',
        subtitleName: 'get: contact by external ID',
        titleName: 'Find Contacts by External ID',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Retrieve contact IDs by external ID',
        returnType: 'IntegerArray',
        paramOrder: ['ExternalID'],
        active: true,
    },
    insert2: {
        soapAction: 'insert2',
        endpoint: ENDPOINT,
        uiName: 'Create Customer Contact',
        subtitleName: 'create: customer contact',
        titleName: 'Create a Customer Contact',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Create a new customer contact',
        returnType: 'Integer',
        paramOrder: [...CUSTOMER_CONTACT_IN_FIELDS.filter(f => f !== 'customerContactID')],
        active: true,
    },
    update: {
        soapAction: 'update',
        endpoint: ENDPOINT,
        uiName: 'Update Customer Contact',
        subtitleName: 'update: customer contact',
        titleName: 'Update a Customer Contact',
        resource: RESOURCE,
        resourceDisplayName: RESOURCE_DISPLAY_NAME,
        description: 'Update an existing customer contact',
        returnType: 'Void',
        paramOrder: ['customerContactID', 'status', ...CUSTOMER_CONTACT_IN_FIELDS.filter(f => f !== 'customerContactID' && f !== 'status'), 'enableNullOrEmptyValues'],
        active: true,
    },
};

const PARAM_ORDER: Record<string, string[]> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.paramOrder])
);

const RETURN_TYPE: Record<string, R> = Object.fromEntries(
    Object.values(OPERATION_REGISTRY).filter(op => op.active).map(op => [op.soapAction, op.returnType as R])
);

const operationOptions: NonEmptyArray<INodePropertyOptions> = generateOperationOptionsFromRegistry(OPERATION_REGISTRY);

const extraProperties: INodeProperties[] = [
    // Mandatory fields
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        const mandatoryFields = MANDATORY_FIELDS[
            op === 'getContactObject' ? 'contactGetContactObject' :
            op === 'getAllContactObjects' ? 'contactGetAllContactObjects' :
            op === 'seekByExternalID' ? 'contactSeekByExternalID' :
            op === 'insert2' ? 'contactInsert2' :
            op === 'update' ? 'contactUpdate' : op
        ] || [];
        // Ensure we only render each mandatory field once per operation
        const uniqueMandatory = Array.from(new Set(mandatoryFields));
        return uniqueMandatory.map<INodeProperties>((p) => {
            const fieldType = FIELD_TYPES[p] || 'string';
            if (p.toLowerCase() === 'status') {
                return createTypedProperty(
                    p,
                    'Status',
                    `${p} parameter for ${op} (ContactPersonStatus enum)`,
                    RESOURCE,
                    op,
                    'string',
                    true,
                    ContactPersonStatusOptions,
                    '',
                    true,
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
            const displayName = labelize(p);
            return createTypedProperty(
                p,
                displayName,
                `${displayName} parameter for ${op}`,
                RESOURCE,
                op,
                fieldType,
                true,
            );
        });
    }),
    // Optional fields collection for insert2/update
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        if (op !== 'insert2' && op !== 'update') return [];
        const mandatoryFields = MANDATORY_FIELDS[
            op === 'insert2' ? 'contactInsert2' :
            op === 'update' ? 'contactUpdate' : op
        ] || [];
        const optionalFields = CUSTOMER_CONTACT_IN_FIELDS.filter(f => !mandatoryFields.includes(f) && f !== 'customerContactID');
        const options = optionalFields.map(field => {
            const fieldType = FIELD_TYPES[field] || 'string';
            const displayName = labelize(field);
            if (field === 'status') {
                return { displayName: 'Status', name: field, type: 'options' as const, options: [{ name: 'Please select...', value: '' }, ...ContactPersonStatusOptions], default: '', description: `${field} parameter (ContactPersonStatus enum)` };
            }
            switch (fieldType) {
                case 'number':
                    return { displayName, name: field, type: 'number' as const, default: 0, typeOptions: { minValue: 0, step: 1 }, description: `${displayName} parameter` };
                default:
                    return { displayName, name: field, type: 'string' as const, default: '', description: `${displayName} parameter` };
            }
        });
        return [{
            displayName: 'Additional Fields',
            name: 'additionalFields',
            type: 'collection' as const,
            placeholder: 'Add Field',
            default: {},
            displayOptions: { show: { resource: [RESOURCE], operation: [op] } },
            options,
        }];
    }),
    // Other params not in DTO fields (avoid duplicating mandatory ones)
    ...Object.entries(PARAM_ORDER).flatMap(([op, params]) => {
        const mandatoryFields = MANDATORY_FIELDS[
            op === 'getContactObject' ? 'contactGetContactObject' :
            op === 'getAllContactObjects' ? 'contactGetAllContactObjects' :
            op === 'seekByExternalID' ? 'contactSeekByExternalID' :
            op === 'insert2' ? 'contactInsert2' :
            op === 'update' ? 'contactUpdate' : op
        ] || [];
        return params
            .filter(p => !(CUSTOMER_CONTACT_IN_FIELDS as readonly string[]).includes(p) && !mandatoryFields.includes(p))
            .map<INodeProperties>((p) => {
                const fieldType = (FIELD_TYPES as Record<string, 'string' | 'number' | 'boolean' | 'date'>)[p] || 'string';
                const displayName = labelize(p);
                return createTypedProperty(p, displayName, `${displayName} parameter for ${op}`, RESOURCE, op, fieldType, false);
            });
    }),
];

function createExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number) {
    return createStandardExecuteConfig(
        creds,
        url,
        baseUrl,
        timeoutMs,
        PARAM_ORDER,
        (xml: string, op: string) => {
            const rt = RETURN_TYPE[op] as R|undefined;
            switch (rt) {
                case 'CustomerContact': {
                    const r = parseCustomerContactResult(xml);
                    return { contact: r.contact, statusMessage: r.statusMessage, statusCode: r.statusCode } as IDataObject;
                }
                case 'CustomerContactList': {
                    const r = parseCustomerContactListResult(xml);
                    return { contacts: r.contacts, statusMessage: r.statusMessage, statusCode: r.statusCode } as IDataObject;
                }
                case 'Integer': {
                    const r = parseIntegerResult(xml);
                    return { value: r.value, statusMessage: r.statusMessage, statusCode: r.statusCode } as IDataObject;
                }
                case 'IntegerArray': {
                    const r = parseIntegerArrayResult(xml);
                    return { data: r.data, statusMessage: r.statusMessage, statusCode: r.statusCode } as IDataObject;
                }
                case 'Void': {
                    const r = parseVoidResult(xml);
                    return { ok: r.ok, statusMessage: r.statusMessage, statusCode: r.statusCode } as IDataObject;
                }
                default:
                    return { statusMessage: extractStatusMessage(xml), rawResponse: xml } as IDataObject;
            }
        },
        (op: string) => null,
    );
}

export const DataCustomerContact30CoreService: Service = {
    resource: RESOURCE,
    resourceDisplayName: RESOURCE_DISPLAY_NAME,
    resourceDescription: 'Core operations for DataCustomerContact30',
    endpoint: ENDPOINT,
    operationRegistry: OPERATION_REGISTRY,
    operationOptions,
    extraProperties,
    async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
        const config = createExecuteConfig(creds, url, baseUrl, timeoutMs);
        return await executeStandardService(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex, PARAM_ORDER, config);
    },
};


