# Plunet N8N Integration - API Reference

This document provides detailed information about all available operations in the Plunet N8N integration.

## Table of Contents

- [Authentication Service](#authentication-service)
- [Customer Service](#customer-service)
- [Order Service](#order-service)
- [Error Handling](#error-handling)
- [Data Types](#data-types)

## Authentication Service

The authentication service handles login, logout, and session management with the Plunet API.

### Operations

#### Login
Authenticates with Plunet and returns a session UUID.

**Parameters:** None (uses credentials)

**Response:**
```json
{
  "operation": "login",
  "success": true,
  "uuid": "12345678-1234-1234-1234-123456789abc",
  "message": "Successfully authenticated with Plunet API"
}
```

#### Logout
Ends the current session.

**Parameters:**
- `uuid` (string, optional): Session UUID to logout. If not provided, uses current session.

**Response:**
```json
{
  "operation": "logout",
  "success": true,
  "message": "Successfully logged out from Plunet API"
}
```

#### Validate Session
Checks if the current session is valid.

**Parameters:**
- `uuid` (string, optional): Session UUID to validate. If not provided, uses current session.

**Response:**
```json
{
  "operation": "validate",
  "success": true,
  "valid": true,
  "uuid": "12345678-1234-1234-1234-123456789abc"
}
```

#### Get Version
Returns the Plunet API version.

**Parameters:** None

**Response:**
```json
{
  "operation": "getVersion",
  "success": true,
  "data": "3.0"
}
```

#### Get Plunet Version
Returns the Plunet BusinessManager version.

**Parameters:** None

**Response:**
```json
{
  "operation": "getPlunetVersion",
  "success": true,
  "data": "9.5.2"
}
```

## Customer Service

The customer service provides complete CRUD operations for customer management.

### Operations

#### Create Customer (insert)
Creates a new customer record.

**Parameters:**
- `customerData` (object): Customer information
  - `name1` (string): Primary customer name
  - `name2` (string, optional): Secondary customer name
  - `fullName` (string, optional): Complete customer name
  - `email` (string, optional): Customer email address
  - `phone` (string, optional): Customer phone number
  - `fax` (string, optional): Customer fax number
  - `website` (string, optional): Customer website URL
  - `status` (number): Customer status (1=Active, 0=Inactive)
  - `customerType` (number): Type of customer (1=Direct, 2=Agency, 3=Partner)
  - `currency` (string): Customer currency (ISO code)
  - `paymentTerms` (number): Payment terms in days
  - `taxID` (string, optional): Tax identification number
  - `externalID` (string, optional): External system customer ID

**Response:**
```json
{
  "operation": "insert",
  "success": true,
  "data": {
    "customerID": 12345,
    "result": "Customer created successfully"
  }
}
```

#### Get Customer (getCustomerObject)
Retrieves customer details by ID.

**Parameters:**
- `customerID` (number): The ID of the customer

**Response:**
```json
{
  "operation": "getCustomerObject",
  "success": true,
  "data": {
    "customerID": 12345,
    "name1": "ACME Corporation",
    "email": "contact@acme.com",
    "phone": "+1-555-0123",
    "status": 1,
    "currency": "USD",
    "customerType": 1,
    "paymentTerms": 30
  }
}
```

#### Update Customer
Updates existing customer information.

**Parameters:**
- `customerID` (number): The ID of the customer to update
- `customerData` (object): Customer information to update (same fields as create)

**Response:**
```json
{
  "operation": "update",
  "success": true,
  "data": {
    "result": "Customer updated successfully"
  }
}
```

#### Delete Customer
Deletes a customer record.

**Parameters:**
- `customerID` (number): The ID of the customer to delete

**Response:**
```json
{
  "operation": "delete",
  "success": true,
  "data": {
    "result": "Customer deleted successfully"
  }
}
```

#### Search Customers (seek)
Searches for customers based on criteria.

**Parameters:**
- `searchText` (string): Text to search for
- `searchType` (string): Field to search in (name, email, externalID, all)
- `additionalOptions` (object, optional):
  - `includeInactive` (boolean): Include inactive customers
  - `limit` (number): Maximum results to return
  - `offset` (number): Number of results to skip

**Response:**
```json
{
  "operation": "seek",
  "success": true,
  "data": [
    {
      "customerID": 12345,
      "name1": "ACME Corporation",
      "email": "contact@acme.com",
      "status": 1
    }
  ]
}
```

#### Get All Customers (getAllCustomerObjects)
Retrieves all customer records.

**Parameters:**
- `additionalOptions` (object, optional):
  - `includeInactive` (boolean): Include inactive customers
  - `limit` (number): Maximum results to return
  - `offset` (number): Number of results to skip

**Response:**
```json
{
  "operation": "getAllCustomerObjects",
  "success": true,
  "data": [
    {
      "customerID": 12345,
      "name1": "ACME Corporation",
      "email": "contact@acme.com",
      "status": 1
    },
    {
      "customerID": 12346,
      "name1": "Beta Industries",
      "email": "info@beta.com",
      "status": 1
    }
  ]
}
```

#### Get Customer List (getCustomerList)
Retrieves a simplified list of customers.

**Parameters:** None

**Response:**
```json
{
  "operation": "getCustomerList",
  "success": true,
  "data": [
    {
      "customerID": 12345,
      "name": "ACME Corporation"
    },
    {
      "customerID": 12346,
      "name": "Beta Industries"
    }
  ]
}
```

## Order Service

The order service manages translation orders and their lifecycle.

### Operations

#### Create Order (insert)
Creates a new order.

**Parameters:**
- `orderData` (object): Order information
  - `customerID` (number, required): ID of the customer
  - `orderName` (string): Name/title of the order
  - `projectName` (string): Name of the project
  - `subject` (string): Order subject/description
  - `orderDate` (datetime): Date when the order was created
  - `deliveryDate` (datetime): Expected delivery date
  - `currency` (string): Order currency (ISO code)
  - `rate` (number): Exchange rate
  - `sourceLanguage` (string): Source language code
  - `targetLanguages` (string): Comma-separated target language codes
  - `priority` (number): Priority level (1=Low, 2=Normal, 3=High, 4=Urgent)
  - `externalID` (string): External system order ID
  - `reference` (string): Order reference number
  - `contactPersonID` (number): ID of the contact person

**Response:**
```json
{
  "operation": "insert",
  "success": true,
  "data": {
    "orderID": 67890,
    "result": "Order created successfully"
  }
}
```

#### Get Order (getOrderObject)
Retrieves order details by ID.

**Parameters:**
- `orderID` (number): The ID of the order

**Response:**
```json
{
  "operation": "getOrderObject",
  "success": true,
  "data": {
    "orderID": 67890,
    "customerID": 12345,
    "orderName": "Website Translation Project",
    "projectName": "ACME Website Localization",
    "sourceLanguage": "EN",
    "targetLanguages": "DE,FR,ES",
    "deliveryDate": "2024-01-15T10:00:00Z",
    "priority": 2,
    "status": 1
  }
}
```

#### Update Order
Updates existing order information.

**Parameters:**
- `orderID` (number): The ID of the order to update
- `orderData` (object): Order information to update (same fields as create)

**Response:**
```json
{
  "operation": "update",
  "success": true,
  "data": {
    "result": "Order updated successfully"
  }
}
```

#### Delete Order
Deletes an order record.

**Parameters:**
- `orderID` (number): The ID of the order to delete

**Response:**
```json
{
  "operation": "delete",
  "success": true,
  "data": {
    "result": "Order deleted successfully"
  }
}
```

#### Set Order Status (setStatus)
Updates the status of an order.

**Parameters:**
- `orderID` (number): The ID of the order
- `status` (number): New status (1=New, 2=In Progress, 3=Completed, 4=Cancelled, 5=On Hold)

**Response:**
```json
{
  "operation": "setStatus",
  "success": true,
  "data": {
    "result": "Order status updated successfully"
  }
}
```

#### Get Order Status (getStatus)
Retrieves the current status of an order.

**Parameters:**
- `orderID` (number): The ID of the order

**Response:**
```json
{
  "operation": "getStatus",
  "success": true,
  "data": {
    "orderID": 67890,
    "status": 2,
    "statusText": "In Progress"
  }
}
```

#### Search Orders (seek)
Searches for orders based on criteria.

**Parameters:**
- `searchText` (string): Text to search for
- `searchType` (string): Field to search in (orderName, projectName, subject, reference, externalID, all)
- `dateFilters` (object, optional):
  - `fromDate` (datetime): Filter orders from this date
  - `toDate` (datetime): Filter orders until this date
  - `dateType` (string): Date field to filter by (orderDate, deliveryDate, creationDate)
- `additionalOptions` (object, optional):
  - `includeCompleted` (boolean): Include completed orders
  - `includeCancelled` (boolean): Include cancelled orders
  - `limit` (number): Maximum results to return
  - `offset` (number): Number of results to skip

**Response:**
```json
{
  "operation": "seek",
  "success": true,
  "data": [
    {
      "orderID": 67890,
      "orderName": "Website Translation Project",
      "customerID": 12345,
      "status": 2,
      "deliveryDate": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### Get All Orders (getAllOrderObjects)
Retrieves all order records.

**Parameters:**
- `dateFilters` (object, optional): Same as search operation
- `additionalOptions` (object, optional): Same as search operation

**Response:**
```json
{
  "operation": "getAllOrderObjects",
  "success": true,
  "data": [
    {
      "orderID": 67890,
      "orderName": "Website Translation Project",
      "customerID": 12345,
      "status": 2
    },
    {
      "orderID": 67891,
      "orderName": "Manual Translation",
      "customerID": 12346,
      "status": 1
    }
  ]
}
```

## Error Handling

All operations return a consistent error format when they fail:

```json
{
  "operation": "operationName",
  "success": false,
  "error": "Detailed error message"
}
```

### Common Error Types

1. **Authentication Errors**
   - Invalid credentials
   - Session expired
   - Server unreachable

2. **Validation Errors**
   - Missing required parameters
   - Invalid parameter values
   - Data type mismatches

3. **SOAP Faults**
   - Server-side errors
   - Business rule violations
   - Database constraints

4. **Network Errors**
   - Connection timeouts
   - DNS resolution failures
   - SSL/TLS errors

## Data Types

### Customer Status
- `0`: Inactive
- `1`: Active

### Customer Type
- `1`: Direct Customer
- `2`: Agency
- `3`: Partner

### Order Status
- `1`: New
- `2`: In Progress
- `3`: Completed
- `4`: Cancelled
- `5`: On Hold

### Order Priority
- `1`: Low
- `2`: Normal
- `3`: High
- `4`: Urgent

### Date Format
All dates should be provided in ISO 8601 format:
- `2024-01-15T10:00:00Z` (UTC)
- `2024-01-15T10:00:00+01:00` (with timezone)

### Language Codes
Use standard language codes:
- `EN`: English
- `DE`: German
- `FR`: French
- `ES`: Spanish
- `IT`: Italian
- `PT`: Portuguese
- `NL`: Dutch
- `RU`: Russian
- `ZH`: Chinese
- `JA`: Japanese

### Currency Codes
Use ISO 4217 currency codes:
- `USD`: US Dollar
- `EUR`: Euro
- `GBP`: British Pound
- `JPY`: Japanese Yen
- `CHF`: Swiss Franc

