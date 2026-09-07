export function own<T extends object, K extends keyof T>(
  record: T | undefined,
  key: K,
): T[K] | undefined {
  return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
