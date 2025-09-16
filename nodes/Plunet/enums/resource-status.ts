// nodes/Plunet/enums/resource-status.ts
import type { INodePropertyOptions } from 'n8n-workflow';

export type ResourceStatusName =
    | 'ACTIVE'
    | 'NOT_ACTIVE_OR_OLD'
    | 'BLOCKED'
    | 'NEW'
    | 'PREMIUM'
    | 'NEW_AUTO'
    | 'PROBATION'
    | 'QUALIFIED'
    | 'DISQUALIFIED'
    | 'DELETION_REQUESTED';

export const ResourceStatusIdByName: Record<ResourceStatusName, number> = {
    ACTIVE: 1,
    NOT_ACTIVE_OR_OLD: 2,
    BLOCKED: 3,
    NEW: 4,
    PREMIUM: 5,
    NEW_AUTO: 6,
    PROBATION: 7,
    QUALIFIED: 8,
    DISQUALIFIED: 9,
    DELETION_REQUESTED: 10,
};

const ResourceStatusNameById: Record<number, ResourceStatusName> = Object.fromEntries(
    Object.entries(ResourceStatusIdByName).map(([k, v]) => [v, k as ResourceStatusName]),
) as Record<number, ResourceStatusName>;

export function idToResourceStatusName(id?: number | null): ResourceStatusName | undefined {
    if (id == null) return undefined;
    return ResourceStatusNameById[id];
}

function pretty(name: ResourceStatusName): string {
    switch (name) {
        case 'NOT_ACTIVE_OR_OLD': return 'Not active or old';
        case 'NEW_AUTO': return 'New (auto)';
        default: return name.charAt(0) + name.slice(1).toLowerCase();
    }
}

export const ResourceStatusOptions: INodePropertyOptions[] =
    (Object.keys(ResourceStatusIdByName) as ResourceStatusName[])
        .sort((a, b) => ResourceStatusIdByName[a] - ResourceStatusIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${ResourceStatusIdByName[name]})`,
            value: ResourceStatusIdByName[name],
            description: name,
        }));
