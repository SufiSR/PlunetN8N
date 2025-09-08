import { INodeProperties } from 'n8n-workflow';

export const orderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				service: ['order'],
			},
		},
		options: [
			{
				name: 'Create',
				value: 'insert',
				description: 'Create a new order',
				action: 'Create an order',
			},
			{
				name: 'Get',
				value: 'getOrderObject',
				description: 'Get order details by ID',
				action: 'Get an order',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Update order information',
				action: 'Update an order',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete an order',
				action: 'Delete an order',
			},
			{
				name: 'Search',
				value: 'seek',
				description: 'Search for orders',
				action: 'Search orders',
			},
			{
				name: 'Get All',
				value: 'getAllOrderObjects',
				description: 'Get all orders',
				action: 'Get all orders',
			},
			{
				name: 'Set Status',
				value: 'setStatus',
				description: 'Set order status',
				action: 'Set order status',
			},
			{
				name: 'Get Status',
				value: 'getStatus',
				description: 'Get order status',
				action: 'Get order status',
			},
		],
		default: 'getOrderObject',
	},
];

export const orderFields: INodeProperties[] = [
	// Order ID field for operations that need it
	{
		displayName: 'Order ID',
		name: 'orderID',
		type: 'number',
		displayOptions: {
			show: {
				service: ['order'],
				operation: ['getOrderObject', 'update', 'delete', 'setStatus', 'getStatus'],
			},
		},
		default: 0,
		description: 'The ID of the order',
		required: true,
	},

	// Order status for setStatus operation
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		displayOptions: {
			show: {
				service: ['order'],
				operation: ['setStatus'],
			},
		},
		options: [
			{
				name: 'New',
				value: 1,
			},
			{
				name: 'In Progress',
				value: 2,
			},
			{
				name: 'Completed',
				value: 3,
			},
			{
				name: 'Cancelled',
				value: 4,
			},
			{
				name: 'On Hold',
				value: 5,
			},
		],
		default: 1,
		description: 'Order status to set',
		required: true,
	},

	// Order object fields for create/update operations
	{
		displayName: 'Order Data',
		name: 'orderData',
		type: 'collection',
		placeholder: 'Add Order Field',
		displayOptions: {
			show: {
				service: ['order'],
				operation: ['insert', 'update'],
			},
		},
		default: {},
		options: [
			{
				displayName: 'Customer ID',
				name: 'customerID',
				type: 'number',
				default: 0,
				description: 'ID of the customer for this order',
				required: true,
			},
			{
				displayName: 'Order Name',
				name: 'orderName',
				type: 'string',
				default: '',
				description: 'Name/title of the order',
			},
			{
				displayName: 'Project Name',
				name: 'projectName',
				type: 'string',
				default: '',
				description: 'Name of the project',
			},
			{
				displayName: 'Subject',
				name: 'subject',
				type: 'string',
				default: '',
				description: 'Order subject/description',
			},
			{
				displayName: 'Order Date',
				name: 'orderDate',
				type: 'dateTime',
				default: '',
				description: 'Date when the order was created',
			},
			{
				displayName: 'Delivery Date',
				name: 'deliveryDate',
				type: 'dateTime',
				default: '',
				description: 'Expected delivery date',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				default: 'EUR',
				description: 'Order currency (ISO code)',
			},
			{
				displayName: 'Rate',
				name: 'rate',
				type: 'number',
				default: 0,
				description: 'Exchange rate',
			},
			{
				displayName: 'Source Language',
				name: 'sourceLanguage',
				type: 'string',
				default: '',
				description: 'Source language code (e.g., EN, DE, FR)',
			},
			{
				displayName: 'Target Languages',
				name: 'targetLanguages',
				type: 'string',
				default: '',
				description: 'Comma-separated list of target language codes',
			},
			{
				displayName: 'Priority',
				name: 'priority',
				type: 'options',
				options: [
					{
						name: 'Low',
						value: 1,
					},
					{
						name: 'Normal',
						value: 2,
					},
					{
						name: 'High',
						value: 3,
					},
					{
						name: 'Urgent',
						value: 4,
					},
				],
				default: 2,
				description: 'Order priority level',
			},
			{
				displayName: 'External ID',
				name: 'externalID',
				type: 'string',
				default: '',
				description: 'External system order ID',
			},
			{
				displayName: 'Reference',
				name: 'reference',
				type: 'string',
				default: '',
				description: 'Order reference number',
			},
			{
				displayName: 'Contact Person ID',
				name: 'contactPersonID',
				type: 'number',
				default: 0,
				description: 'ID of the contact person',
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
				service: ['order'],
				operation: ['seek'],
			},
		},
		default: '',
		description: 'Text to search for in order records',
		required: true,
	},

	{
		displayName: 'Search Type',
		name: 'searchType',
		type: 'options',
		displayOptions: {
			show: {
				service: ['order'],
				operation: ['seek'],
			},
		},
		options: [
			{
				name: 'Order Name',
				value: 'orderName',
			},
			{
				name: 'Project Name',
				value: 'projectName',
			},
			{
				name: 'Subject',
				value: 'subject',
			},
			{
				name: 'Reference',
				value: 'reference',
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
		default: 'orderName',
		description: 'Field to search in',
	},

	// Date range filters
	{
		displayName: 'Date Filters',
		name: 'dateFilters',
		type: 'collection',
		placeholder: 'Add Date Filter',
		displayOptions: {
			show: {
				service: ['order'],
				operation: ['seek', 'getAllOrderObjects'],
			},
		},
		default: {},
		options: [
			{
				displayName: 'From Date',
				name: 'fromDate',
				type: 'dateTime',
				default: '',
				description: 'Filter orders from this date',
			},
			{
				displayName: 'To Date',
				name: 'toDate',
				type: 'dateTime',
				default: '',
				description: 'Filter orders until this date',
			},
			{
				displayName: 'Date Type',
				name: 'dateType',
				type: 'options',
				options: [
					{
						name: 'Order Date',
						value: 'orderDate',
					},
					{
						name: 'Delivery Date',
						value: 'deliveryDate',
					},
					{
						name: 'Creation Date',
						value: 'creationDate',
					},
				],
				default: 'orderDate',
				description: 'Which date field to filter by',
			},
		],
	},

	// Additional options
	{
		displayName: 'Additional Options',
		name: 'additionalOptions',
		type: 'collection',
		placeholder: 'Add Option',
		displayOptions: {
			show: {
				service: ['order'],
			},
		},
		default: {},
		options: [
			{
				displayName: 'Include Completed',
				name: 'includeCompleted',
				type: 'boolean',
				default: true,
				description: 'Whether to include completed orders in results',
			},
			{
				displayName: 'Include Cancelled',
				name: 'includeCancelled',
				type: 'boolean',
				default: false,
				description: 'Whether to include cancelled orders in results',
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

