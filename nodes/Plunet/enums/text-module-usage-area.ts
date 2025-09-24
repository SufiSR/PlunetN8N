import { INodePropertyOptions } from 'n8n-workflow';

export const TextModuleUsageAreaOptions: INodePropertyOptions[] = [
  { name: 'Customer', value: 1 },
  { name: 'Resource', value: 2 },
  { name: 'Vendor', value: 3 },
  { name: 'Request', value: 4 },
  { name: 'Quote', value: 5 },
  { name: 'Order', value: 6 },
  { name: 'Receivables', value: 7 },
  { name: 'Payable', value: 8 },
  { name: 'Receivables Credit Note', value: 9 },
  { name: 'Quote Job', value: 10 },
  { name: 'Order Job', value: 11 },
  { name: 'Request Customer Login', value: 17 },
  { name: 'Quote Customer Login', value: 18 },
  { name: 'Order Customer Login', value: 19 },
];

// Helper function to get the display name for a text module usage area
export function getTextModuleUsageAreaName(value: number): string {
  const area = TextModuleUsageAreaOptions.find(option => option.value === value);
  return area ? area.name : 'Unknown';
}

// Helper function to check if a usage area is customer login related
export function isCustomerLoginUsageArea(value: number): boolean {
  return value === 17 || value === 18 || value === 19; // Request/Quote/Order Customer Login
}
