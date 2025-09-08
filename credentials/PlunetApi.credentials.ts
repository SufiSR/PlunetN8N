import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PlunetApi implements ICredentialType {
	name = 'plunetApi';
	displayName = 'Plunet API';
	documentationUrl = 'https://www.plunet.com/en/plunet-businessmanager/interfaces/';
	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: 'https://your-instance.plunet.com',
			placeholder: 'https://your-instance.plunet.com',
			description: 'The base URL of your Plunet BusinessManager instance',
			required: true,
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			description: 'Your Plunet username',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Your Plunet password',
			required: true,
		},
		{
			displayName: 'Timeout (seconds)',
			name: 'timeout',
			type: 'number',
			default: 30,
			description: 'Request timeout in seconds',
			required: false,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				'SOAPAction': '',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl}}',
			url: '/PlunetAPI',
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				'SOAPAction': '',
			},
			body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
	<soap:Header/>
	<soap:Body>
		<api:login>
			<arg0>={{$credentials.username}}</arg0>
			<arg1>={{$credentials.password}}</arg1>
		</api:login>
	</soap:Body>
</soap:Envelope>`,
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'soap:Envelope.soap:Body.ns2:loginResponse.return',
					value: 'regex:^[a-f0-9-]{36}$',
					message: 'Invalid credentials or server URL',
				},
			},
		],
	};
}

