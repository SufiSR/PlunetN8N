import { INodePropertyOptions } from 'n8n-workflow';

export const PropertyUsageAreaOptions: INodePropertyOptions[] = [
  { name: 'Customer (uses Customer ID)', value: 1 },
  { name: 'Resource (uses Resource ID)', value: 2 },
  { name: 'Request (uses Request ID)', value: 4 },
  { name: 'Quote (uses Quote ID)', value: 5 },
  { name: 'Order (uses Order ID)', value: 6 },
  { name: 'Quote Item (uses Item ID)', value: 9 },
  { name: 'Order Item (uses Item ID)', value: 10 },
  { name: 'Quote Job (uses Job ID)', value: 11 },
  { name: 'Order Job (uses Job ID)', value: 12 },
];

// Helper function to get the display name for a property usage area
export function getPropertyUsageAreaName(value: number): string {
  const area = PropertyUsageAreaOptions.find(option => option.value === value);
  return area ? area.name : 'Unknown';
}

// Helper function to check if a usage area is job-related
export function isJobUsageArea(value: number): boolean {
  return value === 11 || value === 12; // Quote Job or Order Job
}
