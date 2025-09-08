import type { IAuthenticateGeneric, ICredentialType, INodeProperties } from 'n8n-workflow';

export class PlunetApi implements ICredentialType {
    name = 'plunetApi';
    displayName = 'Plunet SOAP (Login)';
    // SOAP UUID is returned by login, so no generic auth here
    authenticate = {} as IAuthenticateGeneric;

    properties: INodeProperties[] = [
        {
            displayName: 'Base Host',
            name: 'baseHost',
            type: 'string',
            default: 'your-instance.example.com',
            description: 'Plunet host (no scheme, no trailing slash), e.g. 8144.plunet.com',
            placeholder: '8144.plunet.com'
        },
        {
            displayName: 'Use HTTPS',
            name: 'useHttps',
            type: 'boolean',
            default: true
        },
        {
            displayName: 'Username',
            name: 'username',
            type: 'string',
            default: ''
        },
        {
            displayName: 'Password',
            name: 'password',
            type: 'string',
            typeOptions: { password: true },
            default: ''
        },
        {
            displayName: 'Timeout (ms)',
            name: 'timeout',
            type: 'number',
            typeOptions: { minValue: 0 },
            default: 30000
        }
    ];
}
