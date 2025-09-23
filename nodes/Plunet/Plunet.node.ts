import {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
    IDataObject,
} from 'n8n-workflow';

import { description } from './description';
import { Creds, Service } from './core/types';
import { PlunetApiService } from './services/plunetApi';
import { DataCustomer30CoreService } from './services/dataCustomer30.core';
import { DataResource30CoreService } from './services/dataResource30.core';
import { DataJob30ActionsService } from './services/dataJob30.actions';
import { DataCustomer30MiscService } from './services/dataCustomer30.misc';
import { DataResource30MiscService } from './services/dataResource30.misc';
import { DataJob30PricesService } from './services/dataJob30.prices';
import { DataJob30FieldsService } from './services/dataJob30.fields';

const registry: Record<string, Service> = {
    [PlunetApiService.resource]: PlunetApiService,
    [DataCustomer30CoreService.resource]: DataCustomer30CoreService,
    [DataResource30CoreService.resource]: DataResource30CoreService,
    [DataJob30ActionsService.resource]: DataJob30ActionsService,
    [DataCustomer30MiscService.resource]: DataCustomer30MiscService,
    [DataResource30MiscService.resource]: DataResource30MiscService,
    [DataJob30PricesService.resource]: DataJob30PricesService,
    [DataJob30FieldsService.resource]: DataJob30FieldsService,
};

export class Plunet implements INodeType {
    description: INodeTypeDescription = description;

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const out: INodeExecutionData[] = [];

        for (let i = 0; i < items.length; i++) {
            try {
                const resource = this.getNodeParameter('resource', i) as string;
                const operation = this.getNodeParameter('operation', i) as string;

                const svc = registry[resource];
                if (!svc) throw new Error(`Unsupported resource: ${resource}`);

                const creds = (await this.getCredentials('plunetApi')) as unknown as Creds;
                const scheme = creds.useHttps ? 'https' : 'http';
                const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
                const url = `${baseUrl}/${svc.endpoint}`;
                const timeoutMs = creds.timeout ?? 30000;

                const payload = await svc.execute(operation, this, creds, url, baseUrl, timeoutMs, i);

                // Services already include success/resource/operation; forward as-is.
                out.push({ json: payload as IDataObject });
            } catch (err) {
                if (this.continueOnFail()) {
                    out.push({ json: { success: false, error: (err as Error).message } });
                } else {
                    throw err;
                }
            }
        }

        return [out];
    }
}
