// Guard against the Data API's 1000-row cap (2026-10-26): every read of the
// tables / RPC that grow past 1000 rows for a large school must be paged
// (readAll + .range), or be listed here with the narrow filter that keeps it
// small. A new unpaged read fails this check until it is paged or reviewed and
// added below. Also unit checks of readAll() itself.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { check } from "./checks.mjs";

const { readAll, PAGE_SIZE } = await import("../../src/lib/supabase/read-all.ts");

// Tables / functions whose school-wide or year-wide reads pass 1000 rows.
const BIG = ["lessons", "attendance_marks", "class_averages"];

// Unpaged reads that stay small, per file: how many, and why.
const ALLOWED = {
  "src/lib/attendance/roll-call.ts": [2, "one teacher's lessons (their week)"],
  "src/lib/attendance/teacher-home.ts": [1, "one teacher's lessons"],
  "src/lib/announcements/queries.ts": [1, "one teacher's lessons of the year"],
  "src/lib/remarks/queries.ts": [1, "one teacher's lessons of the year"],
  "src/lib/grades/sheet.ts": [1, "one teacher's lessons of the year"],
  "src/lib/timetable/lesson-checks.ts": [1, "the lessons of ONE time slot (one per class at most)"],
  "src/lib/timetable/move-actions.ts": [1, "two lessons by id"],
  "src/lib/timetable/copy-actions.ts": [1, "one class's lessons"],
};

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.tsx?$/.test(name)) files.push(path);
  }
};
walk("src");

const unpaged = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const re = new RegExp(`\\.(from|rpc)\\(\\s*"(${BIG.join("|")})"`, "g");
  let m;
  while ((m = re.exec(src))) {
    // The statement: up to the next ";" + newline (or the end of a call list).
    const end = src.indexOf(";\n", m.index);
    const stmt = src.slice(m.index, end === -1 ? undefined : end);
    const head = stmt.split(".select(")[0];
    const isRead = m[1] === "rpc" || stmt.includes(".select(");
    const isWrite = /\.(insert|update|delete|upsert)\(/.test(head);
    if (!isRead || isWrite) continue;
    if (/\.(single|maybeSingle)\(\)|head:\s*true|\.range\(/.test(stmt)) continue;
    // Inside a readAll((from, to) => …) page builder: paged (its .range() can come on a later line).
    if (/readAll(<[^>]*>)?\(\s*(\([^)]*\)|\w+)\s*=>[^;]*$/.test(src.slice(Math.max(0, m.index - 200), m.index))) continue;
    const key = file.split("\\").join("/");
    unpaged.set(key, (unpaged.get(key) ?? 0) + 1);
  }
}

for (const [file, count] of unpaged) {
  const allowed = ALLOWED[file];
  check(`[paged reads] ${file}: ${count} unpaged read(s) of ${BIG.join(" / ")} reviewed`,
    allowed !== undefined && allowed[0] === count,
    allowed ? `listed ${allowed[0]} (${allowed[1]}), found ${count}` : "not listed: page it with readAll() or review it and add it to ALLOWED");
}
for (const [file, [count]] of Object.entries(ALLOWED)) {
  if (!unpaged.has(file)) check(`[paged reads] ${file}: listed ${count} but none found (update ALLOWED)`, false, "stale entry");
}

// --- readAll() --------------------------------------------------------------------------------------
const pager = (total, error = null) => {
  const calls = [];
  const page = (from, to) => {
    calls.push([from, to]);
    if (error) return Promise.resolve({ data: null, error });
    const n = Math.max(0, Math.min(to, total - 1) - from + 1);
    return Promise.resolve({ data: Array.from({ length: n }, (_, i) => from + i), error: null });
  };
  return { page, calls };
};
{
  const p = pager(2 * PAGE_SIZE + 500);
  const rows = await readAll(p.page, "test");
  check("[paged reads] readAll: 2500 rows in 3 calls, in order, none twice",
    rows.length === 2500 && p.calls.length === 3 && rows.every((v, i) => v === i) && p.calls[1][0] === PAGE_SIZE, `${rows.length} rows, ${p.calls.length} calls`);
}
{
  const p = pager(PAGE_SIZE);
  const rows = await readAll(p.page, "test");
  check("[paged reads] readAll: exactly 1000 rows → one more call that comes back empty", rows.length === PAGE_SIZE && p.calls.length === 2);
}
{
  const p = pager(0);
  const rows = await readAll(p.page, "test");
  check("[paged reads] readAll: no row → one call", rows.length === 0 && p.calls.length === 1);
}
{
  const p = pager(10, { code: "42501" });
  let failed = false;
  try { await readAll(p.page, "test"); } catch (e) { failed = e.message === "test failed"; }
  check("[paged reads] readAll: an error throws (never a partial list)", failed);
}
