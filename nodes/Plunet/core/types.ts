import {
    IDataObject,
    IExecuteFunctions,
    INodeProperties,
    INodePropertyOptions,
    IBinaryData,
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

/**
 * Centralized operation metadata for consistent UI display and SOAP operations
 */
export type OperationMetadata = {
    // SOAP/API identifiers
    soapAction: string;        // e.g., "getCustomerObject"
    endpoint: string;          // e.g., "DataCustomer30"
    
    // UI display names
    uiName: string;            // e.g., "Get Customer"
    subtitleName: string;      // e.g., "Get Customer" (can be same as uiName)
    titleName: string;         // e.g., "Get Customer" (for node titles)
    
    // Resource context
    resource: string;          // e.g., "DataCustomer30Core"
    resourceDisplayName: string; // e.g., "Customer"
    
    // Technical metadata
    description: string;       // e.g., "Retrieve a single customer"
    returnType: string;        // e.g., "Customer"
    paramOrder: string[];      // e.g., ["customerID"]
    
    // Operation control
    active: boolean;           // e.g., true (whether operation is active/enabled)
};

/**
 * Service-level operation registry mapping operation keys to metadata
 */
export type ServiceOperationRegistry = {
    [operationKey: string]: OperationMetadata;
};

export type Service = {
    resource: string;
    resourceDisplayName: string;
    resourceDescription: string;
    endpoint: string;

    // Centralized operation metadata registry (optional for backward compatibility)
    operationRegistry?: ServiceOperationRegistry;

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

    // Optional special handling methods
    needsSpecialHandling?: (operation: string) => boolean;
    handleSpecialOperation?: (operation: string, ctx: IExecuteFunctions, itemIndex: number) => Promise<{ json: IDataObject; binary?: { data: IBinaryData } }>;
    needsPostProcessing?: (operation: string, payload: IDataObject) => boolean;
    postProcessResult?: (operation: string, payload: IDataObject, ctx: IExecuteFunctions, itemIndex: number) => Promise<{ json: IDataObject; binary?: { data: IBinaryData } }>;
};
