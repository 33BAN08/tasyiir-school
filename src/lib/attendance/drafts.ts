// A roll call not saved yet, kept on the phone (localStorage) so a reload or
// a dropped connection loses no tap. Tied to the account, the lesson and the
// date; deleted as soon as it is saved, and every copy is cleared on logout.
// Client only. Storage can be missing or refuse (private mode, full): every
// access is guarded and the screen works without it.

import type { RollCallMark } from "./types";

const PREFIX = "tasyir:rollcall:v1:";
/** Copies saved under the old brand spelling: never read, removed by the purges. */
const LEGACY_PREFIX = "tasyiir:rollcall:v1:";

export type RollCallDraft = Record<string, RollCallMark>;

const keyOf = (userId: string, lessonId: string, date: string) => `${PREFIX}${userId}:${lessonId}:${date}`;

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
    return Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => !!k && (k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX)));
  } catch {
    return [];
  }
}

export function readDraft(userId: string, lessonId: string, date: string): RollCallDraft | null {
  try {
    const raw = storage()?.getItem(keyOf(userId, lessonId, date));
    return raw ? (JSON.parse(raw) as RollCallDraft) : null;
  } catch {
    return null;
  }
}

export function writeDraft(userId: string, lessonId: string, date: string, draft: RollCallDraft): void {
  try {
    storage()?.setItem(keyOf(userId, lessonId, date), JSON.stringify(draft));
  } catch {
    // Storage full or refused: the roll call still works, only unprotected.
  }
}

export function deleteDraft(userId: string, lessonId: string, date: string): void {
  try {
    storage()?.removeItem(keyOf(userId, lessonId, date));
  } catch {
    // Nothing to do.
  }
}

/**
 * Drops copies of other accounts, and of days other than today and `keep` (the day open on screen:
 * staff may correct a past day; a teacher only saves today's roll call).
 */
export function purgeDrafts(userId: string, today: string, keep: string = today): void {
  for (const key of keys()) {
    const [owner, , date] = key.slice(PREFIX.length).split(":");
    if (!key.startsWith(PREFIX) || owner !== userId || (date !== today && date !== keep)) {
      try {
        storage()?.removeItem(key);
      } catch {
        // Nothing to do.
      }
    }
  }
}

/** On logout: every roll-call copy on this device, whoever made it. */
export function clearAllDrafts(): void {
  for (const key of keys()) {
    try {
      storage()?.removeItem(key);
    } catch {
      // Nothing to do.
    }
  }
}
