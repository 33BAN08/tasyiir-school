// The mention printed on a report card (user 2026-10-26): from the card's
// general average, never a pass / repeat decision. Thresholds on /20; a /10
// scale uses half of them.
//   < 10 none · 10 Passable · 12 Assez bien · 14 Bien · 16 Très bien

export type Mention = "passable" | "assezBien" | "bien" | "tresBien";

const THRESHOLDS: [number, Mention][] = [
  [16, "tresBien"],
  [14, "bien"],
  [12, "assezBien"],
  [10, "passable"],
];

export function mentionFor(average: number | null, scale: number): Mention | null {
  if (average === null) return null;
  const on20 = (average * 20) / scale;
  return THRESHOLDS.find(([min]) => on20 >= min)?.[1] ?? null;
}
