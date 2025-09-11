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
import { DataCustomer30Service } from './services/dataCustomer30';

const registry: Record<string, Service> = {
    [PlunetApiService.resource]: PlunetApiService,
    [DataCustomer30Service.resource]: DataCustomer30Service,
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
                out.push({ json: { success: true, resource, operation, ...payload } as IDataObject });
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
