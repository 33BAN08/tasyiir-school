// A grade sheet not saved yet, kept on the phone (localStorage) so a reload or
// a dropped connection loses no mark. Tied to the account, the semester, the
// class and the subject; deleted as soon as it is saved; copies of other
// accounts are dropped when a sheet opens, and every copy is cleared on
// logout. Client only. Storage can be missing or refuse (private mode, full):
// every access is guarded and the sheet works without it.

const PREFIX = "tasyiir:grades:v1:";

/** Cell key → text typed. */
export type GradeDraft = Record<string, string>;

const keyOf = (userId: string, periodId: string, classId: string, subjectId: string) =>
  `${PREFIX}${userId}:${periodId}:${classId}:${subjectId}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function keys(): string[] {
  const store = storage();
  if (!store) return [];
  try {
    return Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => !!k?.startsWith(PREFIX));
  } catch {
    return [];
  }
}

function remove(key: string) {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

export function readGradeDraft(userId: string, periodId: string, classId: string, subjectId: string): GradeDraft | null {
  try {
    const raw = storage()?.getItem(keyOf(userId, periodId, classId, subjectId));
    return raw ? (JSON.parse(raw) as GradeDraft) : null;
  } catch {
    return null;
  }
}

export function writeGradeDraft(userId: string, periodId: string, classId: string, subjectId: string, draft: GradeDraft): void {
  try {
    storage()?.setItem(keyOf(userId, periodId, classId, subjectId), JSON.stringify(draft));
  } catch {
    // Storage full or refused: the sheet still works, only unprotected.
  }
}

export function deleteGradeDraft(userId: string, periodId: string, classId: string, subjectId: string): void {
  remove(keyOf(userId, periodId, classId, subjectId));
}

/** Drops the copies of other accounts (a shared phone). */
export function purgeGradeDrafts(userId: string): void {
  for (const key of keys()) {
    if (key.slice(PREFIX.length).split(":")[0] !== userId) remove(key);
  }
}

/** On logout: every grade-sheet copy on this device, whoever made it. */
export function clearAllGradeDrafts(): void {
  for (const key of keys()) remove(key);
}
