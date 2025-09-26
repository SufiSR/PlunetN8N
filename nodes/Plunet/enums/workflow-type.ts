import { INodePropertyOptions } from 'n8n-workflow';

export const WorkflowTypeOptions: INodePropertyOptions[] = [
  { name: 'Standard', value: 0 },
  { name: 'Order', value: 1 },
  { name: 'Quote Order', value: 2 },
];

export function getWorkflowTypeName(value: number): string {
  const type = WorkflowTypeOptions.find(option => option.value === value);
  return type ? type.name : 'Unknown';
}
