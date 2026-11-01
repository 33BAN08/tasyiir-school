// The receipt print page records one print per opening (record_receipt_print:
// number 1 = ORIGINAL). Its FR / AR switch carries the print it came from;
// that print is re-used, nothing recorded, when it is the same payment, the
// same person and less than 10 minutes old (user, 2026-11-01). Plain module:
// rules-receipt.mjs checks it.

export const PRINT_REUSE_MS = 10 * 60_000;

export type PrintRow = { id: string; paymentId: string; printedBy: string | null; printedAt: string; printNo: number };

export function canReusePrint(print: PrintRow, ctx: { paymentId: string; userId: string; nowMs: number }): boolean {
  const age = ctx.nowMs - Date.parse(print.printedAt);
  // A clock a little ahead of this server's is not "the future": one minute of slack.
  return print.paymentId === ctx.paymentId && print.printedBy === ctx.userId && age < PRINT_REUSE_MS && age > -60_000;
}
