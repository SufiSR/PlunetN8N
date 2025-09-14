import { INodeTypeDescription, NodeConnectionType } from 'n8n-workflow';
import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30Service } from './services/dataCustomer30';
import type { Service, NonEmptyArray } from './core/types';

const services: NonEmptyArray<Service> = [PlunetApiService, DataCustomer30Service];

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
