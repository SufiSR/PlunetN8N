# N8N Plunet BusinessManager Integration

A comprehensive N8N community node for integrating with Plunet BusinessManager API. This integration provides seamless access to Plunet's SOAP-based API through an intuitive N8N interface.

## Features

- 🔐 **Secure Authentication** - Automatic session management with UUID tokens
- 👥 **Customer Management** - Complete CRUD operations for customer data
- 📋 **Order Management** - Create, update, and track translation orders
- 💰 **Quote Management** - Handle quotes and proposals
- 👷 **Job Management** - Manage translation jobs and assignments
- 🏢 **Resource Management** - Handle translators, vendors, and internal resources
- 📄 **Document Management** - File and document operations
- 🧾 **Invoice Management** - Billing and invoice operations
- 👤 **User Management** - System user administration
- ⚙️ **Admin Functions** - Administrative operations

## Installation

### From N8N Community Nodes

1. Open your N8N instance
2. Go to **Settings** → **Community Nodes**
3. Click **Install a community node**
4. Enter: `n8n-nodes-plunet`
5. Click **Install**

### Manual Installation

```bash
# Navigate to your N8N installation directory
cd ~/.n8n

# Install the package
npm install n8n-nodes-plunet

# Restart N8N
n8n start
```

## Configuration

### 1. Create Plunet API Credentials

1. In N8N, go to **Credentials**
2. Click **Add Credential**
3. Select **Plunet API**
4. Fill in your Plunet details:
   - **Server URL**: Your Plunet instance URL (e.g., `https://your-instance.plunet.com`)
   - **Username**: Your Plunet username
   - **Password**: Your Plunet password
   - **Timeout**: Request timeout in seconds (optional, default: 30)

### 2. Test Connection

The credential setup includes an automatic connection test that will verify:
- Server accessibility
- Valid authentication credentials
- Proper API response

## Usage

### Basic Authentication

```json
{
  "service": "auth",
  "operation": "login"
}
```

### Customer Operations

#### Create a Customer
```json
{
  "service": "customer",
  "operation": "insert",
  "customerData": {
    "name1": "ACME Corporation",
    "email": "contact@acme.com",
    "phone": "+1-555-0123",
    "status": 1,
    "currency": "USD"
  }
}
```

#### Get Customer Details
```json
{
  "service": "customer",
  "operation": "getCustomerObject",
  "customerID": 12345
}
```

#### Search Customers
```json
{
  "service": "customer",
  "operation": "seek",
  "searchText": "ACME",
  "searchType": "name"
}
```

### Order Operations

#### Create an Order
```json
{
  "service": "order",
  "operation": "insert",
  "orderData": {
    "customerID": 12345,
    "orderName": "Website Translation Project",
    "projectName": "ACME Website Localization",
    "sourceLanguage": "EN",
    "targetLanguages": "DE,FR,ES",
    "deliveryDate": "2024-01-15T10:00:00Z",
    "priority": 2
  }
}
```

#### Update Order Status
```json
{
  "service": "order",
  "operation": "setStatus",
  "orderID": 67890,
  "status": 2
}
```

## API Services

### Authentication Service (`auth`)
- `login` - Authenticate and get session UUID
- `logout` - End current session
- `validate` - Check if current session is valid
- `getVersion` - Get Plunet API version
- `getPlunetVersion` - Get Plunet BusinessManager version

### Customer Service (`customer`)
- `insert` - Create a new customer
- `getCustomerObject` - Get customer details by ID
- `update` - Update customer information
- `delete` - Delete a customer
- `seek` - Search for customers
- `getAllCustomerObjects` - Get all customers
- `getCustomerList` - Get list of customers with basic info

### Order Service (`order`)
- `insert` - Create a new order
- `getOrderObject` - Get order details by ID
- `update` - Update order information
- `delete` - Delete an order
- `seek` - Search for orders
- `getAllOrderObjects` - Get all orders
- `setStatus` - Set order status
- `getStatus` - Get order status

## Error Handling

The integration includes comprehensive error handling:

- **SOAP Faults** - Automatically parsed and presented as readable errors
- **Authentication Errors** - Clear messages for login/session issues
- **Validation Errors** - Parameter validation with helpful messages
- **Network Errors** - Timeout and connectivity error handling

## Advanced Features

### Session Management
- Automatic login/logout handling
- Session caching to reduce API calls
- Token validation and refresh

### Data Transformation
- Automatic conversion between N8N JSON and SOAP XML
- Proper handling of complex nested objects
- Date/time format conversion

### Performance Optimization
- Connection pooling for multiple requests
- Efficient XML parsing and generation
- Minimal memory footprint

## Workflow Examples

### Customer Onboarding Workflow
1. **Trigger**: New customer data from webhook/form
2. **Plunet Node**: Create customer record
3. **Plunet Node**: Create initial quote
4. **Email Node**: Send welcome email with quote

### Order Status Monitoring
1. **Schedule Trigger**: Every hour
2. **Plunet Node**: Get all active orders
3. **Filter Node**: Find overdue orders
4. **Slack Node**: Notify project managers

### Automated Invoicing
1. **Plunet Node**: Get completed orders
2. **Filter Node**: Orders ready for invoicing
3. **Plunet Node**: Create invoices
4. **Email Node**: Send invoices to customers

## Troubleshooting

### Common Issues

#### Authentication Failed
- Verify server URL is correct and accessible
- Check username/password credentials
- Ensure Plunet API is enabled for your user

#### SOAP Fault Errors
- Check parameter formats and required fields
- Verify data types match Plunet expectations
- Review Plunet API documentation for specific requirements

#### Timeout Errors
- Increase timeout value in credentials
- Check network connectivity to Plunet server
- Consider breaking large operations into smaller chunks

### Debug Mode

Enable debug logging in N8N to see detailed SOAP requests/responses:

```bash
export N8N_LOG_LEVEL=debug
n8n start
```

## API Reference

For detailed API documentation, refer to:
- [Plunet BusinessManager API Documentation](https://www.plunet.com/en/plunet-businessmanager/interfaces/)
- [N8N Community Nodes Documentation](https://docs.n8n.io/integrations/community-nodes/)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- **Issues**: [GitHub Issues](https://github.com/SufiSR/n8n-nodes-plunet/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SufiSR/n8n-nodes-plunet/discussions)
- **N8N Community**: [N8N Community Forum](https://community.n8n.io/)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

### v1.0.0
- Initial release
- Authentication service implementation
- Customer management operations
- Order management operations
- Comprehensive error handling
- Session management and caching
- SOAP to JSON transformation

---

**Made with ❤️ for the N8N community**

