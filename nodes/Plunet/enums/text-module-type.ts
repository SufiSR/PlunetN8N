import { INodePropertyOptions } from 'n8n-workflow';

export const TextModuleTypeOptions: INodePropertyOptions[] = [
  { name: 'Text Field', value: 1 },
  { name: 'List Box', value: 2 },
  { name: 'Date Field', value: 3 },
  { name: 'Memo Field', value: 4 },
  { name: 'Memo History Field', value: 5 },
  { name: 'Number Field', value: 6 },
  { name: 'Hyper Link', value: 7 },
];

// Helper function to get the display name for a text module type
export function getTextModuleTypeName(value: number): string {
  const type = TextModuleTypeOptions.find(option => option.value === value);
  return type ? type.name : 'Unknown';
}
