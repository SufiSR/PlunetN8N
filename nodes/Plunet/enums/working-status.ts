// nodes/Plunet/enums/working-status.ts
import type { INodePropertyOptions } from 'n8n-workflow';

export type WorkingStatusName = 'INTERNAL' | 'EXTERNAL';

export const WorkingStatusIdByName: Record<WorkingStatusName, number> = {
    INTERNAL: 1,
    EXTERNAL: 2,
};

const WorkingStatusNameById: Record<number, WorkingStatusName> = {
    1: 'INTERNAL',
    2: 'EXTERNAL',
};

export function idToWorkingStatusName(id?: number | null): WorkingStatusName | undefined {
    if (id == null) return undefined;
    return WorkingStatusNameById[id];
}

export const WorkingStatusOptions: INodePropertyOptions[] = [
    { name: 'Internal (1)', value: 1, description: 'INTERNAL' },
    { name: 'External (2)', value: 2, description: 'EXTERNAL' },
];
