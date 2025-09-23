import type { INodePropertyOptions } from 'n8n-workflow';

export type JobStatusName =
    | 'IN_PREPERATION'
    | 'IN_PROGRESS'
    | 'DELIVERED'
    | 'APPROVED'
    | 'CANCELED'
    | 'INVOICE_ACCEPTED'
    | 'PAYED'
    | 'ASSIGNED_WAITING'
    | 'REQUESTED'
    | 'INVOICE_CHECKED'
    | 'INVOICE_CREATED'
    | 'WITHOUT_INVOICE'
    | 'TRANSFERRED_TO_ORDER'
    | 'OVERDUE';

export const JobStatusIdByName: Record<JobStatusName, number> = {
    IN_PREPERATION: 0, // Plunet spelling
    IN_PROGRESS: 1,
    DELIVERED: 2,
    APPROVED: 3,
    CANCELED: 4,
    INVOICE_ACCEPTED: 5,
    PAYED: 6,
    ASSIGNED_WAITING: 7,
    REQUESTED: 8,
    INVOICE_CHECKED: 9,
    INVOICE_CREATED: 10,
    WITHOUT_INVOICE: 11,
    TRANSFERRED_TO_ORDER: 12,
    OVERDUE: 13,
};

const JobStatusNameById: Record<number, JobStatusName> = Object.fromEntries(
    Object.entries(JobStatusIdByName).map(([k, v]) => [v, k as JobStatusName]),
) as Record<number, JobStatusName>;

export function idToJobStatusName(id?: number | null): JobStatusName | undefined {
    if (id == null) return undefined;
    return JobStatusNameById[id];
}

function pretty(name: JobStatusName): string {
    switch (name) {
        case 'IN_PREPERATION': return 'In preparation'; // matches Plunet
        case 'IN_PROGRESS': return 'In progress';
        case 'DELIVERED': return 'Delivered';
        case 'APPROVED': return 'Approved';
        case 'CANCELED': return 'Canceled';
        case 'INVOICE_ACCEPTED': return 'Invoice accepted';
        case 'PAYED': return 'Paid';
        case 'ASSIGNED_WAITING': return 'Assigned (waiting)';
        case 'REQUESTED': return 'Requested';
        case 'INVOICE_CHECKED': return 'Invoice checked';
        case 'INVOICE_CREATED': return 'Invoice created';
        case 'WITHOUT_INVOICE': return 'Without invoice';
        case 'TRANSFERRED_TO_ORDER': return 'Transferred to order';
        case 'OVERDUE': return 'Overdue';
        default: {
            const s = String(name);
            return s.charAt(0) + s.slice(1).toLowerCase();
        }
    }
}

export const JobStatusOptions: INodePropertyOptions[] =
    (Object.keys(JobStatusIdByName) as JobStatusName[])
        .sort((a, b) => JobStatusIdByName[a] - JobStatusIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${JobStatusIdByName[name]})`,
            value: JobStatusIdByName[name],
            description: name,
        }));
