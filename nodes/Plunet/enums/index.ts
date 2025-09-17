import type { EnumRegistry } from './types';
import { CustomerStatus } from './customer-status';

export * from './types';
export * from './customer-status';
// export * from './order';   // later
// export * from './common';  // later

/** Central registry so services can look up enums by string key */
export const enumRegistry: EnumRegistry = {
    CustomerStatus,
};
