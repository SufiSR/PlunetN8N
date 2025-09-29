import type { INodePropertyOptions } from 'n8n-workflow';

export type ArchivStatusName =
    | 'ACTIVE'
    | 'COMPLETED_ARCHIVABLE'
    | 'ARCHIVED'
    | 'QUOTE_MOVED_TO_ORDER'
    | 'IN_PREPARATION'
    | 'COMPLETED';

export const ArchivStatusIdByName: Record<ArchivStatusName, number> = {
    ACTIVE: 1,
    COMPLETED_ARCHIVABLE: 2,
    ARCHIVED: 3,
    QUOTE_MOVED_TO_ORDER: 4,
    IN_PREPARATION: 5,
    COMPLETED: 6,
};

const ArchivStatusNameById: Record<number, ArchivStatusName> = Object.fromEntries(
    Object.entries(ArchivStatusIdByName).map(([k, v]) => [v, k as ArchivStatusName]),
) as Record<number, ArchivStatusName>;

export function idToArchivStatusName(id?: number | null): ArchivStatusName | undefined {
    if (id == null) return undefined;
    return ArchivStatusNameById[id];
}

function pretty(name: ArchivStatusName): string {
    switch (name) {
        case 'ACTIVE': return 'Active';
        case 'COMPLETED_ARCHIVABLE': return 'Completed (Archivable)';
        case 'ARCHIVED': return 'Archived';
        case 'QUOTE_MOVED_TO_ORDER': return 'Quote Moved to Order';
        case 'IN_PREPARATION': return 'In Preparation';
        case 'COMPLETED': return 'Completed';
        default: { const s = String(name); return s.charAt(0) + s.slice(1).toLowerCase(); }
    }
}

export const ArchivStatusOptions: INodePropertyOptions[] =
    (Object.keys(ArchivStatusIdByName) as ArchivStatusName[])
        .sort((a, b) => ArchivStatusIdByName[a] - ArchivStatusIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${ArchivStatusIdByName[name]})`,
            value: ArchivStatusIdByName[name],
            description: name,
        }));
