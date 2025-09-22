import { INodeTypeDescription } from 'n8n-workflow';
import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30CoreService } from './services/dataCustomer30.core';
import { DataCustomer30MiscService } from './services/dataCustomer30.misc';
import { DataResource30CoreService } from './services/dataResource30.core';
import { DataResource30MiscService } from './services/dataResource30.misc';
import { DataJob30Service } from './services/dataJob30';
import { buildSubtitleLookup } from './core/service-utils';


const services = [
    PlunetApiService,
    DataCustomer30CoreService,
    DataResource30CoreService,
    DataCustomer30MiscService,
    DataResource30MiscService,
    DataJob30Service,
] as const;

const resourceOptions = services.map((s) => ({
    name: s.resourceDisplayName,
    value: s.resource,
    description: s.resourceDescription,
}));

const operationProperties = services.map((s) => ({
    displayName: 'Operation',
    name: 'operation',
    type: 'options' as const,
    noDataExpression: true,
    displayOptions: { show: { resource: [s.resource] } },
    options: s.operationOptions,
    default: s.operationOptions[0].value, // now safe thanks to NonEmptyArray
}));

const extraProps = services.flatMap((s) => s.extraProperties);

// Build lookup tables for clean display names
const resourceLabelByValue = Object.fromEntries(
    services.map(s => [s.resource, s.resourceDisplayName ?? s.resource])
);

const opLabelByResource = Object.fromEntries(
    services.map(s => [
        s.resource,
        Object.fromEntries(s.operationOptions.map(o => [String(o.value), String(o.name)])),
    ]),
);

// Build dynamic subtitle lookup from operation registries
const subtitleLookupByResource = Object.fromEntries(
    services
        .filter(s => 'operationRegistry' in s) // Only services with operation registries
        .map(s => [
            s.resource,
            buildSubtitleLookup((s as any).operationRegistry),
        ])
);

export const description: INodeTypeDescription = {
    displayName: 'Plunet',
    name: 'plunet',
    icon: 'file:plunet.png',
    group: ['transform'],
    version: 1,
    description: 'Get and Set Data for Plunet BusinessManager ',
    defaults: { name: 'Plunet' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'plunetApi', required: true }],
    subtitle: '={{ $parameter["resource"] === "DataCustomer30Core" ? ($parameter["operation"] === "getCustomerObject" ? "Get Customer" : $parameter["operation"] === "search" ? "Get Many Customers" : $parameter["operation"] === "insert2" ? "Create Customer" : $parameter["operation"] === "update" ? "Update Customer" : $parameter["operation"] === "delete" ? "Delete Customer" : $parameter["operation"]) : $parameter["operation"] }}',
    properties: [
        {
            displayName: 'Resource',
            name: 'resource',
            type: 'options',
            noDataExpression: true,
            options: resourceOptions,
            default: services[0].resource, // TS is happy now
            description: 'Choose which Plunet SOAP resource to call',
        },
        ...operationProperties,
        ...extraProps,
    ],
};
