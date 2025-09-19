export const labelize = (s: string) => {
  if (!s) return '';
  
  // Find the first capital letter and split there
  const firstCapMatch = s.match(/^([a-z0-9]+)([A-Z].*)$/);
  if (!firstCapMatch || firstCapMatch.length < 3) {
    // No capital letter found, just capitalize first letter
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  
  const firstPart = firstCapMatch[1];
  const secondPart = firstCapMatch[2];
  
  if (!firstPart || !secondPart) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  
  // Check if second part has a capital letter at position 2 (like "ID", "URL", etc.)
  const isSpecialPattern = /^[A-Z][A-Z]/.test(secondPart);
  
  let result = firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
  
  if (isSpecialPattern) {
    // Don't split further for patterns like ID, URL, API, etc.
    result += ' ' + secondPart;
  } else {
    // Continue splitting on capital letters
    result += ' ' + secondPart.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }
  
  return result;
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
