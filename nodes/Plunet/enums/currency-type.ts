import type { INodePropertyOptions } from 'n8n-workflow';

export type CurrencyTypeName =
    | 'PROJECTCURRENCY'
    | 'HOMECURRENCY';

export const CurrencyTypeIdByName: Record<CurrencyTypeName, number> = {
    PROJECTCURRENCY: 1,
    HOMECURRENCY: 2,
};

const CurrencyTypeNameById: Record<number, CurrencyTypeName> = Object.fromEntries(
    Object.entries(CurrencyTypeIdByName).map(([k, v]) => [v, k as CurrencyTypeName]),
) as Record<number, CurrencyTypeName>;

export function idToCurrencyTypeName(id?: number | null): CurrencyTypeName | undefined {
    if (id == null) return undefined;
    return CurrencyTypeNameById[id];
}

function pretty(name: CurrencyTypeName): string {
    switch (name) {
        case 'PROJECTCURRENCY': return 'Project currency';
        case 'HOMECURRENCY': return 'Home currency';
        default: {
            const s = String(name);
            return s.charAt(0) + s.slice(1).toLowerCase();
        }
    }
}

export const CurrencyTypeOptions: INodePropertyOptions[] =
    (Object.keys(CurrencyTypeIdByName) as CurrencyTypeName[])
        .sort((a, b) => CurrencyTypeIdByName[a] - CurrencyTypeIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${CurrencyTypeIdByName[name]})`,
            value: CurrencyTypeIdByName[name],
            description: name,
        }));
