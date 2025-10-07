import type { EnumRegistry } from './types';
import { CustomerStatusDef } from './customer-status';
import { WorkingStatusOptions } from './working-status';
import { ContactPersonStatusDef } from './contact-person-status';
import { AddressTypeDef } from './address-type';

export * from './types';
export * from './customer-status';
export * from './working-status';
export * from './folder-types';
export * from './archiv-status';
export * from './address-type';
export * from './resource-status';
export * from './contact-person-status';
// export * from './order';   // later
// export * from './common';  // later

/** Central registry so services can look up enums by string key */
export const enumRegistry: EnumRegistry = {
    CustomerStatus: CustomerStatusDef,
    AddressType: AddressTypeDef,
    ContactPersonStatus: ContactPersonStatusDef,
};
