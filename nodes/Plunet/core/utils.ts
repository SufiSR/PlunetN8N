export const labelize = (s: string) =>
  (s || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).trim();

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
