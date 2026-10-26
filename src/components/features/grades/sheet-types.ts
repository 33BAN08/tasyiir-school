import type { SheetColumn } from "@/lib/grades/marks";

/** A student row as the sheet shows it (names already in the page language). */
export type SheetRowStudent = { id: string; name: string; otherName: string | null };

/**
 * "12,25" (null = no average yet: a muted "—"), and "· 2/3" only while SOME
 * marks are in but not all (then "incomplet" too). Saved marks only.
 */
export type SheetAverage = { value: string | null; count: string | null };

/** What both views need to draw a cell. */
export type CellView = {
  text: string;
  changed: boolean;
  invalid: boolean;
  absent: boolean;
};

export type SheetViewProps = {
  students: SheetRowStudent[];
  /** Editable columns first, read-only extra ones last. */
  columns: SheetColumn[];
  canEdit: boolean;
  cell: (studentId: string, column: SheetColumn) => CellView;
  setCell: (studentId: string, column: SheetColumn, text: string) => void;
  columnLabel: (column: SheetColumn, short: boolean) => string;
  /** The SAVED subject average of the semester (class_averages()) + marks entered / expected; null = no column. */
  average: ((studentId: string) => SheetAverage) | null;
};
