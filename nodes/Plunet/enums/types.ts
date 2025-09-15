import type { INodePropertyOptions } from 'n8n-workflow';

export type EnumItem = Readonly<{
    /** Canonical enum name as used by the API docs, e.g. "ACTIVE" */
    name: string;
    /** Numeric ID Plunet expects/returns, e.g. 1 */
    id: number;
    /** Human-friendly label in the UI, e.g. "Active" */
    label?: string;
    /** Optional short description for tooltips */
    description?: string;
}>;

export type EnumDef = ReadonlyArray<EnumItem>;
export type EnumName = string;
export type EnumRegistry = Record<EnumName, EnumDef>;

/** Convert a definition to n8n dropdown options (values are numeric IDs) */
export function toOptions(def: EnumDef): INodePropertyOptions[] {
    return [...def]
        .sort((a, b) => a.id - b.id)
        .map((e) => ({
            name: e.label ? `${e.label} (${e.id})` : `${e.name} (${e.id})`,
            value: e.id,
            description: e.description ?? e.name,
        }));
}

export function idToName(def: EnumDef, id?: number | null): string | undefined {
    if (id == null) return undefined;
    const hit = def.find((e) => e.id === id);
    return hit?.name;
}

export function nameToId(def: EnumDef, name?: string | null): number | undefined {
    if (!name) return undefined;
    const hit = def.find((e) => e.name === name);
    return hit?.id;
}
