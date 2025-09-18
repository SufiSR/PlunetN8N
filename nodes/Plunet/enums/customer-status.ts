import type { INodePropertyOptions } from 'n8n-workflow';
import type { EnumDef } from './types';

export type CustomerStatusName = 'ACTIVE' | 'NOT_ACTIVE' | 'CONTACTED' | 'NEW' | 'BLOCKED'
    | 'AQUISITION_ADDRESS' | 'NEW_AUTO' | 'DELETION_REQUESTED';

export const CustomerStatusIdByName: Record<CustomerStatusName, number> = {
    ACTIVE: 1, NOT_ACTIVE: 2, CONTACTED: 3, NEW: 4, BLOCKED: 5,
    AQUISITION_ADDRESS: 6, NEW_AUTO: 7, DELETION_REQUESTED: 8,
};

export const CustomerStatusDef: EnumDef = [
    { name: 'ACTIVE', id: 1, label: 'Active' },
    { name: 'NOT_ACTIVE', id: 2, label: 'Not Active' },
    { name: 'CONTACTED', id: 3, label: 'Contacted' },
    { name: 'NEW', id: 4, label: 'New' },
    { name: 'BLOCKED', id: 5, label: 'Blocked' },
    { name: 'AQUISITION_ADDRESS', id: 6, label: 'Acquisition Address' },
    { name: 'NEW_AUTO', id: 7, label: 'New Auto' },
    { name: 'DELETION_REQUESTED', id: 8, label: 'Deletion Requested' },
] as const;

export const CustomerStatusOptions: INodePropertyOptions[] =
    (Object.keys(CustomerStatusIdByName) as CustomerStatusName[])
        .sort((a, b) => CustomerStatusIdByName[a] - CustomerStatusIdByName[b])
        .map((name) => ({
            name: `${name.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())} (${CustomerStatusIdByName[name]})`,
            value: CustomerStatusIdByName[name],
            description: name,
        }));