import type { EnumDef } from './types';

function labelize(raw: string): string {
    switch (raw) {
        case 'NOT_ACTIVE': return 'Not active';
        case 'AQUISITION_ADDRESS': return 'Acquisition address';
        case 'NEW_AUTO': return 'New (auto)';
        case 'DELETION_REQUESTED': return 'Deletion requested';
        default: return raw.charAt(0) + raw.slice(1).toLowerCase(); // Active, Contacted, New, Blocked
    }
}

/** https://apidoc.plunet.com/latest/BM/API/SOAP/Enum/CustomerStatus.html */
export const CustomerStatus: EnumDef = [
    { name: 'ACTIVE', id: 1, label: labelize('ACTIVE') },
    { name: 'NOT_ACTIVE', id: 2, label: labelize('NOT_ACTIVE') },
    { name: 'CONTACTED', id: 3, label: labelize('CONTACTED') },
    { name: 'NEW', id: 4, label: labelize('NEW') },
    { name: 'BLOCKED', id: 5, label: labelize('BLOCKED') },
    { name: 'AQUISITION_ADDRESS', id: 6, label: labelize('AQUISITION_ADDRESS') },
    { name: 'NEW_AUTO', id: 7, label: labelize('NEW_AUTO') },
    { name: 'DELETION_REQUESTED', id: 8, label: labelize('DELETION_REQUESTED') },
] as const;
