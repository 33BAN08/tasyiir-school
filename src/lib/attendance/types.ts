// Attendance shapes shared by the server reads and the client screens.

export type MarkStatus = "absent" | "late";

/** An absent or late student (present students have no mark). */
export type RollCallMark = { status: MarkStatus; minutesLate: number | null };
