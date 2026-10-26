// The Data API returns at most 1000 rows per call, for a table read as for an
// RPC (Supabase "Max rows", default 1000; checked on DEV 2026-10-26: a
// 1560-row class_averages() came back with 1000). A read that can pass that
// for a large school must go through readAll(): it asks page after page until
// a short page.
//
// The page builder MUST sort on a unique key (or a unique set of columns),
// else rows can repeat or go missing between pages.

/** Rows per call: the API's cap. A lower "Max rows" setting would stop readAll after the first page. */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Every row of a query: `page(from, to)` = the query with its fixed order and `.range(from, to)`. */
export async function readAll<T>(page: (from: number, to: number) => Page<T>, what: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${what} failed`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
