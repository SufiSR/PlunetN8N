import { INodePropertyOptions } from 'n8n-workflow';

export enum PropertyType {
  SINGLE_SELECT = 1,
  MULTI_SELECT = 2,
}

export const PropertyTypeOptions: INodePropertyOptions[] = [
  { name: 'Single Select', value: 1 },
  { name: 'Multi Select', value: 2 },
];

export function getPropertyTypeName(value: number): string {
  switch (value) {
    case PropertyType.SINGLE_SELECT:
      return 'Single Select';
    case PropertyType.MULTI_SELECT:
      return 'Multi Select';
    default:
      return `Unknown (${value})`;
  }
}
