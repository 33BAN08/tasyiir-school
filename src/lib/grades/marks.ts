// What a grade-sheet cell holds and how it is typed (browser and server).
// A cell is the text typed: "" (no grade), "abs" (absent) or a mark with "," or
// "." and 2 decimals at most, between 0 and the level's scale (/10 or /20).

export type GradeKind = "control" | "activities";
export type SheetColumn = {
  kind: GradeKind;
  number: number;
  /** A contrôle beyond the subject's current count (count lowered after marks were entered): read-only. */
  extra: boolean;
};
export type Mark = { kind: "empty" } | { kind: "absent" } | { kind: "score"; value: number } | { kind: "invalid" };

export const ABSENT_TEXT = "abs";

/** Key of a cell: student + kind + number. */
export const markKey = (studentId: string, kind: GradeKind, number: number) => `${studentId}|${kind}|${number}`;
export const columnKey = (c: Pick<SheetColumn, "kind" | "number">) => `${c.kind}|${c.number}`;

export function parseMark(text: string, scale: number): Mark {
  const t = text.trim().toLowerCase();
  if (t === "") return { kind: "empty" };
  if (t === "a" || t === "ab" || t === ABSENT_TEXT || t === "abs." || t === "غ") return { kind: "absent" };
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(t)) return { kind: "invalid" };
  const value = Number(t.replace(",", "."));
  return value >= 0 && value <= scale ? { kind: "score", value } : { kind: "invalid" };
}

/** 14.5 → "14,5" (same digits and comma in every language, like the rest of the app). */
export const formatMark = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** The text a saved grade shows in its cell. */
export const gradeText = (g: { score: number | null; absent: boolean }) =>
  g.absent ? ABSENT_TEXT : g.score === null ? "" : formatMark(g.score);

/** Same grade? ("14,5" and "14.5" are the same mark.) */
export function sameMark(a: Mark, b: Mark): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== "score" || (b.kind === "score" && a.value === b.value);
}

export type GradeCellInput = {
  studentId: string;
  kind: GradeKind;
  number: number;
  score: number | null;
  absent: boolean;
  clear: boolean;
};

/**
 * The cells to send: every editable cell whose mark changed. `invalid` = keys
 * that cannot be saved as typed (they block the save).
 */
export function pendingMarks(
  studentIds: string[],
  columns: SheetColumn[],
  initial: Record<string, string>,
  draft: Record<string, string>,
  scale: number,
): { cells: GradeCellInput[]; invalid: Set<string> } {
  const cells: GradeCellInput[] = [];
  const invalid = new Set<string>();
  for (const studentId of studentIds) {
    for (const col of columns) {
      const key = markKey(studentId, col.kind, col.number);
      const now = parseMark(draft[key] ?? "", scale);
      if (sameMark(now, parseMark(initial[key] ?? "", scale))) continue;
      if (now.kind === "invalid") {
        invalid.add(key);
        continue;
      }
      cells.push({
        studentId,
        kind: col.kind,
        number: col.number,
        score: now.kind === "score" ? now.value : null,
        absent: now.kind === "absent",
        clear: now.kind === "empty",
      });
    }
  }
  return { cells, invalid };
}
