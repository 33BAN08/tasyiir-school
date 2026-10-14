// School days and time slots: shared helpers (client + server) and the
// typical Moroccan week. Same rules as the database (time_slots checks):
// Monday = 1 … Saturday = 6, whole minutes, start < end, at most 4 hours.
// Day names are translated under `setup.timeSlots.days`.

export const SCHOOL_DAYS = [1, 2, 3, 4, 5, 6] as const;
export type SchoolDay = (typeof SCHOOL_DAYS)[number];

/** Message key of each day (`setup.timeSlots.days.<key>`). */
export const DAY_KEYS = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" } as const;

export const SLOT_KINDS = ["lesson", "break"] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export const MAX_SLOT_MINUTES = 4 * 60;
export const MAX_LABEL_LENGTH = 40;

/** "08:00" → 480. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** 480 → "08:00". */
export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * What the director typed → "HH:MM", or null. Accepts "8:00", "08:00",
 * "8h00", "8h", "8.30" and "0830".
 */
export function normalizeTime(input: string): string | null {
  const v = input.trim().toLowerCase();
  const match = /^(\d{1,2})(?:[:h.]?(\d{2}))?h?$/.exec(v);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2] ?? "0");
  if (h > 23 || m > 59) return null;
  return fromMinutes(h * 60 + m);
}

/** Database "08:00:00" → "08:00". */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}

/** Labels of the template breaks (`setup.timeSlots.template.labels.<key>`). */
export type TemplateLabel = "recess" | "lunch";
export type TemplateSlot = { start: string; end: string; kind: SlotKind; label?: TemplateLabel };

const MORNING: TemplateSlot[] = [
  { start: "08:00", end: "09:00", kind: "lesson" },
  { start: "09:00", end: "10:00", kind: "lesson" },
  { start: "10:00", end: "10:15", kind: "break", label: "recess" },
  { start: "10:15", end: "11:15", kind: "lesson" },
  { start: "11:15", end: "12:15", kind: "lesson" },
];

const FULL_DAY: TemplateSlot[] = [
  ...MORNING,
  { start: "12:15", end: "14:00", kind: "break", label: "lunch" },
  { start: "14:00", end: "15:00", kind: "lesson" },
  { start: "15:00", end: "16:00", kind: "lesson" },
  { start: "16:00", end: "17:00", kind: "lesson" },
];

/**
 * A typical Moroccan private-school week: Monday → Friday full days,
 * Saturday morning. A starting point; the director edits it afterwards.
 */
export const TIME_SLOT_TEMPLATE: Record<SchoolDay, TemplateSlot[]> = {
  1: FULL_DAY,
  2: FULL_DAY,
  3: FULL_DAY,
  4: FULL_DAY,
  5: FULL_DAY,
  6: MORNING,
};
