import { INodePropertyOptions } from 'n8n-workflow';

export const FolderTypeOptions: INodePropertyOptions[] = [
  { name: 'Request Source', value: 2 },
  { name: 'Request Reference', value: 1 },
  { name: 'Quote Source', value: 4 },
  { name: 'Quote Reference', value: 3 },
  { name: 'Quote PRM', value: 24 },
  { name: 'Quote Out', value: 9 },
  { name: 'Quote Item CAT', value: 7 },
  { name: 'Quote Final', value: 11 },
  { name: 'Quote Job In', value: 20 },
  { name: 'Quote Job Out', value: 21 },
  { name: 'Quote Item Source', value: 14 },
  { name: 'Quote Item Reference', value: 15 },
  { name: 'Order Source', value: 6 },
  { name: 'Order Reference', value: 5 },
  { name: 'Order PRM', value: 25 },
  { name: 'Order Out', value: 10 },
  { name: 'Order Final', value: 12 },
  { name: 'Order Item CAT', value: 8 },  
  { name: 'Order Item Source', value: 16 },
  { name: 'Order Item Reference', value: 17 },  
  { name: 'Order Job In', value: 22 },
  { name: 'Order Job Out', value: 23 },   
  { name: 'Resource', value: 18 },
  { name: 'Customer', value: 19 },
  { name: 'Receivable', value: 13 },  
  { name: 'Payable', value: 26 },
];

// Helper function to determine the main ID field name based on folder type
export function getMainIdFieldName(folderType: number): string {
  const folderTypeMap: Record<number, string> = {
    1: 'Request ID',    // REQUEST_REFERENCE
    2: 'Request ID',    // REQUEST_SOURCE
    3: 'Quote ID',      // QUOTE_REFERENCE
    4: 'Quote ID',      // QUOTE_SOURCE
    5: 'Order ID',      // ORDER_REFERENCE
    6: 'Order ID',      // ORDER_SOURCE
    7: 'Item ID',       // QUOTE_ITEM_CAT
    8: 'Item ID',       // ORDER_ITEM_CAT
    9: 'Quote ID',      // QUOTE_OUT
    10: 'Order ID',     // ORDER_OUT
    11: 'Quote ID',     // QUOTE_FINAL
    12: 'Order ID',     // ORDER_FINAL
    13: 'Invoice ID',   // RECEIVABLE
    14: 'Item ID',      // QUOTE_ITEM_SOURCE
    15: 'Item ID',      // QUOTE_ITEM_REFERENCE
    16: 'Item ID',      // ORDER_ITEM_SOURCE
    17: 'Item ID',      // ORDER_ITEM_REFERENCE
    18: 'Resource ID',  // RESOURCE
    19: 'Customer ID',  // CUSTOMER
    20: 'Job ID',       // QUOTE_JOB_IN
    21: 'Job ID',       // QUOTE_JOB_OUT
    22: 'Job ID',       // ORDER_JOB_IN
    23: 'Job ID',       // ORDER_JOB_OUT
    24: 'Quote ID',     // QUOTE_PRM
    25: 'Order ID',     // ORDER_PRM
    26: 'Invoice ID',   // PAYABLE
  };
  
  return folderTypeMap[folderType] || 'Main ID';
}

