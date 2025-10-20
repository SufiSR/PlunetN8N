# n8n-nodes-plunet

> **n8n community node for the Plunet SOAP API**
> Comprehensive integration with Plunet BusinessManager API including authentication, customer management, resource management, job operations, document handling, and administrative functions.

> **⚠️ WORK IN PROGRESS** - This node is actively being developed and expanded. New features and services are being added regularly. Some operations may be in beta or testing phase.

---

## Features

* **Session Management**: Automatic login with UUID caching per `baseHost + scheme`
* **Multi-Service Integration**: Support for 19+ Plunet API services with unified interface
* **Enhanced UX**: User-friendly field names, dropdowns, and structured responses
* **Type Safety**: Full TypeScript support with proper type definitions
* **Error Handling**: Comprehensive error handling with meaningful messages and operation context
* **Debug Mode**: Credential-level debug mode with sanitized SOAP envelope logging
* **Enum Support**: Human-readable dropdowns for all status and type fields
* **Load Options**: Dynamic dropdown population from API calls
* **Structured Responses**: Clean JSON output with enriched data
* **Advanced Item Operations**: Create Item (Advanced) and Update Item (Advanced) with complex field handling
* **Language Management**: Language combination operations and language-independent item creation
* **Workflow Integration**: Apply workflows to items and manage language combinations
* **Pricing Operations**: Advanced pricing management with best pricelist detection

---

## Debug Mode

The Plunet node includes a credential-level debug mode for troubleshooting API issues:

### Enabling Debug Mode

1. Go to your Plunet credentials in n8n
2. Enable the "Enable Debug Mode" checkbox
3. Save your credentials

### What Debug Mode Provides

When enabled, debug mode adds a `debugInfo` object to all successful responses containing:

- **Request Details**: URL, SOAP action, and sanitized SOAP envelope
- **Response Details**: Full XML response from Plunet
- **Security**: UUIDs and sensitive data are automatically redacted

### Example Debug Output

```json
{
  "success": true,
  "resource": "Customer",
  "operation": "getCustomer",
  "customer": { ... },
  "debugInfo": {
    "request": {
      "url": "https://your-instance.plunet.com/DataCustomer30",
      "soapAction": "http://API.Integration/getCustomerObject",
      "envelope": "<?xml version=\"1.0\" encoding=\"utf-8\"?>..."
    },
    "response": {
      "xml": "<?xml version=\"1.0\" encoding=\"utf-8\"?>..."
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### When to Use Debug Mode

- **Troubleshooting API errors**: See exactly what was sent to Plunet
- **API integration issues**: Verify request format and parameters
- **Development and testing**: Understand API behavior
- **Support requests**: Provide detailed information to support teams

**Note**: Debug mode should only be enabled when troubleshooting. It increases response size and should be disabled in production workflows.

---

## Error Handling

The Plunet node provides enhanced error messages with operation context:

### Error Message Format

All errors now include operation context in the format:
```
[Resource] operation: message [statusCode]
```

### Examples

- **Old format**: `"Customer not found"`
- **New format**: `"[Customer] getCustomer: Customer not found [404]"`

### Error Types

- **Authentication errors**: `[PlunetAPI] login: Login refused`
- **Validation errors**: `[PlunetAPI] validate: Invalid session [401]`
- **Business logic errors**: `[Customer] getCustomer: Customer not found [404]`
- **Network errors**: `[PlunetAPI] SOAP_REQUEST: Connection timeout`

### Status Codes

Common Plunet status codes:
- `0`: Success
- `401`: Authentication failed
- `404`: Resource not found
- `500`: Internal server error

---

## Install

From your n8n host:

```bash
npm install n8n-nodes-plunet
# or add to your community node image / volume and restart n8n
```

> Ensure your n8n instance loads community nodes (default in standard deployments).

---

## Build (contributors)

Requirements:

* Node 18+ (tested with Node v18.20.x).
* `npm` and a working TypeScript toolchain.

```bash
npm ci
npm run build
```

The build does:

* `tsc`
* copies `nodes/**/*.{png,ico,svg}` to `dist/…`
* verifies the icon exists at `dist/nodes/Plunet/plunet.png`

If you see lockfile mismatches on CI, run a local `npm install` to refresh `package-lock.json`.

---

## Where things live

```
credentials/
  PlunetApi.credentials.ts    # Plunet API credentials definition

nodes/Plunet/
  Plunet.node.ts              # Node entry (wires resources/services)
  description.ts               # UI: resources, operations, properties
  plunet.png                  # node icon (copied to dist)

  enums/
    address-type.ts            # AddressType enum definitions
    cat-type.ts                # CatType enum definitions
    currency-type.ts           # CurrencyType enum definitions
    customer-status.ts         # CustomerStatus enum definitions
    folder-types.ts            # FolderTypes enum definitions
    form-of-address.ts         # FormOfAddress enum definitions
    index.ts                   # Enum exports
    job-status.ts              # JobStatus enum definitions
    project-type.ts            # ProjectType enum definitions
    property-type.ts           # PropertyType enum definitions
    property-usage-area.ts     # PropertyUsageArea enum definitions
    resource-status.ts         # ResourceStatus enum definitions
    resource-type.ts           # ResourceType enum definitions
    tax-type.ts                # TaxType enum definitions
    text-module-type.ts        # TextModuleType enum definitions
    text-module-usage-area.ts  # TextModuleUsageArea enum definitions
    types.ts                   # Enum type definitions
    workflow-status.ts         # WorkflowStatus enum definitions
    workflow-type.ts           # WorkflowType enum definitions
    working-status.ts          # WorkingStatus enum definitions

  core/
    constants.ts               # Shared constants (NUMERIC_BOOLEAN_PARAMS)
    errors.ts                  # Error handling (SoapRequestError, throwForSoapFaultOrStatus)
    executor.ts                # Generic executor for all services
    field-definitions.ts       # Centralized field definitions and type mappings
    index.ts                   # Core module exports
    parsers.ts                 # Main parser exports (re-exports from parsers/)
    service-utils.ts           # Common service utilities and patterns
    session.ts                 # Session management and UUID caching
    soap.ts                    # SOAP request/response handling
    types.ts                   # Shared types (Creds, Service, etc.)
    utils.ts                   # Shared utilities (labelize, asNonEmpty, toSoapParamValue)
    xml.ts                     # XML parsing and result extraction
    parsers/                   # Organized parser modules
      account.ts               # Account and payment info parsers
      address.ts               # Address-related parsers and DTOs
      common.ts                # Shared XML utilities and base functions
      customer.ts              # Customer-related parsers and DTOs
      index.ts                 # Parser module exports
      job.ts                   # Job-related parsers and mappers
      pricelist.ts             # Pricelist-related parsers and DTOs
      resource.ts              # Resource-related parsers and DTOs
      workflow.ts              # Workflow-related parsers

  services/
    dataAdmin30.ts             # Administrative functions (countries, languages, workflows, etc.)
    dataCustomer30.core.ts     # Core customer operations
    dataCustomer30.misc.ts     # Miscellaneous customer operations
    dataCustomerAddress30.core.ts # Customer address management operations
    dataCustomFields30.ts      # Custom fields management (properties, text modules)
    dataDocument30.ts          # Document management operations
    dataItem30.core.ts         # Core item operations
    dataItem30.misc.ts         # Miscellaneous item operations
    dataItem30.prices.ts       # Item pricing operations
    dataJob30.core.ts          # Core job operations
    dataJob30.misc.ts          # Miscellaneous job operations
    dataJob30.prices.ts        # Job pricing operations
    dataJob30.ts               # Main job operations
    dataOrder30.core.ts        # Core order operations
    dataOrder30.misc.ts        # Miscellaneous order operations
    dataResource30.core.ts     # Core resource operations
    dataResource30.misc.ts     # Miscellaneous resource operations
    loadOptions.ts             # Dynamic dropdown population functions
    plunetApi.session.ts       # Centralized session handling
    plunetApi.ts               # Authentication operations (login/validate/logout)
```

Publishable files end up in `dist/…`. `package.json` includes:

```json
"main": "dist/index.js",
"types": "dist/index.d.ts",
"n8n": {
  "n8nNodesApiVersion": 1,
  "credentials": ["dist/credentials/PlunetApi.credentials.js"],
  "nodes": ["dist/nodes/Plunet/Plunet.node.js"]
}
```

---

## Credentials

Add **Plunet API** credentials in n8n:

* **baseHost**: e.g. `my.plunet.host` (no protocol)
* **useHttps**: `true` for HTTPS
* **username** / **password**
* **timeout** (optional, ms; default `30000`)

> Credentials are stored by n8n; **never** returned in node outputs.

---

## Supported Plunet API Services

This node integrates with multiple Plunet API services for comprehensive functionality:

### 🔐 PlunetAPI (Authentication)
**Reference**: [PlunetAPI Documentation](https://apidoc.plunet.com/latest/BM/API/SOAP/Webservice/Internal/PlunetAPI.html)

* **Login** → returns `{ uuid }` with automatic session caching
* **Validate** → validates session with UUID + Username + Password
* **Logout** → terminates session and clears cache

### 👥 DataCustomer30 (Customer Management)
**Reference**: [DataCustomer30 Documentation](https://apidoc.plunet.com/latest/BM/Partner/API/SOAP/Webservice/Version30/DataCustomer30.html)

**Core Operations:**
* **Create Customer** (`insert2`) - Create new customer with full object
* **Update Customer** (`update`) - Update existing customer
* **Delete Customer** (`delete`) - Remove customer
* **Get Customer** (`getCustomerObject`) - Retrieve customer details
* **Search Customers** (`search`) - Search with filters
* **Search by External ID** (`seekByExternalID`) - Find by external identifier
* **Get All Customers** (`getAllCustomerObjects`) - List all customers

**Field Operations:**
* Status management (`getStatus`/`setStatus`) with enum dropdown
* Payment information (`getPaymentInformation`/`setPaymentInformation`)
* Account manager assignment (`getAccountManagerID`/`setAccountManagerID`)
* Project manager assignment (`getProjectManagerID`/`setProjectManagerID`)
* Contact information (`getDateOfInitialContact`, `getSourceOfContact`, `getDossier`)

**Enums & Dropdowns:**
* **Customer Status**: Active, Inactive, etc.
* **Tax Type**: For payment information
* **Form of Address**: Mr., Mrs., Dr., etc.

### 🏠 DataCustomerAddress30 (Customer Address Management)
**Reference**: [DataCustomerAddress30 Documentation](https://apidoc.plunet.com/latest/BM/Partner/API/SOAP/Webservice/Version30/DataCustomerAddress30.html)

**Core Operations:**
* **Create Customer Address** (`insert2`) - Create new customer address
* **Update Customer Address** (`update`) - Update existing address with null/empty value support
* **Delete Customer Address** (`delete`) - Remove customer address
* **Get All Customer Addresses** (`getAllAddresses`) - Retrieve all address IDs for a customer
* **Get Address Object** (`GetAddressObject`) - Fusion function to get complete address data

**Address Fields:**
* **Address Type** (mandatory): Delivery, Invoice, Other
* **Description**: Address description/label
* **Name Fields**: Name1, Name2 for contact names
* **Office**: Office or department name
* **Location Fields**: Street, Street2, City, ZIP Code, State
* **Country**: Dynamic dropdown from Plunet API

**Fusion Function Features:**
* **Single API Call**: GetAddressObject retrieves all address fields in one operation
* **Enriched Data**: Returns both address type ID and human-readable label
* **Complete Information**: All address fields with proper formatting

**Enums & Dropdowns:**
* **Address Type**: Delivery (1), Invoice (2), Other (3)
* **Country**: Dynamic list from DataAdmin30.getAvailableCountries

### 👤 DataResource30 (Resource Management)
**Reference**: [DataResource30 Documentation](https://apidoc.plunet.com/latest/BM/Partner/API/SOAP/Webservice/Version30/DataResource30.html)

**Core Operations:**
* **Create Resource** (`insertObject`) - Create new resource
* **Update Resource** (`update`) - Update existing resource
* **Delete Resource** (`delete`) - Remove resource
* **Get Resource** (`getResourceObject`) - Retrieve resource details
* **Search Resources** (`search`) - Search with filters
* **Search by External ID** (`seekByExternalID`) - Find by external identifier
* **Get All Resources** (`getAllResourceObjects`) - List all resources

**Status & Type Management:**
* **Resource Status** (`getStatus`/`setStatus`) - Active, Inactive, etc.
* **Working Status** (`getWorkingStatus`/`setWorkingStatus`) - Available, Busy, etc.
* **Resource Type** (`getResourceType`/`setResourceType`) - Translator, Reviewer, etc.

**Pricelist Operations:**
* **Get Pricelists** (`getPricelists`) - Get all pricelists for resource
* **Get Pricelists by Language Pair** (`getPricelists2`) - Language-specific pricelists

### 📋 DataJob30 (Job Management)
**Reference**: [DataJob30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Job/API/SOAP/Webservice/Version30/DataJob30.html)

**Core Operations:**
* **Create Job** (`insert2`) - Create new job
* **Update Job** (`update`) - Update existing job
* **Delete Job** (`delete`) - Remove job
* **Get Job** (`getJobObject`) - Retrieve job details
* **Search Jobs** (`search`) - Search with filters
* **Get All Jobs** (`getAllJobObjects`) - List all jobs

**Job Status Management:**
* **Job Status** (`getStatus`/`setStatus`) - In Progress, Completed, etc.
* **Project Type** (`getProjectType`/`setProjectType`) - Translation, Review, etc.

**Pricing Operations:**
* **Get Pricelists** (`getPricelists`) - Get job pricelists
* **Price Management** - Various pricing operations

### 📄 DataDocument30 (Document Management)
**Reference**: [DataDocument30 Documentation](https://apidoc.plunet.com/latest/BM/API/SOAP/Webservice/Internal/Version30/DataDocument30.html)

**Document Operations:**
* **Upload Document** (`uploadDocument`) - Upload files to Plunet
* **Download Document** (`downloadDocument`) - Download files from Plunet
* **Get Document Info** (`getDocumentInfo`) - Retrieve document metadata
* **Delete Document** (`deleteDocument`) - Remove documents
* **List Documents** (`getDocumentList`) - List all documents for entity

**Document Management Features:**
* **File Upload/Download** - Direct file operations with Plunet
* **Document Metadata** - Retrieve document information and properties
* **Document Organization** - List and manage documents by entity
* **File Type Support** - Various document formats supported

### ⚙️ DataAdmin30 (Administrative Functions)
**Reference**: [DataAdmin30 Documentation](https://apidoc.plunet.com/latest/BM/Admin/API/SOAP/Webservice/Version30/DataAdmin30.html)

**System Information:**
* **Get Available Countries** (`getAvailableCountries`) - List all countries
* **Get Available Languages** (`getAvailableLanguages`) - List all languages
* **Get Available Workflows** (`getAvailableWorkflows`) - List all workflows
* **Get System Currencies** (`getSystemCurrencies`) - List all currencies
* **Get Available Services** (`getAvailableServices`) - List all job types/services

**Custom Fields:**
* **Get Available Properties** (`getAvailableProperties`) - List custom properties
* **Get Available Text Modules** (`getAvailableTextModules`) - List text modules
* **Get Company Codes** (`getCompanyCodeList`) - List company codes

**Document Templates:**
* **Get Document Templates** (`getAvailableDocumentTemplates`) - List templates

### 🔧 DataCustomFields30 (Custom Fields Management)
**Custom Field Operations:**
* **Get Property** (`getProperty`) - Retrieve custom property value
* **Set Property** (`setProperty`) - Set custom property value
* **Get Text Module** (`getTextModule`) - Retrieve text module content
* **Set Text Module** (`setTextModule`) - Set text module content

**Text Module Features:**
* **Dynamic Content Types**: String, Single Select, Multi Select, Date
* **Usage Area Support**: Different text module categories
* **Language Support**: Multi-language text modules

### 📋 DataOrder30 (Order Management)
**Reference**: [DataOrder30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Order/API/SOAP/Webservice/Version30/DataOrder30.html)

**Core Operations:**
* **Get Order** (`getOrderObject`) - Retrieve order details with optional extended object data
* **Create Order** (`insert2`) - Create new order with comprehensive field support
* **Update Order** (`update`) - Update existing order with all field operations
* **Delete Order** (`delete`) - Remove order
* **Search Orders** (`search`) - Search orders with various criteria

**Order Fields:**
* **Project Information**: Project name, manager, category, status
* **Customer Details**: Customer ID, contact person, delivery deadline
* **Financial**: Currency, rate, reference number
* **Timeline**: Order date, creation date, delivery deadline
* **Standards**: EN15038 compliance, external ID, master project

### 📦 DataItem30 (Item Management)
**Reference**: [DataItem30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Item/API/SOAP/Webservice/Version30/DataItem30.html)

**Core Operations:**
* **Get Item** (`getItemObject`) - Retrieve single item by ID
* **Get All Items** (`getAllItemObjects`) - Retrieve all items for a project
* **Create Item** (`insert2`) - Create new item with advanced options
* **Update Item** (`update`) - Update existing item with advanced options
* **Delete Item** (`delete`) - Remove item

**Item Fields:**
* **Language Information**: Source language, target language, language combination
* **Content Details**: Word count, character count, item status
* **Project Context**: Project ID, project type, workflow information
* **Comments**: Item comments and notes

### 💰 DataItem30Prices (Item Pricing)
**Reference**: [DataItem30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Item/API/SOAP/Webservice/Version30/DataItem30.html)

**Pricing Operations:**
* **Get Price Lines** (`getPriceLine_List`) - Retrieve price lines for an item
* **Get Price Lines by Currency** (`getPriceLine_ListByCurrency`) - Currency-specific price lines
* **Get Price Units** (`getPriceUnit_List`) - Retrieve price units for an item
* **Get Price Units by Currency** (`getPriceUnit_ListByCurrency`) - Currency-specific price units
* **Get Pricelists** (`getPricelist_List`) - Get pricelists for an item
* **Get Pricelist Entries** (`getPricelistEntry_List`) - Get pricelist entries for an item

### 💰 DataJob30Prices (Job Pricing)
**Reference**: [DataJob30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Job/API/SOAP/Webservice/Version30/DataJob30.html)

**Pricing Operations:**
* **Get Job Metrics** (`getJobMetrics`) - Retrieve metrics for a job
* **Get Price Lines** (`getPriceLine_List`) - Retrieve price lines for a job
* **Get Price Lines by Currency** (`getPriceLine_ListByCurrency`) - Currency-specific price lines
* **Get Price Units** (`getPriceUnit_List`) - Retrieve price units for a job
* **Get Price Units by Currency** (`getPriceUnit_ListByCurrency`) - Currency-specific price units
* **Get Pricelists** (`getPricelist_List`) - Get pricelists for a job
* **Get Pricelist Entries** (`getPricelistEntry_List`) - Get pricelist entries for a job

### 👤 DataCustomerContact30 (Customer Contact Management)
**Reference**: [DataCustomerContact30 Documentation](https://apidoc.plunet.com/latest/BM/Partner/API/SOAP/Webservice/Version30/DataCustomerContact30.html)

**Core Operations:**
* **Get Many Contact Objects** (`getAllContactObjects`) - Retrieve all contacts for a customer
* **Get Contact Object** (`getContactObject`) - Retrieve single contact by ID
* **Get by External ID** (`seekByExternalID`) - Find contacts by external identifier
* **Create Contact** (`insert2`) - Create new customer contact
* **Update Contact** (`update`) - Update existing contact
* **Delete Contact** (`delete`) - Remove contact

**Contact Fields:**
* **Personal Information**: Name, title, form of address
* **Contact Details**: Email, phone, mobile, fax
* **Status**: Contact person status and availability
* **External Integration**: External ID for system integration

### 🔧 DataCustomer30Misc (Customer Field Operations)
**Reference**: [DataCustomer30 Documentation](https://apidoc.plunet.com/latest/BM/Partner/API/SOAP/Webservice/Version30/DataCustomer30.html)

**Field Operations:**
* **Get by External ID** (`seekByExternalID`) - Find customer by external identifier
* **Get All Customers** (`getAllCustomerObjects`) - List all customers
* **Status Management** (`getStatus`/`setStatus`) - Customer status operations
* **Payment Information** (`getPaymentInformation`/`setPaymentInformation`) - Payment details
* **Account Manager** (`getAccountManagerID`/`setAccountManagerID`) - Manager assignment
* **Project Manager** (`getProjectManagerID`/`setProjectManagerID`) - Project manager assignment
* **Contact Information** (`getDateOfInitialContact`, `getSourceOfContact`, `getDossier`) - Contact details
* **Workflow Management** (`getWorkflowList`/`setWorkflowList`) - Workflow assignments

### 🔧 DataResource30Misc (Resource Field Operations)
**Reference**: [DataResource30 Documentation](https://apidoc.plunet.com/latest/BM/Partner/API/SOAP/Webservice/Version30/DataResource30.html)

**Field Operations:**
* **Get by External ID** (`seekByExternalID`) - Find resource by external identifier
* **Get All Resources** (`getAllResourceObjects`) - List all resources
* **Status Management** (`getStatus`/`setStatus`) - Resource status operations
* **Working Status** (`getWorkingStatus`/`setWorkingStatus`) - Working status management
* **Resource Type** (`getResourceType`/`setResourceType`) - Resource type operations
* **Payment Information** (`getPaymentInformation`/`setPaymentInformation`) - Payment details
* **Pricelist Operations** (`getPricelists`/`getPricelists2`) - Pricelist management

### 🔧 DataOrder30Misc (Order Field Operations)
**Reference**: [DataOrder30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Order/API/SOAP/Webservice/Version30/DataOrder30.html)

**Field Operations:**
* **Get Creation Date** (`getCreationDate`) - Retrieve order creation date
* **Get Order Status** (`getOrderStatus`/`setOrderStatus`) - Order status management
* **Get Project Manager** (`getProjectManagerID`/`setProjectManagerID`) - Project manager assignment
* **Get Customer** (`getCustomerID`/`setCustomerID`) - Customer assignment
* **Get Customer Contact** (`getCustomerContactID`/`setCustomerContactID`) - Contact assignment
* **Get Delivery Deadline** (`getDeliveryDeadline`/`setDeliveryDeadline`) - Deadline management
* **Get Order Date** (`getOrderDate`/`setOrderDate`) - Order date operations
* **Get Project Name** (`getProjectName`/`setProjectName`) - Project name management
* **Get Reference Number** (`getReferenceNumber`/`setReferenceNumber`) - Reference management
* **Get Subject** (`getSubject`/`setSubject`) - Subject management
* **Get Rate** (`getRate`/`setRate`) - Rate management
* **Get Currency** (`getCurrency`/`setCurrency`) - Currency operations
* **Get External ID** (`getExternalID`/`setExternalID`) - External ID management
* **Get Master Project** (`getMasterProjectID`/`setMasterProjectID`) - Master project assignment
* **Get Project Category** (`getProjectCategory`/`setProjectCategory`) - Category management
* **Get Project Status** (`getProjectStatus`/`setProjectStatus`) - Project status operations
* **Get EN15038** (`getEN15038Requested`/`setEN15038Requested`) - EN15038 standard compliance
* **Get Request ID** (`getRequestID`/`setRequestID`) - Request ID management
* **Get Creation Date** (`getCreationDate`/`setCreationDate`) - Creation date operations
* **Get Project Manager Memo** (`getProjectManagerMemo`/`setProjectManagerMemo`) - Memo management
* **Get Archive Status** (`getArchiveStatus`/`setArchiveStatus`) - Archive status operations
* **Get All Orders** (`getAllOrderObjects`) - List all orders
* **Search Orders** (`search`) - Search orders with filters

### 🔧 DataItem30Misc (Item Field Operations)
**Reference**: [DataItem30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Item/API/SOAP/Webservice/Version30/DataItem30.html)

**Field Operations:**
* **Get Comment** (`getComment`/`setComment`) - Item comment management
* **Get Default Contact Person** (`getDefaultContactPerson`/`setDefaultContactPerson`) - Contact person assignment
* **Get Source Language** (`getSourceLanguage`/`setSourceLanguage`) - Source language operations
* **Get Target Language** (`getTargetLanguage`/`setTargetLanguage`) - Target language operations
* **Get Language Combination** (`getLanguageCombination`/`setLanguageCombination`) - Language pair management
* **Get Word Count** (`getWordCount`/`setWordCount`) - Word count operations
* **Get Character Count** (`getCharacterCount`/`setCharacterCount`) - Character count operations
* **Get Item Status** (`getItemStatus`/`setItemStatus`) - Item status management
* **Get Workflow** (`getWorkflow`/`setWorkflow`) - Workflow assignment
* **Get All Items** (`getAllItemObjects`) - List all items for a project
* **Search Items** (`search`) - Search items with filters

### 🔧 DataJob30Misc (Job Field Operations)
**Reference**: [DataJob30 Documentation](https://apidoc.plunet.com/latest/BM/Projekt/Job/API/SOAP/Webservice/Version30/DataJob30.html)

**Field Operations:**
* **Update Job Status** (`setJobStatus`) - Job status management
* **Run Automatic Job** (`runAutomaticJob`) - Execute automatic job processes
* **Get Job Status** (`getJobStatus`/`setJobStatus`) - Job status operations
* **Get Project Type** (`getProjectType`/`setProjectType`) - Project type management
* **Get Resource** (`getResourceID`/`setResourceID`) - Resource assignment
* **Get Delivery Date** (`getDeliveryDate`/`setDeliveryDate`) - Delivery date management
* **Get Start Date** (`getStartDate`/`setStartDate`) - Start date operations
* **Get End Date** (`getEndDate`/`setEndDate`) - End date operations
* **Get Word Count** (`getWordCount`/`setWordCount`) - Word count operations
* **Get Character Count** (`getCharacterCount`/`setCharacterCount`) - Character count operations
* **Get Page Count** (`getPageCount`/`setPageCount`) - Page count operations
* **Get Comment** (`getComment`/`setComment`) - Job comment management
* **Get All Jobs** (`getAllJobObjects`) - List all jobs
* **Search Jobs** (`search`) - Search jobs with filters

---

## Multi-Endpoint Operations (Enhanced UX)

Some operations use multiple endpoints to provide a better user experience:

### 🔄 Property Loading with LoadOptions
**Operation**: `getProperty` in DataCustomFields30
**Enhancement**: Uses DataAdmin30.getAvailableProperties for dynamic dropdown population

**How it works:**
1. User selects "Property Usage Area" and "Main ID"
2. System calls DataAdmin30.getAvailableProperties with these parameters
3. Returns list of available properties for the selected context
4. User selects from populated dropdown instead of typing property names

### 📝 Text Module Loading with LoadOptions
**Operation**: `getTextModule`/`setTextModule` in DataCustomFields30
**Enhancement**: Uses DataAdmin30.getAvailableTextModules for dynamic dropdown population

**How it works:**
1. User selects "Text Module Usage Area" and "Main ID"
2. System calls DataAdmin30.getAvailableTextModules with these parameters
3. Returns list of available text modules with labels
4. User selects from populated dropdown with format "[Flag] - Label"

### 🏢 Pricelist Loading with LoadOptions
**Operation**: `getPricelists` in DataResource30
**Enhancement**: Uses DataAdmin30.getAvailableServices for service type dropdown

**How it works:**
1. User selects service type from dropdown
2. System calls DataAdmin30.getAvailableServices to populate options
3. Returns pricelists filtered by service type

---

## Output Shapes (what you get in n8n)

| Result Type | Output Key(s) | Description |
|-------------|--------------|--------------|
| **StringResult** | `data: string` | Simple string responses |
| **IntegerResult** | `value: number` | Numeric values with enum expansion |
| **IntegerArrayResult** | `data: number[]` | Arrays of numeric values |
| **CustomerResult** | `customer: object` | Structured customer data |
| **CustomerListResult** | `customers: object[]` | Array of customer objects |
| **ResourceResult** | `resource: object` | Structured resource data |
| **ResourceListResult** | `resources: object[]` | Array of resource objects |
| **JobResult** | `job: object` | Structured job data |
| **JobListResult** | `jobs: object[]` | Array of job objects |
| **DocumentResult** | `document: object` | Document metadata and content |
| **WorkflowListResult** | `workflows: object[]` | Array of workflow objects with enriched labels |
| **CountryListResult** | `countries: object[]` | Array of country objects |
| **LanguageListResult** | `languages: object[]` | Array of language objects |
| **CurrencyListResult** | `currencies: object[]` | Array of currency objects |
| **PropertyResult** | `property: object` | Custom property data |
| **TextModuleResult** | `textModule: object` | Text module data with enriched labels |

---

## Enriched Response Examples

### Workflow Response with Labels
```json
{
  "success": true,
  "resource": "DataAdmin30",
  "operation": "getAvailableWorkflows",
  "workflows": [
    {
      "description": "",
      "name": "2 TRA jobs + REV + EXP",
      "status": 1,
      "statusLabel": "Released",
      "type": 0,
      "typeLabel": "Standard",
      "workflowId": 14
    }
  ],
  "statusMessage": "OK",
  "statusCode": 0
}
```

### Text Module Response with Labels
```json
{
  "success": true,
  "resource": "DataCustomFields30",
  "operation": "getTextModule",
  "data": {
    "flag": "[Textmodule4]",
    "textModuleLabel": "Number",
    "flag_MainTextModule": "",
    "textModuleType": 6,
    "textModuleTypeName": "Number Field",
    "availableValues": "1634",
    "selectedValues": "1634",
    "stringValue": "1634"
  },
  "statusMessage": "OK",
  "statusCode": 0
}
```

---

## Enums and Dropdowns

The node provides human-readable dropdowns for all enum fields:

### Customer Enums
* **Customer Status**: Active, Inactive, etc.
* **Tax Type**: VAT, No Tax, etc.
* **Form of Address**: Mr., Mrs., Dr., etc.

### Resource Enums
* **Resource Status**: Active, Inactive, etc.
* **Working Status**: Available, Busy, On Leave, etc.
* **Resource Type**: Translator, Reviewer, Project Manager, etc.

### Job Enums
* **Job Status**: In Progress, Completed, Cancelled, etc.
* **Project Type**: Translation, Review, Proofreading, etc.

### Workflow Enums
* **Workflow Type**: Standard, Order, Quote Order
* **Workflow Status**: In Preparation, Released, Canceled, Released for Selection

### Text Module Enums
* **Text Module Type**: Text Field, List Box, Date Field, Memo Field, etc.
* **Text Module Usage Area**: Customer, Resource, Job, etc.

---

## Example Workflows

### 1. Create Customer with Custom Properties
1. **PlunetAPI → Login** (automatic)
2. **DataAdmin30 → Get Available Properties** (to get property list)
3. **DataCustomFields30 → Set Property** (set custom property value)
4. **DataCustomer30 → Create Customer** (create customer with all data)

### 2. Resource Management with Pricelists
1. **DataResource30 → Create Resource** (create new resource)
2. **DataAdmin30 → Get Available Services** (get service types)
3. **DataResource30 → Get Pricelists** (get pricelists for resource)
4. **DataResource30 → Set Working Status** (update resource status)

### 3. Job Creation
1. **DataJob30 → Create Job** (create job with workflow)
2. **DataJob30 → Set Status** (update job status)
3. **DataDocument30 → Upload Document** (attach files to job)

### 4. Text Module Management
1. **DataAdmin30 → Get Available Text Modules** (get text module list)
2. **DataCustomFields30 → Get Text Module** (retrieve text module content)
3. **DataCustomFields30 → Set Text Module** (update text module with new content)

### 5. Customer Address Management
1. **DataCustomer30 → Get Customer** (retrieve customer details)
2. **DataCustomerAddress30 → Get All Customer Addresses** (list existing addresses)
3. **DataCustomerAddress30 → Create Customer Address** (add new address)
4. **DataCustomerAddress30 → Get Address Object** (retrieve complete address data)

---

## Advanced Use Cases

### 🗂️ Create Projects from Cloud Storage Upload
**Scenario**: Automatically create Plunet projects when files are uploaded to cloud storage

**Workflow**:
1. **Cloud Storage Trigger** (Dropbox, OneDrive, Google Drive) → detects new file upload
2. **DataDocument30 → Upload Document** → upload file to Plunet
3. **DataCustomer30 → Search Customers** → find or create customer based on folder structure
4. **DataJob30 → Create Job** → create translation job with uploaded document
5. **DataAdmin30 → Get Available Workflows** → apply appropriate workflow
6. **DataJob30 → Set Status** → set job to "Ready for Assignment"

**Benefits**: Streamlined project creation, reduced manual data entry, consistent project setup

### 👥 Workflow to Enrich Customer Profiles
**Scenario**: Enhance customer data with external information and standardize addresses

**Workflow**:
1. **DataCustomer30 → Get All Customers** → retrieve customer list
2. **External API Calls** → enrich with company data, industry information
3. **DataCustomerAddress30 → Get All Customer Addresses** → retrieve existing addresses
4. **Address Validation Service** → validate and standardize addresses
5. **DataCustomerAddress30 → Update Customer Address** → update with standardized data
6. **DataCustomFields30 → Set Property** → add enriched data as custom properties
7. **DataCustomer30 → Update Customer** → update customer with enhanced information

**Benefits**: Improved data quality, standardized addresses, enriched customer insights

### 🤖 Workflow for LLM Jobs (MTQE - Machine Translation Quality Estimation)
**Scenario**: Automated quality estimation for machine translation using LLM

**Workflow**:
1. **DataJob30 → Search Jobs** → find completed MT jobs
2. **DataDocument30 → Download Document** → get source and target documents
3. **LLM API Call** (OpenAI, Claude, etc.) → perform quality estimation analysis
4. **DataCustomFields30 → Set Text Module** → store quality scores and feedback
5. **DataJob30 → Create Job** → create review job if quality score is below threshold
6. **DataResource30 → Get Pricelists** → assign appropriate reviewer based on language pair
7. **DataJob30 → Set Status** → update job status based on quality assessment

**Benefits**: Automated quality control, consistent evaluation criteria, efficient resource allocation

### 🌐 Workflow for MT Jobs (DeepL, Google Translate)
**Scenario**: Automated machine translation integration with quality tracking

**Workflow**:
1. **DataJob30 → Get Job** → retrieve job details and source content
2. **DataDocument30 → Download Document** → get source document
3. **MT API Call** (DeepL, Google Translate) → perform machine translation
4. **DataDocument30 → Upload Document** → upload translated document
5. **DataCustomFields30 → Set Property** → store MT engine used and confidence scores
6. **DataJob30 → Set Status** → mark as "MT Complete - Pending Review"
7. **DataJob30 → Create Job** → create post-editing job if required
8. **DataResource30 → Search Resources** → find qualified post-editors

**Benefits**: Faster turnaround times, consistent MT integration, quality tracking

### 📄 Workflow for OCR Jobs (Mistral PDF Feature)
**Scenario**: Automated OCR processing with AI-powered text extraction and formatting

**Workflow**:
1. **DataDocument30 → Get Document List** → find PDF documents requiring OCR
2. **DataDocument30 → Download Document** → retrieve PDF files
3. **OCR API Call** (Mistral PDF, Tesseract, Azure OCR) → extract text from PDFs
4. **LLM Post-Processing** → clean and format extracted text
5. **DataDocument30 → Upload Document** → upload processed text document
6. **DataJob30 → Create Job** → create translation job with OCR'd content
7. **DataCustomFields30 → Set Text Module** → store OCR confidence scores and processing notes
8. **DataJob30 → Set Status** → mark as "OCR Complete - Ready for Translation"

**Benefits**: Automated document processing, improved text quality, faster project initiation

---

## Error Handling

The node provides comprehensive error handling:

* **SOAP Faults**: Any SOAP 1.1/1.2 fault → node error with details
* **Plunet Errors**: Any result with `statusCode !== 0` → node error
* **Status Messages**: Non-"OK" status messages → node error
* **Login Failures**: `<return>refused</return>` → "Login refused" error
* **Session Validation**: Invalid sessions → automatic re-login attempt

---


## Troubleshooting

### Common Issues

**Operation not showing in UI:**
- Ensure the operation is properly registered in the service file
- Check that the operation name matches the SOAP action
- Rebuild and restart n8n

**LoadOptions not working:**
- Verify the loadOptions method is registered in the main node file
- Check parameter names match between UI and loadOptions function
- Ensure the loadOptions function returns proper format

**Login keeps failing:**
- Check credentials (baseHost, username, password)
- Verify HTTPS settings match your Plunet instance
- Check network connectivity and firewall settings

**Session validation fails:**
- Sessions expire after a period of inactivity
- The node will automatically attempt re-login
- Check if your Plunet instance has session timeout settings

**SOAP errors:**
- Check SOAP action names match Plunet API documentation
- Verify parameter names and types
- Check for special characters in parameter values

### Debug Mode

Enable debug logging in n8n to see detailed SOAP requests and responses:

```bash
# Set environment variable
export N8N_LOG_LEVEL=debug
```

---

## Adding New Operations

1. **Choose the service file** (e.g., `services/dataCustomer30.ts`)
2. **Add operation to registry** with parameter order and return type
3. **Add UI properties** for parameters
4. **Implement parsing logic** for response data
5. **Add enum definitions** if needed
6. **Test and build**

Example:
```typescript
// Add to OPERATION_REGISTRY
'newOperation': {
  soapAction: 'newOperation',
  endpoint: 'DataCustomer30',
  uiName: 'New Operation',
  paramOrder: ['param1', 'param2'],
  returnType: 'String'
}
```

---

## License

[MIT](./LICENSE)

---

## Credits

* Node created by **Sufian Reiter**
* Powered by n8n's community node framework
* Based on [Plunet API Documentation](https://apidoc.plunet.com/)

If you encounter any issues or need additional functionality, please open an issue on GitHub.

---

## Recent Updates

### v4.0.0 - Comprehensive Service Implementation & Documentation Update
- **NEW**: Complete DataOrder30 service implementation with full CRUD operations
- **NEW**: Complete DataItem30 service implementation with advanced item management
- **NEW**: DataItem30Prices service with comprehensive pricing operations
- **NEW**: DataJob30Prices service with job metrics and pricing management
- **NEW**: DataCustomerContact30 service for customer contact management
- **NEW**: DataCustomer30Misc service with extensive field operations
- **NEW**: DataResource30Misc service with resource field management
- **NEW**: DataOrder30Misc service with order field operations
- **NEW**: DataItem30Misc service with item field management
- **NEW**: DataJob30Misc service with job field operations
- **NEW**: Work in Progress notice added to documentation
- **Enhanced**: Complete README documentation with all 19 implemented services
- **Enhanced**: Comprehensive operation lists for all services
- **Enhanced**: Detailed field operation documentation
- **Enhanced**: Service architecture with proper separation of concerns
- **Fixed**: All service implementations with proper error handling
- **Fixed**: SOAP request formats and response parsing
- **Fixed**: Load options and dynamic dropdown population

### v3.14.0 - Customer Address Management & Advanced Use Cases
- **NEW**: Complete DataCustomerAddress30 service implementation
- **NEW**: Customer Address resource with CRUD operations (insert2, update, delete, getAllAddresses)
- **NEW**: GetAddressObject fusion function for complete address data retrieval
- **NEW**: AddressType enum with Delivery, Invoice, Other options
- **NEW**: Dynamic country dropdown from Plunet API
- **NEW**: Advanced use cases documentation for cloud storage, LLM, MT, and OCR workflows
- **Enhanced**: README with comprehensive Customer Address documentation
- **Enhanced**: File structure documentation with all current services
- **Fixed**: SOAP request formats for proper API compatibility
- **Fixed**: Country load options with proper parameter handling

### v3.13.x - Beta Development Series
- Multiple beta releases for Customer Address functionality development
- SOAP request format fixes and improvements
- Load options implementation and debugging
- Service architecture refinements

### v3.8.0 - Comprehensive Documentation Update
- Complete rewrite of README.md with accurate file structure
- Fixed file paths and directory structure documentation
- Added all missing service files and enum definitions
- Corrected build instructions and file references
- Enhanced architecture documentation with complete module listing

### v3.7.33 - Workflow Response Enrichment
- Added WorkflowType and WorkflowStatus enums
- Enhanced workflow responses with human-readable labels
- Improved user experience for workflow selection
