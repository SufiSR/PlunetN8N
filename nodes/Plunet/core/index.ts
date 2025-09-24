// nodes/Plunet/core/index.ts

// Core utilities
export * from './constants';
export * from './errors';
export * from './executor';
export * from './session';
export * from './types';

// SOAP utilities (with specific exports to avoid conflicts)
export { buildEnvelope, sendSoap, parseXml } from './soap';

// XML utilities (with specific exports to avoid conflicts)
export { 
    extractResultBase, 
    extractSoapFault, 
    extractStatusMessage,
    parseIntegerResult,
    parseIntegerArrayResult,
    parseStringResult,
    parseStringArrayResult,
    parseVoidResult,
    parseDateResult,
    parseFileResult,
    parsePropertyResult,
    asNum,
    asStr,
    toArray,
    getBodyRoot,
    getReturnNode,
    type ResultBase
} from './xml';

// Utils (with specific exports to avoid conflicts)
export { labelize, asNonEmpty } from './utils';

// Parsers
export * from './parsers';

// Service utilities (with specific exports to avoid conflicts)
export {
    createStandardExecuteConfig,
    executeStandardService,
    generateOperationOptions,
    generateOperationOptionsFromParams,
    createStringProperty,
    createDateProperty,
    createNumberProperty,
    createBooleanProperty,
    createOptionsProperty,
    createTypedProperty,
    handleVoidResult,
    handleResultWithFallback
} from './service-utils';

// Field definitions
export * from './field-definitions';
