// Common numeric boolean parameters that should be serialized as "1"/"0" instead of "true"/"false"
export const NUMERIC_BOOLEAN_PARAMS = new Set<string>([
    'enableNullOrEmptyValues',
    'createAsFirstItem',
    'overwriteExistingPriceLines',
    'analyzeAndCopyResultToJob',
]);
