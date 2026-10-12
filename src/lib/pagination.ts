type PageQueryResult<R> = {
  data: R[] | null;
  error: { code: string } | null;
  count: number | null;
};

export type Page<R> = { rows: R[]; total: number; page: number; pageCount: number };

/**
 * Runs a paged PostgREST query (`run(p)` must apply `.range()` for page p and
 * ask for `count: "exact"`). A page past the end (PGRST103: range not
 * satisfiable, e.g. after a delete or a stale link) shows the last page.
 */
export async function fetchPage<R>(
  run: (page: number) => PromiseLike<PageQueryResult<R>>,
  page: number,
  pageSize: number,
  label: string,
): Promise<Page<R>> {
  let current = page;
  let result = await run(current);
  if (result.error?.code === "PGRST103") {
    const { count } = await run(1);
    current = Math.max(1, Math.ceil((count ?? 0) / pageSize));
    result = await run(current);
  }
  if (result.error) throw new Error(`${label} failed: ${result.error.code}`);

  const total = result.count ?? 0;
  return {
    rows: result.data ?? [],
    total,
    page: current,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** `.range()` bounds of a 1-based page. */
export function pageRange(page: number, pageSize: number): [number, number] {
  return [(page - 1) * pageSize, page * pageSize - 1];
}
