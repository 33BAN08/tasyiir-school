// Whether an absence is justified. A justification never changes the marks:
// an absence counts as justified when an APPROVED justification covers it —
// the whole day ('days') or that very mark ('mark'). Pending and rejected ones
// justify nothing; they are only shown.

export type CoverageJustification = {
  kind: "days" | "mark";
  status: "pending" | "approved" | "rejected";
  fromDate: string;
  toDate: string;
  sessionId: string | null;
};

export type JustificationState = "justified" | "pending" | "rejected" | "none";

const RANK: Record<JustificationState, number> = { justified: 3, pending: 2, rejected: 1, none: 0 };

export function absenceState(mark: { sessionId: string; date: string }, justifications: CoverageJustification[]): JustificationState {
  let best: JustificationState = "none";
  for (const j of justifications) {
    const covers = j.kind === "mark" ? j.sessionId === mark.sessionId : j.fromDate <= mark.date && mark.date <= j.toDate;
    if (!covers) continue;
    const state: JustificationState = j.status === "approved" ? "justified" : j.status;
    if (RANK[state] > RANK[best]) best = state;
  }
  return best;
}
