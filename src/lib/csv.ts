// CSV files opened in Excel (French / Arabic Windows): UTF-8 with a BOM (else
// Excel reads Windows-1252), ";" between cells (the comma is the decimal
// sign), CRLF line ends. Plain module: no server or browser API.
//
// Formula injection: Excel runs a cell starting with = + - @ (or a tab / CR,
// and their full-width forms) as a formula — a student or payer name like
// "=HYPERLINK(…)" would. Such a cell gets a leading apostrophe, so it stays
// text. Phones are written "06 12 34 56 78": text for Excel (the leading
// zero stays) without needing the apostrophe.

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;

/** One cell: neutralised when it could start a formula, quoted when it holds ; " or a line break. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file: BOM + header + rows, ";"-separated, CRLF line ends. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

/** "+212612345678" → "06 12 34 56 78" (local format, pairs of digits); anything else as it is. */
export function csvPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+212([5-7]\d{8})$/.exec(phone);
  if (!m) return phone;
  const local = `0${m[1]}`;
  return local.match(/\d{2}/g)!.join(" ");
}

/** Centimes → "1250,50" (decimal comma, no thousands separator: a number for French Excel). */
export function csvAmount(centimes: number): string {
  const sign = centimes < 0 ? "-" : "";
  const abs = Math.abs(centimes);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
