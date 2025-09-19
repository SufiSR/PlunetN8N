// nodes/Plunet/core/field-definitions.ts
// Field definitions for complex objects to ensure proper UI field generation

// ============================================================================
// CUSTOMER FIELDS
// ============================================================================

export const CUSTOMER_IN_FIELDS = [
    'academicTitle',
    'costCenter', 
    'currency',
    'customerID',
    'email',
    'externalID',
    'fax',
    'formOfAddress',
    'fullName',
    'mobilePhone',
    'name1',
    'name2',
    'opening',
    'phone',
    'skypeID',
    'status',
    'userId',
    'website',
] as const;

export const CUSTOMER_SEARCH_FILTER_FIELDS = [
    'customerID',
    'externalID',
    'fullName',
    'name1',
    'name2',
    'email',
    'phone',
    'fax',
    'mobilePhone',
    'status',
    'formOfAddress',
    'academicTitle',
    'costCenter',
    'currency',
    'website',
    'skypeID',
    'opening',
] as const;

// ============================================================================
// RESOURCE FIELDS
// ============================================================================

export const RESOURCE_IN_FIELDS = [
    'academicTitle',
    'costCenter',
    'currency',
    'email',
    'externalID',
    'fax',
    'formOfAddress',
    'fullName',
    'mobilePhone',
    'name1',
    'name2',
    'opening',
    'phone',
    'resourceType',
    'skypeID',
    'status',
    'supervisor1',
    'supervisor2',
    'userId',
    'website',
    'workingStatus',
] as const;

export const RESOURCE_SEARCH_FILTER_FIELDS = [
    'resourceID',
    'externalID',
    'fullName',
    'name1',
    'name2',
    'email',
    'phone',
    'fax',
    'mobilePhone',
    'status',
    'workingStatus',
    'resourceType',
    'formOfAddress',
    'academicTitle',
    'costCenter',
    'currency',
    'website',
    'skypeID',
    'opening',
    'supervisor1',
    'supervisor2',
] as const;

// ============================================================================
// JOB FIELDS
// ============================================================================

export const JOB_IN_FIELDS = [
    'jobID',
    'projectID',
    'resourceID',
    'projectType',
    'status',
    'jobTypeFull',
    'jobTypeShort',
    'countSourceFiles',
    'itemID',
    'startDate',
    'dueDate',
    'deliveryDate',
    'comment',
    'description',
    'deliveryNote',
    'contactPersonID',
    'resourceContactPersonID',
    'priceListID',
    'currency',
] as const;

export const JOB_TRACKING_TIME_IN_FIELDS = [
    'jobID',
    'resourceID',
    'startDate',
    'endDate',
    'description',
    'isBillable',
    'isApproved',
] as const;

export const PRICE_LINE_IN_FIELDS = [
    'priceLineID',
    'jobID',
    'projectType',
    'serviceType',
    'sourceLanguage',
    'targetLanguage',
    'unitPrice',
    'quantity',
    'totalPrice',
    'currency',
    'description',
] as const;

// ============================================================================
// SEARCH FILTER FIELDS
// ============================================================================

// Resource search filter fields are already defined above

// ============================================================================
// PAYMENT INFO FIELDS
// ============================================================================

export const PAYMENT_INFO_FIELDS = [
    'customerID',
    'accountHolder',
    'accountID',
    'BIC',
    'contractNumber',
    'debitAccount',
    'IBAN',
    'paymentMethodID',
    'preselectedTaxID',
    'salesTaxID',
] as const;

// ============================================================================
// MANDATORY FIELD INDICATORS
// ============================================================================

export const MANDATORY_FIELDS: Record<string, string[]> = {
    // Customer operations
    'insert2': ['name1'],
    'update': ['customerID'],
    'delete': ['customerID'],
    'getCustomerObject': ['customerID'],
    
    // Resource operations
    'insertObject': ['name1','workingStatus'],
    'update': ['resourceID'],
    'delete': ['resourceID'],
    'getResourceObject': ['resourceID'],
    
    // Job operations
    'insert': ['projectID', 'projectType', 'jobTypeAbbrevation'],
    'jobInsert2': ['projectID', 'projectType', 'jobTypeAbbrevation', 'itemID'],
    'insert3': ['projectID', 'projectType', 'jobTypeShort'],
    'jobUpdate': ['jobID'],
    'deleteJob': ['jobID', 'projectType'],
    'getJob_ForView': ['jobID', 'projectType'],
    
    // Payment operations
    'setPaymentInformation': ['customerID', 'paymentMethodID'],
};

// ============================================================================
// FIELD TYPE MAPPINGS
// ============================================================================

export const FIELD_TYPES: Record<string, 'string' | 'number' | 'boolean' | 'date'> = {
    // IDs and numeric fields
    'customerID': 'number',
    'resourceID': 'number',
    'jobID': 'number',
    'projectID': 'number',
    'itemID': 'number',
    'userID': 'number',
    'accountID': 'number',
    'paymentMethodID': 'number',
    'priceLineID': 'number',
    'priceListID': 'number',
    'contactID': 'number',
    'contactPersonID': 'number',
    'resourceContactPersonID': 'number',
    'status': 'number',
    'workingStatus': 'number',
    'resourceType': 'number',
    'formOfAddress': 'number',
    'projectType': 'number',
    'countSourceFiles': 'number',
    'preselectedTaxID': 'number',
    'salesTaxID': 'number',
    'unitPrice': 'number',
    'quantity': 'number',
    'totalPrice': 'number',
    
    // Boolean fields
    'enableNullOrEmptyValues': 'boolean',
    'isBillable': 'boolean',
    'isApproved': 'boolean',
    'createAsFirstItem': 'boolean',
    'overwriteExistingPriceLines': 'boolean',
    'analyzeAndCopyResultToJob': 'boolean',
    
    // Date fields
    'startDate': 'date',
    'dueDate': 'date',
    'deliveryDate': 'date',
    'endDate': 'date',
    'dateInitialContact': 'date',
    
    // String fields (default)
    'academicTitle': 'string',
    'costCenter': 'string',
    'currency': 'string',
    'email': 'string',
    'externalID': 'string',
    'fax': 'string',
    'fullName': 'string',
    'mobilePhone': 'string',
    'name1': 'string',
    'name2': 'string',
    'opening': 'string',
    'phone': 'string',
    'skypeID': 'string',
    'website': 'string',
    'comment': 'string',
    'description': 'string',
    'deliveryNote': 'string',
    'jobTypeAbbrevation': 'string',
    'jobTypeShort': 'string',
    'jobTypeFull': 'string',
    'serviceType': 'string',
    'sourceLanguage': 'string',
    'targetLanguage': 'string',
    'accountHolder': 'string',
    'BIC': 'string',
    'contractNumber': 'string',
    'debitAccount': 'string',
    'IBAN': 'string',
    'supervisor1': 'string',
    'supervisor2': 'string',
    'sourceOfContact': 'string',
    'dossier': 'string',
    'pathOrUrl': 'string',
    'FilePathName': 'string',
    'FileByteStream': 'string',
    'Filesize': 'number',
    'systemLanguageCode': 'string',
    'languageCode': 'string',
    'actionLinkType': 'string',
    'targetFileName': 'string',
    'catType': 'number',
    'note': 'string',
};
