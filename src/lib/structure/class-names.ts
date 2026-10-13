// Class name suggestions, shared by the class dialogs and the Server Actions:
// "<prefix>-A", "<prefix>-B", … skipping names the year already has.

export const MAX_BATCH_CLASSES = 12;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The next `count` free names for `prefix` in a year, or null when the
 * alphabet runs out. `taken`: the year's class names (any case).
 */
export function suggestClassNames(prefix: string, taken: Iterable<string>, count: number): string[] | null {
  const used = new Set([...taken].map((name) => name.toLowerCase()));
  const base = prefix.trim();
  const names: string[] = [];
  for (const letter of LETTERS) {
    if (names.length === count) break;
    const name = `${base}-${letter}`;
    if (!used.has(name.toLowerCase())) names.push(name);
  }
  return names.length === count ? names : null;
}

/** "1AC-B" before "1AC-AA", "6AP-2" before "6AP-10". */
export const compareClassNames = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
