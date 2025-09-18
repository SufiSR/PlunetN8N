import type { INodePropertyOptions } from 'n8n-workflow';

export type WorkingStatusName = 'INTERNAL' | 'EXTERNAL';

export const WorkingStatusIdByName: Record<WorkingStatusName, number> = {
    INTERNAL: 1,
    EXTERNAL: 2,
};

export const WorkingStatusOptions: INodePropertyOptions[] = [
    { name: 'Internal (1)', value: 1, description: 'INTERNAL' },
    { name: 'External (2)', value: 2, description: 'EXTERNAL' },
];