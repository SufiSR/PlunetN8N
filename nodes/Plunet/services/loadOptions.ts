import { ILoadOptionsFunctions, IDataObject } from 'n8n-workflow';
import { Creds } from '../core/types';
import { ExecuteConfig } from '../core/executor';
import { extractResultBase } from '../core/xml';
import { findFirstTagBlock } from '../core/parsers/common';
import { NUMERIC_BOOLEAN_PARAMS } from '../core/constants';
import { getWorkflowStatusName } from '../enums/workflow-status';
import { getWorkflowTypeName } from '../enums/workflow-type';

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
      } else if (op === 'getAvailableWorkflows') {
        // Parse WorkflowListResult for getAvailableWorkflows
        const base = extractResultBase(xml);
        
        // Look for WorkflowListResult scope
        const workflowListResultScope = findFirstTagBlock(xml, 'WorkflowListResult');
        if (!workflowListResultScope) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        // Extract all data blocks
        const dataMatches = workflowListResultScope.match(/<data>[\s\S]*?<\/data>/g);
        if (!dataMatches) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        const workflows: Array<{
          description: string,
          name: string,
          status: number,
          statusLabel: string,
          type: number,
          typeLabel: string,
          workflowId: number
        }> = [];
        
        dataMatches.forEach(dataBlock => {
          const descriptionMatch = dataBlock.match(/<description>(.*?)<\/description>/);
          const nameMatch = dataBlock.match(/<name>(.*?)<\/name>/);
          const statusMatch = dataBlock.match(/<status>(.*?)<\/status>/);
          const typeMatch = dataBlock.match(/<type>(.*?)<\/type>/);
          const workflowIdMatch = dataBlock.match(/<workflowId>(.*?)<\/workflowId>/);
          
          if (nameMatch && nameMatch[1] && workflowIdMatch && workflowIdMatch[1]) {
            const status = statusMatch && statusMatch[1] ? parseInt(statusMatch[1], 10) : 0;
            const type = typeMatch && typeMatch[1] ? parseInt(typeMatch[1], 10) : 0;
            
            workflows.push({
              description: descriptionMatch && descriptionMatch[1] ? descriptionMatch[1] : '',
              name: nameMatch[1],
              status: status,
              statusLabel: getWorkflowStatusName(status),
              type: type,
              typeLabel: getWorkflowTypeName(type),
              workflowId: parseInt(workflowIdMatch[1], 10)
            });
          }
        });
        
        return {
          statusMessage: base.statusMessage,
          statusCode: base.statusCode,
          workflows: workflows
        };
      } else if (op === 'getAvailableLanguages') {
        // Parse LanguageListResult for getAvailableLanguages
        const base = extractResultBase(xml);
        
        // Look for LanguageListResult scope
        const languageListResultScope = findFirstTagBlock(xml, 'LanguageListResult');
        if (!languageListResultScope) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        // Extract all data blocks
        const dataMatches = languageListResultScope.match(/<data>[\s\S]*?<\/data>/g);
        if (!dataMatches) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        const languages: Array<{
          active: boolean,
          favorite: boolean,
          folderName: string,
          id: number,
          isoCode: string,
          name: string
        }> = [];
        
        dataMatches.forEach(dataBlock => {
          const activeMatch = dataBlock.match(/<active>(.*?)<\/active>/);
          const favoriteMatch = dataBlock.match(/<favorite>(.*?)<\/favorite>/);
          const folderNameMatch = dataBlock.match(/<folderName>(.*?)<\/folderName>/);
          const idMatch = dataBlock.match(/<id>(.*?)<\/id>/);
          const isoCodeMatch = dataBlock.match(/<isoCode>(.*?)<\/isoCode>/);
          const nameMatch = dataBlock.match(/<name>(.*?)<\/name>/);
          
          if (nameMatch && nameMatch[1] && idMatch && idMatch[1]) {
            languages.push({
              active: activeMatch && activeMatch[1] === 'true' || false,
              favorite: favoriteMatch && favoriteMatch[1] === 'true' || false,
              folderName: folderNameMatch && folderNameMatch[1] ? folderNameMatch[1] : '',
              id: parseInt(idMatch[1], 10),
              isoCode: isoCodeMatch && isoCodeMatch[1] ? isoCodeMatch[1] : '',
              name: nameMatch[1]
            });
          }
        });
        
        return {
          statusMessage: base.statusMessage,
          statusCode: base.statusCode,
          languages: languages
        };
      } else if (op === 'getAvailableCountries') {
        // Parse CountryListResult for getAvailableCountries
        const base = extractResultBase(xml);
        
        // Look for CountryListResult scope
        const countryListResultScope = findFirstTagBlock(xml, 'CountryListResult');
        if (!countryListResultScope) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        // Extract all data blocks
        const dataMatches = countryListResultScope.match(/<data>[\s\S]*?<\/data>/g);
        if (!dataMatches) {
          return { statusMessage: base.statusMessage, statusCode: base.statusCode };
        }
        
        const countries: Array<{
          ID: number,
          isoCode: string,
          name: string
        }> = [];
        
        dataMatches.forEach(dataBlock => {
          const idMatch = dataBlock.match(/<ID>(.*?)<\/ID>/);
          const isoCodeMatch = dataBlock.match(/<isoCode>(.*?)<\/isoCode>/);
          const nameMatch = dataBlock.match(/<name>(.*?)<\/name>/);
          
          if (nameMatch && nameMatch[1] && idMatch && idMatch[1]) {
            countries.push({
              ID: parseInt(idMatch[1], 10),
              isoCode: isoCodeMatch && isoCodeMatch[1] ? isoCodeMatch[1] : '',
              name: nameMatch[1]
            });
          }
        });
        
        return {
          statusMessage: base.statusMessage,
          statusCode: base.statusCode,
          countries: countries
        };
      }
      
      return { statusMessage: 'Unknown operation', statusCode: -1 };
    },
  };
}

/**
 * Load options for DataCustomFields30 Text Module Flag field
 */
export async function getAvailableLanguages(this: ILoadOptionsFunctions) {
  try {
    // Get credentials
    const creds = await this.getCredentials('plunetApi') as Creds;
    const scheme = creds.useHttps ? 'https' : 'http';
    const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
    const url = `${baseUrl}/DataAdmin30`;
    const timeoutMs = creds.timeout ?? 30000;
    
    // Create execute config for DataAdmin30
    const config = createAdminExecuteConfig(creds, url, baseUrl, timeoutMs);
    
    // Call getAvailableLanguages
    const sessionId = await config.getSessionId(this as any, 0);
    const soapAction = config.soapActionFor('getAvailableLanguages');
    
    // Build SOAP envelope
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:getAvailableLanguages>
         <UUID>${sessionId}</UUID>
         <languageCode>EN</languageCode>
      </api:getAvailableLanguages>
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
    const parsed = config.parseResult(response, 'getAvailableLanguages') as IDataObject;
    
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
    
    // Extract languages from response
    if (parsed.languages && Array.isArray(parsed.languages)) {
      return parsed.languages.map((language: any) => ({
        name: language.name,
        value: language.name
      }));
    }
    
    return [
      {
        name: 'No languages available',
        value: '',
        disabled: true
      }
    ];
    
  } catch (error) {
    return [
      {
        name: `Error loading languages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value: '',
        disabled: true
      }
    ];
  }
}

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
        name: workflow.name,
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

export async function getAvailableCountries(this: ILoadOptionsFunctions) {
  try {
    // Get credentials
    const creds = await this.getCredentials('plunetApi') as Creds;
    const scheme = creds.useHttps ? 'https' : 'http';
    const baseUrl = `${scheme}://${creds.baseHost.replace(/\/$/, '')}`;
    const url = `${baseUrl}/DataAdmin30`;
    const timeoutMs = creds.timeout ?? 30000;
    
    // Create execute config for DataAdmin30
    const config = createAdminExecuteConfig(creds, url, baseUrl, timeoutMs);
    
    // Call getAvailableCountries
    const sessionId = await config.getSessionId(this as any, 0);
    const soapAction = config.soapActionFor('getAvailableCountries');
    
    // Build SOAP envelope
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:api="http://API.Integration/">
   <soap:Header/>
   <soap:Body>
      <api:getAvailableCountries>
         <UUID>${sessionId}</UUID>
      </api:getAvailableCountries>
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
    const parsed = config.parseResult(response, 'getAvailableCountries') as IDataObject;
    
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
    
    // Extract countries from response
    if (parsed.countries && Array.isArray(parsed.countries)) {
      return parsed.countries.map((country: any) => ({
        name: country.name,
        value: country.name
      }));
    }
    
    return [
      {
        name: 'No countries available',
        value: '',
        disabled: true
      }
    ];
    
  } catch (error) {
    return [
      {
        name: `Error loading countries: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value: '',
        disabled: true
      }
    ];
  }
}