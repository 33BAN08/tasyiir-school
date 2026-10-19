import type { StudentNames } from "@/lib/students/names";

/** Notification types written by the database (a CHECK on the table lists the same). */
export type NotificationType = "absence" | "absence_corrected" | "unjustified_absences" | "repeated_lateness";

/** What a notification needs to write its sentence (see the Phase 8 migrations). */
export type NotificationData = {
  /** unjustified_absences: the month ("2026-10") and the days counted. */
  month?: string;
  days?: number;
  /** repeated_lateness: the lates counted, the rule's window, first late day → alert day. */
  count?: number;
  window_days?: number;
  from?: string;
  to?: string;
  session_id?: string;
  date?: string;
  start?: string;
  end?: string;
  subject?: string;
  /** absence_corrected: what the mark is now. */
  now?: "late" | "present" | "cancelled";
  minutes_late?: number | null;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  studentId: string | null;
  student: StudentNames | null;
  data: NotificationData;
  createdAt: string;
  readAt: string | null;
};
