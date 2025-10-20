# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.0] - 2024-01-15

### Added
- **Debug Mode**: Credential-level debug mode for troubleshooting API issues
  - Enable in Plunet credentials to see sanitized SOAP envelopes in responses
  - Automatic UUID and sensitive data redaction for security
  - Includes request URL, SOAP action, envelope, and response XML
- **Enhanced Error Messages**: Operation context in all error messages
  - Format: `[Resource] operation: message [statusCode]`
  - Better debugging and troubleshooting capabilities
- **Centralized Error Handling**: New `PlunetOperationError` class with factory methods
- **Debug Module**: New `DebugManager` class for consistent debug output formatting

### Changed
- **Breaking Change**: Error message format now includes operation context
  - Old: `"Customer not found"`
  - New: `"[Customer] getCustomer: Customer not found [404]"`
- **Error Handling**: All errors now use standardized `PlunetOperationError` format
- **Code Quality**: Removed duplicate `escapeXml` and `labelize` functions
- **Type Safety**: Added `enableDebugMode` to `Creds` type definition

### Security
- **UUID Redaction**: Debug mode automatically redacts UUIDs and sensitive data
- **Sanitized Envelopes**: SOAP envelopes in debug output are sanitized for security

### Technical Details
- **XML Compatibility**: All XML parsing and building logic preserved (no breaking changes)
- **Session Management**: Unchanged - existing session caching continues to work
- **API Response Structure**: Unchanged - all existing response formats preserved
- **Core Functionality**: Unchanged - all operations work identically

### Migration Guide

#### For Users
1. **Test in Development**: Test your workflows in a development environment first
2. **Review Error Handling**: Check if your workflows parse error messages (they shouldn't rely on exact text)
3. **Debug Mode**: Only enable debug mode when troubleshooting API issues
4. **Stay on v4.x**: If you need the old error format, use `npm install n8n-nodes-plunet@^4.0.0`

#### For Developers
- Error message parsing should use error types, not exact text matching
- Debug mode is opt-in and defaults to false
- All existing XML parsing and building logic is preserved

### Compatibility
- **n8n**: Compatible with n8n community node standards
- **Plunet API**: All existing API operations preserved
- **TypeScript**: Full type safety maintained
- **Node.js**: Compatible with Node 18+

## [4.0.0] - Previous Release

### Features
- Session Management with UUID caching
- Multi-Service Integration (19+ Plunet API services)
- Enhanced UX with user-friendly field names
- Type Safety with full TypeScript support
- Error Handling with meaningful messages
- Enum Support with human-readable dropdowns
- Load Options with dynamic dropdown population
- Structured Responses with clean JSON output
- Advanced Item Operations
- Language Management
- Workflow Integration
- Pricing Operations

---

## Migration Notes

### From v4.x to v5.0.0

**What Changed:**
- Error message format now includes operation context
- Debug mode available in credentials (opt-in)
- Enhanced error handling throughout

**What Stayed the Same:**
- All XML parsing and building logic
- All API response structures
- All operation functionality
- Session management
- Core node behavior

**Action Required:**
- Test workflows in development environment
- Review error handling (don't rely on exact error text)
- Consider enabling debug mode for troubleshooting

**Rollback:**
If you need to rollback to v4.x:
```bash
npm install n8n-nodes-plunet@^4.0.0
```

---

## Support

For issues or questions:
- GitHub Issues: [Report issues here](https://github.com/SufiSR/PlunetN8N/issues)
- Documentation: See README.md for detailed usage instructions
- Debug Mode: Enable in credentials for troubleshooting API issues
