// nodes/Plunet/enums/form-of-address.ts
import type { INodePropertyOptions } from 'n8n-workflow';

export type FormOfAddressName = 'SIR' | 'MADAM' | 'COMPANY';

export const FormOfAddressIdByName: Record<FormOfAddressName, number> = {
    SIR: 1,
    MADAM: 2,
    COMPANY: 3,
};

export const FormOfAddressNameById: Record<number, FormOfAddressName> = {
    1: 'SIR',
    2: 'MADAM',
    3: 'COMPANY',
};

export function idToFormOfAddressName(id?: number | null): FormOfAddressName | undefined {
    if (id == null) return undefined;
    return FormOfAddressNameById[id];
}

function pretty(name: FormOfAddressName): string {
    switch (name) {
        case 'SIR': return 'Sir';
        case 'MADAM': return 'Madam';
        case 'COMPANY': return 'Company';
    }
}

export const FormOfAddressOptions: INodePropertyOptions[] =
    (Object.keys(FormOfAddressIdByName) as FormOfAddressName[])
        .sort((a, b) => FormOfAddressIdByName[a] - FormOfAddressIdByName[b])
        .map((name) => ({
            name: `${pretty(name)} (${FormOfAddressIdByName[name]})`,
            value: FormOfAddressIdByName[name],
            description: name,
        }));
