// nodes/Plunet/enums/resource-type.ts
import type { INodePropertyOptions } from 'n8n-workflow';

export type ResourceTypeName = 'RESOURCES' | 'TEAM_MEMBER' | 'PROJECT_MANAGER' | 'SUPERVISOR';

export const ResourceTypeIdByName: Record<ResourceTypeName, number> = {
    RESOURCES: 0,
    TEAM_MEMBER: 1,
    PROJECT_MANAGER: 2,
    SUPERVISOR: 3,
};

const ResourceTypeNameById: Record<number, ResourceTypeName> = {
    0: 'RESOURCES',
    1: 'TEAM_MEMBER',
    2: 'PROJECT_MANAGER',
    3: 'SUPERVISOR',
};

export function idToResourceTypeName(id?: number | null): ResourceTypeName | undefined {
    if (id == null) return undefined;
    return ResourceTypeNameById[id];
}

function pretty(name: ResourceTypeName): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export const ResourceTypeOptions: INodePropertyOptions[] =
    (Object.keys(ResourceTypeIdByName) as ResourceTypeName[])
        .sort((a, b) => ResourceTypeIdByName[a] - ResourceTypeIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${ResourceTypeIdByName[name]})`,
            value: ResourceTypeIdByName[name],
            description: name,
        }));
