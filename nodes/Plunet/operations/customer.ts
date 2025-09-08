import { INodeProperties } from 'n8n-workflow';

export const customerOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				service: ['customer'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'insert',
				description: 'Create a new customer',
				action: 'Create a customer',
			},
			{
				name: 'Get',
				value: 'getCustomerObject',
				description: 'Get customer details by ID',
				action: 'Get a customer',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update customer information',
				action: 'Update a customer',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a customer',
				action: 'Delete a customer',
			},
			{
				name: 'Search',
				value: 'seek',
				description: 'Search for customers',
				action: 'Search customers',
			},
			{
				name: 'Get All',
				value: 'getAllCustomerObjects',
				description: 'Get all customers',
				action: 'Get all customers',
			},
			{
				name: 'Get Customer List',
				value: 'getCustomerList',
				description: 'Get list of customers with basic info',
				action: 'Get customer list',
			},
		],
		default: 'getCustomerObject',
	},
];

export const customerFields: INodeProperties[] = [
	// Customer ID field for operations that need it
	{
		displayName: 'Customer ID',
		name: 'customerID',
		type: 'number',
		displayOptions: {
			show: {
				service: ['customer'],
				operation: ['getCustomerObject', 'update', 'delete'],
			},
		},
		default: 0,
		description: 'The ID of the customer',
		required: true,
	},

	// Customer object fields for create/update operations
	{
		displayName: 'Customer Data',
		name: 'customerData',
		type: 'collection',
		placeholder: 'Add Customer Field',
		displayOptions: {
			show: {
				service: ['customer'],
				operation: ['insert', 'update'],
			},
		},
		default: {},
		options: [
			{
				displayName: 'Name 1',
				name: 'name1',
				type: 'string',
				default: '',
				description: 'Primary customer name',
			},
			{
				displayName: 'Name 2',
				name: 'name2',
				type: 'string',
				default: '',
				description: 'Secondary customer name',
			},
			{
				displayName: 'Full Name',
				name: 'fullName',
				type: 'string',
				default: '',
				description: 'Complete customer name',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Customer email address',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				description: 'Customer phone number',
			},
			{
				displayName: 'Fax',
				name: 'fax',
				type: 'string',
				default: '',
				description: 'Customer fax number',
			},
			{
				displayName: 'Website',
				name: 'website',
				type: 'string',
				default: '',
				description: 'Customer website URL',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{
						name: 'Active',
						value: 1,
					},
					{
						name: 'Inactive',
						value: 0,
					},
				],
				default: 1,
				description: 'Customer status',
			},
			{
				displayName: 'Customer Type',
				name: 'customerType',
				type: 'options',
				options: [
					{
						name: 'Direct Customer',
						value: 1,
					},
					{
						name: 'Agency',
						value: 2,
					},
					{
						name: 'Partner',
						value: 3,
					},
				],
				default: 1,
				description: 'Type of customer',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				default: 'EUR',
				description: 'Customer currency (ISO code)',
			},
			{
				displayName: 'Payment Terms',
				name: 'paymentTerms',
				type: 'number',
				default: 30,
				description: 'Payment terms in days',
			},
			{
				displayName: 'Tax ID',
				name: 'taxID',
				type: 'string',
				default: '',
				description: 'Customer tax identification number',
			},
			{
				displayName: 'External ID',
				name: 'externalID',
				type: 'string',
				default: '',
				description: 'External system customer ID',
			},
		],
	},

	// Search parameters
	{
		displayName: 'Search Text',
		name: 'searchText',
		type: 'string',
		displayOptions: {
			show: {
				service: ['customer'],
				operation: ['seek'],
			},
		},
		default: '',
		description: 'Text to search for in customer records',
		required: true,
	},

	{
		displayName: 'Search Type',
		name: 'searchType',
		type: 'options',
		displayOptions: {
			show: {
				service: ['customer'],
				operation: ['seek'],
			},
		},
		options: [
			{
				name: 'Customer Name',
				value: 'name',
			},
			{
				name: 'Email',
				value: 'email',
			},
			{
				name: 'External ID',
				value: 'externalID',
			},
			{
				name: 'All Fields',
				value: 'all',
			},
		],
		default: 'name',
		description: 'Field to search in',
	},

	// Additional options
	{
		displayName: 'Additional Options',
		name: 'additionalOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: {
			show: {
				service: ['customer'],
			},
		},
		default: {},
		options: [
			{
				displayName: 'Include Inactive',
				name: 'includeInactive',
				type: 'boolean',
				default: false,
				description: 'Whether to include inactive customers in results',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 100,
				description: 'Maximum number of results to return',
			},
			{
				displayName: 'Offset',
				name: 'offset',
				type: 'number',
				default: 0,
				description: 'Number of results to skip',
			},
		],
	},
];

