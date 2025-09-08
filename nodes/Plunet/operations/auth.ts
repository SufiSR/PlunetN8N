import { INodeProperties } from 'n8n-workflow';

export const authOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				service: ['auth'],
			},
		},
		options: [
			{
				name: 'Login',
				value: 'login',
				description: 'Authenticate and get session UUID',
				action: 'Login to Plunet API',
			},
			{
				name: 'Logout',
				value: 'logout',
				description: 'End current session',
				action: 'Logout from Plunet API',
			},
			{
				name: 'Validate Session',
				value: 'validate',
				description: 'Check if current session is valid',
				action: 'Validate current session',
			},
			{
				name: 'Get Version',
				value: 'getVersion',
				description: 'Get Plunet API version',
				action: 'Get API version',
			},
			{
				name: 'Get Plunet Version',
				value: 'getPlunetVersion',
				description: 'Get Plunet BusinessManager version',
				action: 'Get Plunet version',
			},
		],
		default: 'login',
	},
];

export const authFields: INodeProperties[] = [
	// Login operation doesn't need additional fields as credentials are used
	{
		displayName: 'Session UUID',
		name: 'uuid',
		type: 'string',
		displayOptions: {
			show: {
				service: ['auth'],
				operation: ['logout', 'validate'],
			},
		},
		default: '',
		description: 'Session UUID to logout or validate (leave empty to use current session)',
		required: false,
	},
];

