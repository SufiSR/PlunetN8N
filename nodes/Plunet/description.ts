import { INodeTypeDescription } from 'n8n-workflow';
import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30CoreService } from './services/dataCustomer30.core';
import { DataCustomer30MiscService } from './services/dataCustomer30.misc';
import { DataResource30CoreService } from './services/dataResource30.core';
import { DataResource30MiscService } from './services/dataResource30.misc';
import { DataJob30Service } from './services/dataJob30';
import { DataJob30Service_2_0 } from './services/datajob30.new';
import { buildSubtitleLookup } from './core/service-utils';


const services = [
    PlunetApiService,
    DataCustomer30CoreService,
    DataResource30CoreService,
    DataCustomer30MiscService,
    DataResource30MiscService,
    DataJob30Service,
    DataJob30Service_2_0,
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
        Object.fromEntries(s.operationOptions.map((o: any) => [String(o.value), String(o.name)])),
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

// Create a comprehensive subtitle expression that uses the lookup tables
const createSubtitleExpression = (): string => {
    const conditions: string[] = [];
    
    // Add conditions for each service with operation registry
    Object.entries(subtitleLookupByResource).forEach(([resource, lookup]) => {
        const resourceConditions: string[] = [];
        Object.entries(lookup as Record<string, string>).forEach(([operation, subtitle]) => {
            resourceConditions.push(`$parameter["operation"] === "${operation}" ? "${subtitle}"`);
        });
        resourceConditions.push('$parameter["operation"]');
        
        conditions.push(`$parameter["resource"] === "${resource}" ? (${resourceConditions.join(' : ')})`);
    });
    
    // Add conditions for services without operation registries (use opLabelByResource)
    const servicesWithoutRegistry = services.filter(s => !('operationRegistry' in s));
    servicesWithoutRegistry.forEach(service => {
        const resource = service.resource;
        const lookup = opLabelByResource[resource];
        if (lookup) {
            const resourceConditions: string[] = [];
            Object.entries(lookup as Record<string, string>).forEach(([operation, subtitle]) => {
                resourceConditions.push(`$parameter["operation"] === "${operation}" ? "${subtitle}"`);
            });
            resourceConditions.push('$parameter["operation"]');
            
            conditions.push(`$parameter["resource"] === "${resource}" ? (${resourceConditions.join(' : ')})`);
        }
    });
    
    // Final fallback
    conditions.push('$parameter["operation"]');
    
    return `={{ ${conditions.join(' : ')} }}`;
};

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
    subtitle: createSubtitleExpression(),
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
