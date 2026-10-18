// Justifications (Phase 7): shared by the browser (file preparation, upload)
// and the Server Actions (path and date checks). Storage and table rules:
// migration phase7_justifications.

export const JUSTIFICATION_BUCKET = "justifications";

/** What is stored (after re-encoding photos) may not exceed the bucket limit. */
export const JUSTIFICATION_MAX_BYTES = 5 * 1024 * 1024;

/** Phone photos are big: the picked photo may be larger, the stored one is not. */
export const JUSTIFICATION_SOURCE_MAX_BYTES = 15 * 1024 * 1024;

export const JUSTIFICATION_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const JUSTIFICATION_FILE_TYPES = [...JUSTIFICATION_IMAGE_TYPES, "application/pdf"] as const;

/** Longest side of a stored photo, in pixels (a handwritten note stays readable). */
export const JUSTIFICATION_IMAGE_SIDE = 2000;

/** Signed URLs for a note live one minute: created when the user taps "View". */
export const JUSTIFICATION_URL_SECONDS = 60;

export type JustificationExtension = "webp" | "jpg" | "png" | "pdf";

/** A parent's justification: whole days, at most this many, from a year back to a month ahead. */
export const MAX_DAYS = 31;
export const LOOKBACK_DAYS = 365;
export const AHEAD_DAYS = 30;

/** `<school>/<student>/<uuid>.<ext>`: the only shape the table and the bucket accept. */
export function justificationPath(schoolId: string, studentId: string, fileId: string, ext: JustificationExtension): string {
  return `${schoolId}/${studentId}/${fileId}.${ext}`;
}

export function isJustificationPathOf(path: string, schoolId: string, studentId: string): boolean {
  const prefix = `${schoolId}/${studentId}/`;
  return path.startsWith(prefix) && /^[0-9a-f-]{36}\.(webp|jpg|png|pdf)$/.test(path.slice(prefix.length));
}

const DAY = 86_400_000;
const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** "yyyy-MM-dd" plus `days` (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number): string {
  return new Date(parse(date) + days * DAY).toISOString().slice(0, 10);
}

/** Number of days from `from` to `to`, both included. */
export function dayCount(from: string, to: string): number {
  return Math.round((parse(to) - parse(from)) / DAY) + 1;
}
