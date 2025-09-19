export const labelize = (s: string) => {
  if (!s) return '';
  
  // Handle common ID patterns first to avoid splitting them
  const idPatterns = [
    { pattern: /^(.+?)(ID)$/i, replacement: '$1 ID' },
    { pattern: /^(.+?)(UUID)$/i, replacement: '$1 UUID' },
    { pattern: /^(.+?)(URL)$/i, replacement: '$1 URL' },
    { pattern: /^(.+?)(API)$/i, replacement: '$1 API' },
    { pattern: /^(.+?)(BIC)$/i, replacement: '$1 BIC' },
    { pattern: /^(.+?)(IBAN)$/i, replacement: '$1 IBAN' },
  ];
  
  let result = s;
  let idPatternMatched = false;
  
  for (const { pattern, replacement } of idPatterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      idPatternMatched = true;
      break;
    }
  }
  
  // Only apply camelCase to space conversion if no ID pattern was matched
  if (!idPatternMatched) {
    result = result.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }
  
  // Capitalize first letter
  return result.replace(/^./, (c) => c.toUpperCase()).trim();
};

export const asNonEmpty = <T>(arr: T[] | null | undefined): T[] =>
  Array.isArray(arr) && arr.length ? arr : [];

export function toSoapParamValue(
  value: unknown,
  paramName: string,
  numericBooleanParams?: Set<string>,
): string {
  if (numericBooleanParams?.has(paramName)) return value ? '1' : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || value === undefined) return '';
  return String(value);
}
