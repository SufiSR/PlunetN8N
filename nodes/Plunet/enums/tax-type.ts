// nodes/Plunet/enums/tax-type.ts
import type { INodePropertyOptions } from 'n8n-workflow';

/** Enum names mirror Plunet's API Javadoc */
export type TaxTypeName =
    | 'TAX_1' | 'TAX_2' | 'WITHOUT_TAX' | 'TAX_1_2'  | 'TAX_3' | 'TAX_1_2_3' | 'TAX_4'
    | 'TAX_1_3' | 'TAX_2_3' | 'TAX_5'
    | 'TAX_1_2_3_4' | 'TAX_1_2_3_4_5' | 'TAX_2_4_5' | 'TAX_1_4' | 'INFO' | 'SUM' | 'INFO_SUM' | 'PRICE_BLOCK' ;

export const TaxTypeIdByName: Record<TaxTypeName, number> = {
    TAX_1: 0,
    TAX_2: 1,
    WITHOUT_TAX: 2,
    TAX_1_2: 5,
    TAX_3: 7,
    TAX_1_2_3: 8,
    TAX_4: 9,
    TAX_1_3: 10,
    TAX_2_3: 11,
    TAX_5: 13,
    TAX_1_2_3_4: 14,
    TAX_1_2_3_4_5: 15,
    TAX_2_4_5: 16,
    TAX_1_4: 17,
    INFO: 3,
    SUM: 4,
    INFO_SUM: 6,
    PRICE_BLOCK: 12,
};

export const TaxTypeNameById: Record<number, TaxTypeName> = Object.fromEntries(
    Object.entries(TaxTypeIdByName).map(([k, v]) => [v, k as TaxTypeName]),
) as Record<number, TaxTypeName>;

export function idToTaxTypeName(id?: number | null): TaxTypeName | undefined {
    if (id == null) return undefined;
    return TaxTypeNameById[id];
}

export const TaxTypeOptions: INodePropertyOptions[] =
    (Object.keys(TaxTypeIdByName) as TaxTypeName[])
        .map((name) => ({
            name: `${name} (${TaxTypeIdByName[name]})`,
            value: TaxTypeIdByName[name],
            description: name,
        }));
