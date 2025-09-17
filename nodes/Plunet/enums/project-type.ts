import type { INodePropertyOptions } from 'n8n-workflow';

export type ProjectTypeName =
    | 'QUOTE'
    | 'ORDER';

export const ProjectTypeIdByName: Record<ProjectTypeName, number> = {
    QUOTE: 1,
    ORDER: 3,
};

const ProjectTypeNameById: Record<number, ProjectTypeName> = Object.fromEntries(
    Object.entries(ProjectTypeIdByName).map(([k, v]) => [v, k as ProjectTypeName]),
) as Record<number, ProjectTypeName>;

export function idToProjectTypeName(id?: number | null): ProjectTypeName | undefined {
    if (id == null) return undefined;
    return ProjectTypeNameById[id];
}

function pretty(name: ProjectTypeName): string {
    switch (name) {
        case 'QUOTE': return 'Quote';
        case 'ORDER': return 'Order';
        default: { const s = String(name); return s.charAt(0) + s.slice(1).toLowerCase(); }
    }
}

export const ProjectTypeOptions: INodePropertyOptions[] =
    (Object.keys(ProjectTypeIdByName) as ProjectTypeName[])
        .sort((a, b) => ProjectTypeIdByName[a] - ProjectTypeIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${ProjectTypeIdByName[name]})`,
            value: ProjectTypeIdByName[name],
            description: name,
        }));
