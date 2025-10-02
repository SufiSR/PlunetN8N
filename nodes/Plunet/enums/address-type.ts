import type { INodePropertyOptions } from 'n8n-workflow';
import type { EnumDef } from './types';

export type AddressTypeName = 'DELIVERY' | 'INVOICE' | 'OTHER';

export const AddressTypeIdByName: Record<AddressTypeName, number> = {
    DELIVERY: 1,
    INVOICE: 2,
    OTHER: 3,
};

export const AddressTypeDef: EnumDef = [
    { name: 'DELIVERY', id: 1, label: 'Delivery' },
    { name: 'INVOICE', id: 2, label: 'Invoice' },
    { name: 'OTHER', id: 3, label: 'Other' },
] as const;

export const AddressTypeOptions: INodePropertyOptions[] =
    (Object.keys(AddressTypeIdByName) as AddressTypeName[])
        .sort((a, b) => AddressTypeIdByName[a] - AddressTypeIdByName[b])
        .map((name) => ({
            name: `${name.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())} (${AddressTypeIdByName[name]})`,
            value: AddressTypeIdByName[name],
            description: name,
        }));

export function getAddressTypeName(id: number): string {
    const entry = AddressTypeDef.find(e => e.id === id);
    return entry?.label ?? `Unknown (${id})`;
}

export function idToAddressTypeName(id: number): string | undefined {
    const entry = AddressTypeDef.find(e => e.id === id);
    return entry?.label;
}
