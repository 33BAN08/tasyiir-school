import type { StudentNames } from "@/lib/students/names";

/** Notification types written by the database (a CHECK on the table lists the same). */
export type NotificationType = "absence" | "absence_corrected";

/** What an absence notification needs to write its sentence (see the Phase 8 migrations). */
export type NotificationData = {
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
