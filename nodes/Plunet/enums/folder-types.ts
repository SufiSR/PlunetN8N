import { INodePropertyOptions } from 'n8n-workflow';

export const FolderTypeOptions: INodePropertyOptions[] = [
  { name: 'Request Source (MainID = Request ID)', value: 2 },
  { name: 'Request Reference (MainID = Request ID)', value: 1 },
  { name: 'Quote Source (MainID = Quote ID)', value: 4 },
  { name: 'Quote Reference (MainID = Quote ID)', value: 3 },
  { name: 'Quote PRM (MainID = Quote ID)', value: 24 },
  { name: 'Quote Out (MainID = Quote ID)', value: 9 },
  { name: 'Quote Item CAT (MainID = Item ID)', value: 7 },
  { name: 'Quote Final (MainID = Quote ID)', value: 11 },
  { name: 'Quote Job In (MainID = Job ID)', value: 20 },
  { name: 'Quote Job Out (MainID = Job ID)', value: 21 },
  { name: 'Quote Item Source (MainID = Item ID)', value: 14 },
  { name: 'Quote Item Reference (MainID = Item ID)', value: 15 },
  { name: 'Order Source (MainID = Order ID)', value: 6 },
  { name: 'Order Reference (MainID = Order ID)', value: 5 },
  { name: 'Order PRM (MainID = Order ID)', value: 25 },
  { name: 'Order Out (MainID = Order ID)', value: 10 },
  { name: 'Order Final (MainID = Order ID)', value: 12 },
  { name: 'Order Item CAT (MainID = Item ID)', value: 8 },  
  { name: 'Order Item Source (MainID = Item ID)', value: 16 },
  { name: 'Order Item Reference (MainID = Item ID)', value: 17 },  
  { name: 'Order Job In (MainID = Job ID)', value: 22 },
  { name: 'Order Job Out (MainID = Job ID)', value: 23 },   
  { name: 'Resource (MainID = Resource ID)', value: 18 },
  { name: 'Customer (MainID = Customer ID)', value: 19 },
  { name: 'Receivable (MainID = Invoice ID)', value: 13 },  
  { name: 'Payable (MainID = Invoice ID)', value: 26 },
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

