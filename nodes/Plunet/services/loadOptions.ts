import { ILoadOptionsFunctions, IDataObject } from 'n8n-workflow';
import { Creds } from '../core/types';
import { ExecuteConfig } from '../core/executor';
import { extractResultBase } from '../core/xml';
import { findFirstTagBlock } from '../core/parsers/common';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';

/**
 * Load options for DataCustomFields30 Property Name field
 */
export async function getAvailablePropertyNames(this: ILoadOptionsFunctions) {
  const usageArea = this.getCurrentNodeParameter('PropertyUsageArea') as number;
  const mainID = this.getCurrentNodeParameter('MainID') as number;
      
  if (!usageArea || !mainID) {
    return [
      {
        name: 'Please set Usage Area and Main ID first',
        value: '',
        disabled: true
      }
    ];
  }
  
  try {
    // Get credentials
    const creds = await this.getCredentials('plunetApi') as Creds;
    const scheme = creds.useHttps ? 'https' : 'http';
    const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
    const url = `${baseUrl}/DataAdmin30`;
    const timeoutMs = creds.timeout ?? 30000;
    
    // Create execute config for DataAdmin30
    const config = createAdminExecuteConfig(creds, url, baseUrl, timeoutMs);
    
    // Call getAvailableProperties using a different approach
    // We need to make a direct SOAP call since executeOperation expects IExecuteFunctions
    const sessionId = await config.getSessionId(this as any, 0);
    const soapAction = config.soapActionFor('getAvailableProperties');
    
    // Build SOAP envelope
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:getAvailableProperties>
         <UUID>${sessionId}</UUID>
         <PropertyUsageArea>${usageArea}</PropertyUsageArea>
         <MainID>${mainID}</MainID>
      </api:getAvailableProperties>
   </soap:Body>
</soap:Envelope>`;
    
    // Make SOAP request
    const response = await this.helpers.request({
      method: 'POST',
      url: config.url,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': soapAction,
      },
      body: envelope,
    });
    
    // Parse response
    const parsed = config.parseResult(response, 'getAvailableProperties') as IDataObject;
    
    // Debug: Check what we got
    if (parsed.statusCode && parsed.statusCode !== 0) {
      return [
        {
          name: `API Error: ${parsed.statusMessage || 'Unknown error'} (Code: ${parsed.statusCode})`,
          value: '',
          disabled: true
        }
      ];
    }
    
    if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
      const propertyNames = parsed.data as string[];
      // Return only the actual property names without placeholder
      return propertyNames.map((name: string) => ({
        name: name,
        value: name
      }));
    }
    
    // If no properties found, show helpful message
    return [
      {
        name: 'No properties found for this Usage Area and Main ID combination',
        value: '',
        disabled: true
      }
    ];
  } catch (error) {
    // Return helpful message on error with more details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return [
      {
        name: `Error loading properties: ${errorMessage}`,
        value: '',
        disabled: true
      }
    ];
  }
}

function createAdminExecuteConfig(creds: Creds, url: string, baseUrl: string, timeoutMs: number): ExecuteConfig {
  return {
    url,
    soapActionFor: (op: string) => `http://API.Integration/${op}`,
    paramOrder: { 
      getAvailableProperties: ['PropertyUsageArea', 'MainID'],
      getAvailableTextModules: ['textModuleUsageArea', 'MainID', 'languageCode']
    },
    numericBooleans: NUMERIC_BOOLEAN_PARAMS,
    getSessionId: async (ctx: any) => {
      const { ensureSession } = await import('../core/session');
      return ensureSession(ctx, creds, `${baseUrl}/PlunetAPI`, timeoutMs, 0);
    },
    parseResult: (xml: string, op: string) => {
      if (op === 'getAvailableProperties') {
        // Parse PropertyListResult for getAvailableProperties
        const base = extractResultBase(xml);
        
        // Look for PropertyListResult scope
        const propertyListResultScope = findFirstTagBlock(xml, 'PropertyListResult');
        if (!propertyListResultScope) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        // Extract all m_Data blocks
        const mDataMatches = propertyListResultScope.match(/<m_Data>[\s\S]*?<\/m_Data>/g);
        if (!mDataMatches) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        const propertyNames: string[] = [];
        
        mDataMatches.forEach((mDataBlock: string) => {
          const propertyNameMatch = mDataBlock.match(/<propertyNameEnglish>(.*?)<\/propertyNameEnglish>/);
          if (propertyNameMatch && propertyNameMatch[1]) {
            propertyNames.push(propertyNameMatch[1]);
          }
        });
        
        // Return as StringArray format (same as parseStringArrayResult)
        return {
          data: propertyNames,
          statusMessage: base.statusMessage,
          statusCode: base.statusCode
        };
      } else if (op === 'getAvailableTextModules') {
        // Parse TextmoduleListResult for getAvailableTextModules
        const base = extractResultBase(xml);
        
        // Look for TextmoduleListResult scope
        const textmoduleListResultScope = findFirstTagBlock(xml, 'TextmoduleListResult');
        if (!textmoduleListResultScope) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        // Extract all data blocks
        const dataMatches = textmoduleListResultScope.match(/<data>[\s\S]*?<\/data>/g);
        if (!dataMatches) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        const textModuleOptions: Array<{name: string, value: string}> = [];
        
        dataMatches.forEach((dataBlock: string) => {
          const flagMatch = dataBlock.match(/<flag>(.*?)<\/flag>/);
          const labelMatch = dataBlock.match(/<textModuleLabel>(.*?)<\/textModuleLabel>/);
          
          if (flagMatch && flagMatch[1] && labelMatch && labelMatch[1]) {
            const flag = flagMatch[1];
            const label = labelMatch[1];
            // Store flag as value, display text as name, and include label in description
            textModuleOptions.push({
              name: `${flag} - ${label}`,
              value: `${flag}|${label}` // Store both flag and label in value
            });
          }
        });
        
        // Return as StringArray format
        return {
          data: textModuleOptions,
          statusMessage: base.statusMessage,
          statusCode: base.statusCode
        };
      }
      
      return { statusMessage: 'Unknown operation', statusCode: -1 };
    },
  };
}

/**
 * Load options for DataCustomFields30 Text Module Flag field
 */
export async function getAvailableWorkflows(this: ILoadOptionsFunctions) {
  try {
    // Get credentials
    const creds = await this.getCredentials('plunetApi') as Creds;
    const scheme = creds.useHttps ? 'https' : 'http';
    const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
    const url = `${baseUrl}/DataAdmin30`;
    const timeoutMs = creds.timeout ?? 30000;
    
    // Create execute config for DataAdmin30
    const config = createAdminExecuteConfig(creds, url, baseUrl, timeoutMs);
    
    // Call getAvailableWorkflows
    const sessionId = await config.getSessionId(this as any, 0);
    const soapAction = config.soapActionFor('getAvailableWorkflows');
    
    // Build SOAP envelope
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:getAvailableWorkflows>
         <UUID>${sessionId}</UUID>
      </api:getAvailableWorkflows>
   </soap:Body>
</soap:Envelope>`;
    
    // Make SOAP request
    const response = await this.helpers.request({
      method: 'POST',
      url: config.url,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': soapAction,
      },
      body: envelope,
    });
    
    // Parse response
    const parsed = config.parseResult(response, 'getAvailableWorkflows') as IDataObject;
    
    // Check for errors
    if (parsed.statusCode && parsed.statusCode !== 0) {
      return [
        {
          name: `API Error: ${parsed.statusMessage || 'Unknown error'} (Code: ${parsed.statusCode})`,
          value: '',
          disabled: true
        }
      ];
    }
    
    // Extract workflows from response
    if (parsed.workflows && Array.isArray(parsed.workflows)) {
      return parsed.workflows.map((workflow: any) => ({
        name: `${workflow.name} (ID: ${workflow.workflowId}) - ${workflow.description || 'No description'}`,
        value: workflow.workflowId
      }));
    }
    
    return [
      {
        name: 'No workflows available',
        value: '',
        disabled: true
      }
    ];
    
  } catch (error) {
    return [
      {
        name: `Error loading workflows: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value: '',
        disabled: true
      }
    ];
  }
}

export async function getAvailableTextModuleFlags(this: ILoadOptionsFunctions) {
  const textModuleUsageArea = this.getCurrentNodeParameter('TextModuleUsageArea') as number;
  const id = this.getCurrentNodeParameter('ID') as number;
  const languageCode = this.getCurrentNodeParameter('languageCode') as string || 'EN';
      
  if (!textModuleUsageArea || !id) {
    return [
      {
        name: 'Please set Text Module Usage Area and ID first',
        value: '',
        disabled: true
      }
    ];
  }
  
  try {
    // Get credentials
    const creds = await this.getCredentials('plunetApi') as Creds;
    const scheme = creds.useHttps ? 'https' : 'http';
    const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
    const url = `${baseUrl}/DataAdmin30`;
    const timeoutMs = creds.timeout ?? 30000;
    
    // Create execute config for DataAdmin30
    const config = createAdminExecuteConfig(creds, url, baseUrl, timeoutMs);
    
    // Call getAvailableTextModules using a different approach
    // We need to make a direct SOAP call since executeOperation expects IExecuteFunctions
    const sessionId = await config.getSessionId(this as any, 0);
    const soapAction = config.soapActionFor('getAvailableTextModules');
    
    // Build SOAP envelope
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:getAvailableTextModules>
         <UUID>${sessionId}</UUID>
         <languageCode>${languageCode}</languageCode>
         <textModuleUsageArea>${textModuleUsageArea}</textModuleUsageArea>
         <MainID>${id}</MainID>
      </api:getAvailableTextModules>
   </soap:Body>
</soap:Envelope>`;
    
    // Make SOAP request
    const response = await this.helpers.request({
      method: 'POST',
      url: config.url,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': soapAction,
      },
      body: envelope,
    });
    
    // Parse response
    const parsed = config.parseResult(response, 'getAvailableTextModules') as IDataObject;
    
    // Debug: Check what we got
    if (parsed.statusCode && parsed.statusCode !== 0) {
      return [
        {
          name: `API Error: ${parsed.statusMessage || 'Unknown error'} (Code: ${parsed.statusCode})`,
          value: '',
          disabled: true
        }
      ];
    }
    
    if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
      const textModuleOptions = parsed.data as Array<{name: string, value: string}>;
      // Return the options with flag as value and display text as name
      return textModuleOptions;
    }
    
    // If no text modules found, show helpful message
    return [
      {
        name: 'No text modules found for this Usage Area and Main ID combination',
        value: '',
        disabled: true
      }
    ];
  } catch (error) {
    // Return helpful message on error with more details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return [
      {
        name: `Error loading text modules: ${errorMessage}`,
        value: '',
        disabled: true
      }
    ];
  }
}