import { INodePropertyOptions } from 'n8n-workflow';

export const WorkflowStatusOptions: INodePropertyOptions[] = [
  { name: 'In Preparation', value: 0 },
  { name: 'Released', value: 1 },
  { name: 'Canceled', value: 2 },
  { name: 'Released for Selection', value: 3 },
];

export function getWorkflowStatusName(value: number): string {
  const status = WorkflowStatusOptions.find(option => option.value === value);
  return status ? status.name : 'Unknown';
}
