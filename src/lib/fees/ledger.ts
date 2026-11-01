// A student's charges and payments for a year, as the Frais card shows them
// (Phase 13 step 5). Plain module: the server builds the ledger, the payment
// dialog previews an allocation with the same order as record_payment.

export type ChargeKind = "registration" | "tuition" | "service";

export type LedgerCharge = {
  id: string;
  kind: ChargeKind;
  /** `yyyy-MM-01`; null for the registration fee. */
  month: string | null;
  serviceId: string | null;
  /** `yyyy-MM-dd`. */
  dueOn: string;
  gross: number;
  net: number;
  /** Allocated by payments that are not cancelled. */
  paid: number;
  cancelled: { reason: string; note: string | null; at: string } | null;
};

export type MonthState = "paid" | "partial" | "unpaid" | "notDue" | "free" | "cancelled";

export type MonthCell = {
  /** `registration`, or the month `yyyy-MM-01`. */
  key: string;
  month: string | null;
  charges: LedgerCharge[];
  net: number;
  paid: number;
  state: MonthState;
};

export type Allocation = { chargeId: string; amount: number };

const KIND_ORDER: Record<ChargeKind, number> = { registration: 0, tuition: 1, service: 2 };

/**
 * record_payment's order: due date, then registration / tuition / services,
 * month (none first), service, id. Postgres orders uuids like their lowercase
 * text, so plain string comparison gives the same result.
 */
export function compareCharges(a: LedgerCharge, b: LedgerCharge): number {
  const text = (x: string | null, y: string | null) => (x === y ? 0 : x === null ? -1 : y === null ? 1 : x < y ? -1 : 1);
  return (
    text(a.dueOn, b.dueOn) ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    text(a.month, b.month) ||
    // Only services have one: two charges of the same kind never mix null and a value.
    text(a.serviceId, b.serviceId) ||
    text(a.id, b.id)
  );
}

export const balanceOf = (c: LedgerCharge) => (c.cancelled ? 0 : Math.max(0, c.net - c.paid));

/** Charges that can still take money, in record_payment's order. */
export function openCharges(charges: LedgerCharge[]): LedgerCharge[] {
  return charges.filter((c) => balanceOf(c) > 0).sort(compareCharges);
}

/** The allocation record_payment makes without a list: oldest due first, the rest to the next charges. */
export function allocateOldestFirst(charges: LedgerCharge[], amount: number): Allocation[] {
  const out: Allocation[] = [];
  let left = amount;
  for (const c of openCharges(charges)) {
    if (left <= 0) break;
    const take = Math.min(left, balanceOf(c));
    out.push({ chargeId: c.id, amount: take });
    left -= take;
  }
  return out;
}

/** The registration fee, then one cell per month, each with its state on `today` (`yyyy-MM-dd`, from the database). */
export function monthCells(charges: LedgerCharge[], today: string): MonthCell[] {
  const groups = new Map<string, LedgerCharge[]>();
  for (const c of [...charges].sort(compareCharges)) {
    const key = c.month ?? "registration";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const cells = [...groups.entries()].map(([key, list]): MonthCell => {
    const live = list.filter((c) => !c.cancelled);
    const net = live.reduce((s, c) => s + c.net, 0);
    const paid = live.reduce((s, c) => s + Math.min(c.paid, c.net), 0);
    const due = live.some((c) => c.dueOn <= today && balanceOf(c) > 0);
    const state: MonthState =
      live.length === 0 ? "cancelled"
        : net === 0 ? "free"
          : paid >= net ? "paid"
            : paid > 0 ? "partial"
              : due ? "unpaid" : "notDue";
    return { key, month: key === "registration" ? null : key, charges: list, net, paid, state };
  });
  return cells.sort((a, b) => (a.month === null ? -1 : b.month === null ? 1 : a.month < b.month ? -1 : 1));
}

export type LedgerTotals = { total: number; paid: number; balance: number; dueNow: number };

export function ledgerTotals(charges: LedgerCharge[], today: string): LedgerTotals {
  const live = charges.filter((c) => !c.cancelled);
  const total = live.reduce((s, c) => s + c.net, 0);
  const paid = live.reduce((s, c) => s + Math.min(c.paid, c.net), 0);
  const dueNow = live.filter((c) => c.dueOn <= today).reduce((s, c) => s + balanceOf(c), 0);
  return { total, paid, balance: total - paid, dueNow };
}
