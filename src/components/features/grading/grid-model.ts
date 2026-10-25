// Pure helpers of the coefficient grid (one cycle): columns, cell keys, the
// drafts typed in the cells, validation and the cells to send on save.

export type GridLevel = { id: string; name: string; tracks: { id: string; name: string }[]; controlsCount: number };
export type GridRow = {
  levelId: string;
  trackId: string | null;
  subjectId: string;
  coefficient: number;
  controlsCount: number | null;
  position: number;
};
export type GridColumn = {
  key: string;
  levelId: string;
  trackId: string | null;
  levelName: string;
  trackName: string | null;
  /** A filière column's common column (inherits from it); null for a common column. */
  commonKey: string | null;
  /** The level's number of contrôles (placeholder of the override). */
  levelControls: number;
};
export type CellDraft = { coefficient: string; controls: string };
export type GridView = "coefficients" | "controls";

export const columnKey = (levelId: string, trackId: string | null) => `${levelId}|${trackId ?? ""}`;
export const cellKey = (column: string, subjectId: string) => `${column}|${subjectId}`;

/** Each level of the cycle, then one column per filière of that level. */
export function buildColumns(levels: GridLevel[]): GridColumn[] {
  return levels.flatMap((l) => {
    const common = columnKey(l.id, null);
    return [
      { key: common, levelId: l.id, trackId: null, levelName: l.name, trackName: null, commonKey: null, levelControls: l.controlsCount },
      ...l.tracks.map((t) => ({
        key: columnKey(l.id, t.id),
        levelId: l.id,
        trackId: t.id,
        levelName: l.name,
        trackName: t.name,
        commonKey: common,
        levelControls: l.controlsCount,
      })),
    ];
  });
}

export const formatNumber = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function initialCells(rows: GridRow[]): Record<string, CellDraft> {
  const cells: Record<string, CellDraft> = {};
  for (const r of rows) {
    cells[cellKey(columnKey(r.levelId, r.trackId), r.subjectId)] = {
      coefficient: formatNumber(r.coefficient),
      controls: r.controlsCount ? String(r.controlsCount) : "",
    };
  }
  return cells;
}

/** Subjects graded somewhere in the cycle first (by their smallest report card position), then the others by name. */
export function initialOrder(subjects: { id: string; name: string }[], rows: GridRow[]): string[] {
  const best = new Map<string, number>();
  for (const r of rows) best.set(r.subjectId, Math.min(best.get(r.subjectId) ?? Infinity, r.position));
  return [...subjects]
    .sort((a, b) => {
      const pa = best.get(a.id) ?? Infinity;
      const pb = best.get(b.id) ?? Infinity;
      return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
    })
    .map((s) => s.id);
}

/** "" = empty; else a number 0 < c ≤ 20 with 2 decimals at most ("1,5" accepted). */
export function parseCoefficient(text: string): number | null | "invalid" {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(t)) return "invalid";
  const n = Number(t.replace(",", "."));
  return n > 0 && n <= 20 ? n : "invalid";
}

/** "" = the level's number; else a whole number 1–10. */
export function parseControls(text: string): number | null | "invalid" {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d{1,2}$/.test(t)) return "invalid";
  const n = Number(t);
  return n >= 1 && n <= 10 ? n : "invalid";
}

export const EMPTY: CellDraft = { coefficient: "", controls: "" };

export type SaveCell = {
  levelId: string;
  trackId: string | null;
  subjectId: string;
  coefficient: number | null;
  controlsCount: number | null;
  position: number;
};

/**
 * What to send: every cell whose values changed, plus (after a reorder) every
 * graded cell whose report card position moved. `invalid` = keys of cells
 * that cannot be saved as typed.
 */
export function pendingCells(
  columns: GridColumn[],
  order: string[],
  initial: Record<string, CellDraft>,
  draft: Record<string, CellDraft>,
  positions: Record<string, number>,
  reordered: boolean,
): { cells: SaveCell[]; invalid: Set<string> } {
  const cells: SaveCell[] = [];
  const invalid = new Set<string>();
  order.forEach((subjectId, index) => {
    for (const col of columns) {
      const key = cellKey(col.key, subjectId);
      const before = initial[key] ?? EMPTY;
      const now = draft[key] ?? EMPTY;
      const coefficient = parseCoefficient(now.coefficient);
      const controls = coefficient === null ? null : parseControls(now.controls);
      const valuesChanged =
        now.coefficient.trim() !== before.coefficient || (coefficient !== null && now.controls.trim() !== before.controls);
      const moved = reordered && coefficient !== null && positions[key] !== index + 1;
      if (!valuesChanged && !moved) continue;
      if (coefficient === "invalid" || controls === "invalid") {
        invalid.add(key);
        continue;
      }
      // A cell emptied that had no row is nothing to do.
      if (coefficient === null && before.coefficient === "") continue;
      cells.push({ levelId: col.levelId, trackId: col.trackId, subjectId, coefficient, controlsCount: controls, position: index + 1 });
    }
  });
  return { cells, invalid };
}
