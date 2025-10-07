import type { INodePropertyOptions } from 'n8n-workflow';
import type { EnumDef } from './types';

// https://apidoc.plunet.com/latest/BM/API/SOAP/Enum/ContactPersonStatus.html
// ACTIVE(1), NOT_ACTIVE(2), CONTACTED(3), DELETION_REQUESTED(4)

export type ContactPersonStatusName = 'ACTIVE' | 'NOT_ACTIVE' | 'CONTACTED' | 'DELETION_REQUESTED';

export const ContactPersonStatusIdByName: Record<ContactPersonStatusName, number> = {
    ACTIVE: 1,
    NOT_ACTIVE: 2,
    CONTACTED: 3,
    DELETION_REQUESTED: 4,
};

export const ContactPersonStatusDef: EnumDef = [
    { name: 'ACTIVE', id: 1, label: 'Active' },
    { name: 'NOT_ACTIVE', id: 2, label: 'Not Active' },
    { name: 'CONTACTED', id: 3, label: 'Contacted' },
    { name: 'DELETION_REQUESTED', id: 4, label: 'Deletion Requested' },
] as const;

export const ContactPersonStatusOptions: INodePropertyOptions[] =
    (Object.keys(ContactPersonStatusIdByName) as ContactPersonStatusName[])
        .sort((a, b) => ContactPersonStatusIdByName[a] - ContactPersonStatusIdByName[b])
        .map((name) => ({
            name: `${name.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())} (${ContactPersonStatusIdByName[name]})`,
            value: ContactPersonStatusIdByName[name],
            description: name,
        }));


