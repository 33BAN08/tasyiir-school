// RLS checks. Each check talks to the Data API as a real signed-in user
// (publishable key + their JWT), exactly like the browser would.

const results = [];
const skipped = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
}

/** Query must succeed and return `expected` rows (a number or a predicate on the rows). */
export async function rows(name, query, expected) {
  const { data, error } = await query;
  if (error) return record(name, false, `error ${error.code}`);
  const list = Array.isArray(data) ? data : data ? [data] : [];
  const pass = typeof expected === "function" ? expected(list) : list.length === expected;
  record(name, pass, `${list.length} row(s)`);
}

/** Write must be refused: an error, or no row touched (RLS USING filters it out). */
export async function denied(name, query) {
  const { data, error } = await query;
  if (error) return record(name, true, `refused (${error.code})`);
  const touched = Array.isArray(data) ? data.length : data ? 1 : 0;
  record(name, touched === 0, touched === 0 ? "no row touched" : `${touched} row(s) touched!`);
}

/** Write must succeed and touch at least one row. */
export async function allowed(name, query) {
  const { data, error } = await query;
  if (error) return record(name, false, `error ${error.code}`);
  const touched = Array.isArray(data) ? data.length : data ? 1 : 0;
  record(name, touched > 0, `${touched} row(s)`);
}

export function check(name, pass, detail = "") {
  record(name, pass, detail);
}

/** A check that cannot run today (e.g. no lessons on Sunday): listed, never counted as passed. */
export function skip(name, why) {
  skipped.push({ name, why });
}

export function report() {
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  — ${r.detail}`);
  for (const s of skipped) console.log(`SKIP  ${s.name}  — ${s.why}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed${skipped.length ? `, ${skipped.length} skipped` : ""}`);
  return failed;
}
