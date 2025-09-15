import type { EnumRegistry } from './types';
import { CustomerStatus } from './customer';

export * from './types';
export * from './customer';
// export * from './order';   // later
// export * from './common';  // later

/** Central registry so services can look up enums by string key */
export const enumRegistry: EnumRegistry = {
    CustomerStatus,
};
