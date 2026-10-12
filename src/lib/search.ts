/**
 * PostgREST `or()` filter: case-insensitive "contains" on any of `columns`.
 * Null when the term is empty. Characters that are syntax in or() / LIKE
 * patterns are dropped, so user input can never change the filter.
 */
export function ilikeAny(q: string, columns: readonly string[]): string | null {
  const term = q.replace(/[,()"\\%_*]/g, " ").trim();
  if (!term) return null;
  return columns.map((col) => `${col}.ilike."%${term}%"`).join(",");
}
