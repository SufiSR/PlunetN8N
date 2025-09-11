import {
    IDataObject,
    IExecuteFunctions,
    INodeProperties,
    INodePropertyOptions,
} from 'n8n-workflow';

export type NonEmptyArray<T> = [T, ...T[]];

export type Creds = {
    baseHost: string;
    useHttps: boolean;
    username?: string;
    password?: string;
    timeout?: number; // ms
};

export type SessionMap = Record<string, { uuid: string; issuedAt: number }>;

export type Service = {
    resource: string;
    resourceDisplayName: string;
    resourceDescription: string;
    endpoint: string;

    // Enforce at least one operation per service:
    operationOptions: NonEmptyArray<INodePropertyOptions>;

    extraProperties: INodeProperties[];

    execute(
        operation: string,
        ctx: IExecuteFunctions,
        creds: Creds,
        url: string,
        baseUrl: string,
        timeoutMs: number,
        itemIndex: number,
    ): Promise<IDataObject>;
};
