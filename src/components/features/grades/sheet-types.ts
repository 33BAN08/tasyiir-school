import type { SheetColumn } from "@/lib/grades/marks";

/** A student row as the sheet shows it (names already in the page language). */
export type SheetRowStudent = { id: string; name: string; otherName: string | null };

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
};
