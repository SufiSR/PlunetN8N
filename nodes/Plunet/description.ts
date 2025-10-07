import { INodeTypeDescription } from 'n8n-workflow';
import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30CoreService } from './services/dataCustomer30.core';
import { DataCustomer30MiscService } from './services/dataCustomer30.misc';
import { DataResource30CoreService } from './services/dataResource30.core';
import { DataResource30MiscService } from './services/dataResource30.misc';
import { DataOrder30CoreService } from './services/dataOrder30.core';
import { DataOrder30MiscService } from './services/dataOrder30.misc';
import { DataJob30CoreService } from './services/dataJob30.core';
import { DataJob30MiscService } from './services/dataJob30.misc';
import { DataJob30PricesService } from './services/dataJob30.prices';
import { DataJob30Service } from './services/dataJob30';
import { DataDocument30Service } from './services/dataDocument30';
import { DataCustomFields30Service } from './services/dataCustomFields30';
import { DataAdmin30Service } from './services/dataAdmin30';
import { DataItem30CoreService } from './services/dataItem30.core';
import { DataItem30MiscService } from './services/dataItem30.misc';
import { DataItem30PricesService } from './services/dataItem30.prices';
import { DataCustomerAddress30CoreService } from './services/dataCustomerAddress30.core';
import { buildSubtitleLookup } from './core/service-utils';
import { DataCustomerContact30CoreService } from './services/dataCustomerContact30.core';


const services = [
    PlunetApiService,
    DataCustomer30CoreService,
    DataResource30CoreService,
    DataOrder30CoreService,
    DataItem30CoreService,
    DataJob30CoreService,        
    DataItem30PricesService,
    DataJob30PricesService,
    DataDocument30Service,
    DataCustomFields30Service,
    DataAdmin30Service, // New service added for testing
    DataCustomerAddress30CoreService,
    DataCustomer30MiscService,
    DataResource30MiscService,
    DataOrder30MiscService,
    DataItem30MiscService, 
    DataJob30MiscService,       
    DataCustomerContact30CoreService,
    //DataJob30Service, // not used
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
    subtitle: '={{ $parameter["operation"] }}',
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
    hints: [
        {
            message: 'TEST: This hint should always show for DataDocument30',
            type: 'info',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" }}',
        },
        {
            message: 'You selected <b>Request</b> folder — Main ID should be a Request ID.',
            type: 'info',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] == 1 }}',
        },
        {
            message: 'You selected <b>Quote</b> folder — Main ID should be a Quote ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 2 }}',
        },
        {
            message: 'You selected <b>Order Reference</b> folder — Main ID should be an Order ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 3 }}',
        },
        {
            message: 'You selected <b>Order Job Out</b> folder — Main ID should be a Job ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 4 }}',
        },
        {
            message: 'You selected <b>Order Job In</b> folder — Main ID should be a Job ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 5 }}',
        },
        {
            message: 'You selected <b>Customer</b> folder — Main ID should be a Customer ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 6 }}',
        },
        {
            message: 'You selected <b>Resource</b> folder — Main ID should be a Resource ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 7 }}',
        },
        {
            message: 'You selected <b>Project</b> folder — Main ID should be a Project ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 8 }}',
        },
        {
            message: 'You selected <b>Invoice</b> folder — Main ID should be an Invoice ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 9 }}',
        },
        {
            message: 'You selected <b>Credit Note</b> folder — Main ID should be a Credit Note ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 10 }}',
        },
        {
            message: 'You selected <b>Payable</b> folder — Main ID should be a Payable ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 11 }}',
        },
        {
            message: 'You selected <b>Item</b> folder — Main ID should be an Item ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 12 }}',
        },
        {
            message: 'You selected <b>User</b> folder — Main ID should be a User ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 13 }}',
        },
        {
            message: 'You selected <b>Workflow</b> folder — Main ID should be a Workflow ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 14 }}',
        },
        {
            message: 'You selected <b>Quality Manager</b> folder — Main ID should be a Quality Manager ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 15 }}',
        },
        {
            message: 'You selected <b>Admin</b> folder — Main ID should be an Admin ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 16 }}',
        },
        {
            message: 'You selected <b>Custom Fields</b> folder — Main ID should be a Custom Fields ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 17 }}',
        },
        {
            message: 'You selected <b>Document</b> folder — Main ID should be a Document ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 18 }}',
        },
        {
            message: 'You selected <b>Outgoing Invoice</b> folder — Main ID should be an Outgoing Invoice ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 19 }}',
        },
        {
            message: 'You selected <b>Job Round</b> folder — Main ID should be a Job Round ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 20 }}',
        },
        {
            message: 'You selected <b>Customer Address</b> folder — Main ID should be a Customer Address ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 21 }}',
        },
        {
            message: 'You selected <b>Customer Contact</b> folder — Main ID should be a Customer Contact ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 22 }}',
        },
        {
            message: 'You selected <b>Order Job Out</b> folder — Main ID should be a Job ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 23 }}',
        },
        {
            message: 'You selected <b>Resource Address</b> folder — Main ID should be a Resource Address ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 24 }}',
        },
        {
            message: 'You selected <b>Resource Contact</b> folder — Main ID should be a Resource Contact ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 25 }}',
        },
        {
            message: 'You selected <b>Order Job In</b> folder — Main ID should be a Job ID.',
            location: 'inputPane',
            displayCondition: '={{ $parameter["resource"] === "DataDocument30" && $parameter["folderType"] === 26 }}',
        },
    ],
};
