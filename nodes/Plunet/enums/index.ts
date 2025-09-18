import type { EnumRegistry } from './types';
import { CustomerStatusDef } from './customer-status';
import { WorkingStatusOptions } from './working-status';

export * from './types';
export * from './customer-status';
export * from './working-status';
// export * from './order';   // later
// export * from './common';  // later

/** Central registry so services can look up enums by string key */
export const enumRegistry: EnumRegistry = {
    CustomerStatus: CustomerStatusDef,
};
