import type { StudentNames } from "@/lib/students/names";

/** Notification types written by the database (a CHECK on the table lists the same). */
export type NotificationType =
  | "absence"
  | "absence_corrected"
  | "unjustified_absences"
  | "repeated_lateness"
  | "subscription_expiring"
  | "demo_request";

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
  /** subscription_expiring: the school (platform rows have no school_id of their own), plan, trial / active, last day. */
  school_id?: string;
  school_name?: string;
  plan?: string;
  status?: "trial" | "active";
  last_day?: string;
  days_left?: number;
  /** demo_request: the request (home page form), for the platform owner. */
  request_id?: string;
  full_name?: string;
  city?: string;
  phone?: string;
  students?: string;
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
