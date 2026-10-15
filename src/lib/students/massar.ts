// Code Massar: the student's national code (one capital letter + 9 digits,
// e.g. J130012345). Same rule as the database check students_code_massar_check.
// Used by the student form and the CSV import.

export const MASSAR_PATTERN = /^[A-Z][0-9]{9}$/;

/** " j13 0012345 " → "J130012345": spaces removed, capitals. "" stays "". */
export function normalizeMassar(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}
