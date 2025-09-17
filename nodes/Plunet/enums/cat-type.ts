import type { INodePropertyOptions } from 'n8n-workflow';

export type CatTypeName =
    | 'TRADOS'
    | 'TRANSIT'
    | 'MEMOQ'
    | 'ACROSS'
    | 'PRACTICOUNT'
    | 'PASSOLO'
    | 'LOGOPORT'
    | 'IDIOM'
    | 'XTM'
    | 'FUSION'
    | 'DEJAVU'
    | 'WORDFAST'
    | 'CATALYST'
    | 'HELIUM'
    | 'PHRASE';

export const CatTypeIdByName: Record<CatTypeName, number> = {
    TRADOS: 1,
    TRANSIT: 3,
    MEMOQ: 4,
    ACROSS: 5,
    PRACTICOUNT: 6,
    PASSOLO: 7,
    LOGOPORT: 8,
    IDIOM: 9,
    XTM: 10,
    FUSION: 11,
    DEJAVU: 12,
    WORDFAST: 13,
    CATALYST: 14,
    HELIUM: 15,
    PHRASE: 16,
};

const CatTypeNameById: Record<number, CatTypeName> = Object.fromEntries(
    Object.entries(CatTypeIdByName).map(([k, v]) => [v, k as CatTypeName]),
) as Record<number, CatTypeName>;

export function idToCatTypeName(id?: number | null): CatTypeName | undefined {
    if (id == null) return undefined;
    return CatTypeNameById[id];
}

function pretty(name: CatTypeName): string {
    switch (name) {
        case 'MEMOQ': return 'memoQ';
        case 'XTM': return 'XTM';
        case 'PRACTICOUNT': return 'PractiCount';
        case 'WORDFAST': return 'Wordfast';
        case 'DEJAVU': return 'DejaVu';
        default: return name.charAt(0) + name.slice(1).toLowerCase();
    }
}

export const CatTypeOptions: INodePropertyOptions[] =
    (Object.keys(CatTypeIdByName) as CatTypeName[])
        .sort((a, b) => CatTypeIdByName[a] - CatTypeIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${CatTypeIdByName[name]})`,
            value: CatTypeIdByName[name],
            description: name,
        }));
