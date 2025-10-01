import { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { Creds, Service } from '../core/types';
import { executeOperation, type ExecuteConfig } from '../core/executor';

const RESOURCE = 'Debug';
const RESOURCE_DISPLAY_NAME = 'Debug';
const ENDPOINT = '/Debug';

export const DebugService: Service = {
  resource: RESOURCE,
  resourceDisplayName: RESOURCE_DISPLAY_NAME,
  resourceDescription: 'Debug operations for SOAP envelope logging',
  endpoint: ENDPOINT,
  operationRegistry: {
    logEnvelope: {
      soapAction: 'logEnvelope',
      endpoint: ENDPOINT,
      uiName: 'Log SOAP Envelope',
      subtitleName: 'log: envelope',
      titleName: 'Log SOAP Envelope',
      resource: RESOURCE,
      resourceDisplayName: RESOURCE_DISPLAY_NAME,
      description: 'Log SOAP envelope for debugging purposes',
      returnType: 'Void',
      paramOrder: ['envelope', 'operation'],
      active: true,
    },
  },
  operationOptions: [
    {
      name: 'Log SOAP Envelope',
      value: 'logEnvelope',
    },
  ],
  extraProperties: [
    {
      displayName: 'SOAP Envelope',
      name: 'envelope',
      type: 'string',
      default: '',
      description: 'The SOAP envelope to log',
      displayOptions: { show: { resource: [RESOURCE], operation: ['logEnvelope'] } },
    },
    {
      displayName: 'Operation Name',
      name: 'operation',
      type: 'string',
      default: '',
      description: 'The operation name for the envelope',
      displayOptions: { show: { resource: [RESOURCE], operation: ['logEnvelope'] } },
    },
  ],
  async execute(operation, ctx, creds, url, baseUrl, timeoutMs, itemIndex) {
    const paramNames = ['envelope', 'operation'];
    const itemParams: IDataObject = {};
    for (const paramName of paramNames) {
      itemParams[paramName] = ctx.getNodeParameter(paramName, itemIndex, '');
    }
    
    // Just return the envelope and operation for debugging
    return {
      success: true,
      resource: RESOURCE,
      operation: operation,
      envelope: itemParams.envelope,
      operationName: itemParams.operation,
      timestamp: new Date().toISOString(),
    };
  },
};
