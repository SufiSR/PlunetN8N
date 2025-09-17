import { INodeTypeDescription, NodeConnectionType } from 'n8n-workflow';
import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30CoreService } from './services/dataCustomer30.core';
import { DataCustomer30MiscService } from './services/dataCustomer30.misc';
import { DataResource30CoreService } from './services/dataResource30.core';
import { DataResource30MiscService } from './services/dataResource30.misc';
import { DataJob30Service } from './services/dataJob30';


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

export const description: INodeTypeDescription = {
    displayName: 'Plunet',
    name: 'plunet',
    icon: 'file:plunet.png',
    group: ['transform'],
    version: 1,
    description: 'Get and Set Data for Plunet BusinessManager ',
    defaults: { name: 'Plunet' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [{ name: 'plunetApi', required: true }],
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
