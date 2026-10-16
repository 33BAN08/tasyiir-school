import "server-only";

import { readSheet } from "read-excel-file/node";

import type { Cell } from "./cells";
import { columnOf, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, REQUIRED_COLUMNS, type ImportColumn } from "./columns";
import { decodeCsv, parseCsv } from "./csv";
import type { ImportFileError } from "./types";

// An uploaded import file → its data rows, keyed by column. Only the first
// sheet of an Excel file is read. The first non-empty line is the header.

export type RawRow = { line: number; cells: Partial<Record<ImportColumn, Cell>> };

export type ReadFile =
  | { rows: RawRow[]; columns: Set<ImportColumn>; ignoredHeaders: string[] }
  | { error: ImportFileError };

async function sheetOf(file: File): Promise<Cell[][] | ImportFileError> {
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (name.endsWith(".xlsx")) {
    try {
      return (await readSheet(Buffer.from(bytes))) as Cell[][];
    } catch {
      return { key: "unreadable" };
    }
  }
  if (name.endsWith(".csv") || name.endsWith(".txt")) return parseCsv(decodeCsv(bytes).text);
  if (name.endsWith(".xls")) return { key: "oldExcel" };
  return { key: "unsupportedType" };
}

const isEmpty = (row: Cell[]) => row.every((c) => c === null || c === undefined || String(c).trim() === "");

export async function readImportFile(file: File | null): Promise<ReadFile> {
  if (!file || file.size === 0) return { error: { key: file ? "empty" : "noFile" } };
  if (file.size > MAX_IMPORT_BYTES) return { error: { key: "tooBig" } };

  const sheet = await sheetOf(file);
  if (!Array.isArray(sheet)) return { error: sheet };

  const headerIndex = sheet.findIndex((row) => !isEmpty(row));
  if (headerIndex < 0) return { error: { key: "empty" } };

  // Header → column. A column named twice: the first one counts.
  const indexOf = new Map<ImportColumn, number>();
  const ignoredHeaders: string[] = [];
  sheet[headerIndex].forEach((cell, i) => {
    const header = cell === null || cell === undefined ? "" : String(cell).trim();
    if (!header) return;
    const column = columnOf(header);
    if (column && !indexOf.has(column)) indexOf.set(column, i);
    else ignoredHeaders.push(header);
  });
  const missing = REQUIRED_COLUMNS.filter((c) => !indexOf.has(c));
  if (missing.length > 0) return { error: { key: "missingColumns", columns: missing } };

  const rows: RawRow[] = [];
  for (let i = headerIndex + 1; i < sheet.length; i++) {
    if (isEmpty(sheet[i])) continue;
    const cells: RawRow["cells"] = {};
    for (const [column, index] of indexOf) cells[column] = sheet[i][index];
    rows.push({ line: i + 1, cells });
  }
  if (rows.length === 0) return { error: { key: "empty" } };
  if (rows.length > MAX_IMPORT_ROWS) return { error: { key: "tooManyRows" } };

  return { rows, columns: new Set(indexOf.keys()), ignoredHeaders };
}
