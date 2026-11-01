// Unit checks of src/lib/fees/ledger.ts (Phase 13 step 5): the order of
// record_payment (due date, registration / tuition / services, month,
// service, id), the oldest-first allocation the payment dialog previews, the
// month states of the Frais card and the totals. The same order against the
// database itself: actions-student-payments.mjs.
import { check } from "./checks.mjs";

const { allocateOldestFirst, compareCharges, ledgerTotals, monthCells, openCharges } = await import("../../src/lib/fees/ledger.ts");

const label = (s) => `[P13 ledger] ${s}`;
const same = (name, got, want) => check(label(name), JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
const charge = (id, kind, month, dueOn, net, extra = {}) =>
  ({ id, kind, month, serviceId: kind === "service" ? extra.serviceId ?? "s1" : null, dueOn, gross: net, net, paid: 0, cancelled: null, ...extra });

const reg = charge("r", "registration", null, "2026-09-05", 100000);
const sep = charge("t9", "tuition", "2026-09-01", "2026-09-05", 120000);
const busSep = charge("b9", "service", "2026-09-01", "2026-09-05", 40000, { serviceId: "s2" });
const canteenSep = charge("c9", "service", "2026-09-01", "2026-09-05", 30000, { serviceId: "s1" });
const oct = charge("t10", "tuition", "2026-10-01", "2026-10-05", 120000);
const nov = charge("t11", "tuition", "2026-11-01", "2026-11-05", 120000);
const all = [nov, busSep, oct, canteenSep, sep, reg];

same("order: registration, then the month's tuition, then its services by service id, then the next month",
  [...all].sort(compareCharges).map((c) => c.id), ["r", "t9", "c9", "b9", "t10", "t11"]);
same("an earlier due date comes first whatever the kind",
  [reg, { ...busSep, dueOn: "2026-09-01" }].sort(compareCharges).map((c) => c.id), ["b9", "r"]);

same("1 500 DH: registration in full, then 500 DH of September's tuition",
  allocateOldestFirst(all, 150000), [{ chargeId: "r", amount: 100000 }, { chargeId: "t9", amount: 50000 }]);
same("exactly the first two charges: two full lines, nothing more",
  allocateOldestFirst(all, 220000), [{ chargeId: "r", amount: 100000 }, { chargeId: "t9", amount: 120000 }]);
same("a part-paid charge takes only its balance; cancelled and paid ones are skipped",
  allocateOldestFirst([{ ...reg, paid: 100000 }, { ...sep, paid: 20000 }, { ...canteenSep, cancelled: { reason: "waived", note: null, at: "x" } }, busSep], 120000),
  [{ chargeId: "t9", amount: 100000 }, { chargeId: "b9", amount: 20000 }]);
same("more than everything: stops at the last balance (the database refuses it anyway)",
  allocateOldestFirst([reg], 999999), [{ chargeId: "r", amount: 100000 }]);
same("open charges leave out a free one (net 0)",
  openCharges([charge("f", "tuition", "2026-12-01", "2026-12-05", 0), oct]).map((c) => c.id), ["t10"]);

const states = (charges, today) => monthCells(charges, today).map((c) => `${c.key}:${c.state}`);
same("states on 2026-10-10: registration paid, September partial, October unpaid (due on the 5th), November not due",
  states([{ ...reg, paid: 100000 }, { ...sep, paid: 120000 }, { ...canteenSep, paid: 10000 }, oct, nov], "2026-10-10"),
  ["registration:paid", "2026-09-01:partial", "2026-10-01:unpaid", "2026-11-01:notDue"]);
same("the due day itself counts as due",
  states([oct], "2026-10-05"), ["2026-10-01:unpaid"]);
same("a month whose only charge is cancelled; a month with net 0 is free",
  states([{ ...oct, cancelled: { reason: "waived", note: null, at: "x" } }, charge("f", "tuition", "2026-12-01", "2026-12-05", 0)], "2026-10-10"),
  ["2026-10-01:cancelled", "2026-12-01:free"]);
same("a cancelled service does not count in its month (tuition paid → paid)",
  states([{ ...sep, paid: 120000 }, { ...busSep, cancelled: { reason: "waived", note: null, at: "x" } }], "2026-10-10"),
  ["2026-09-01:paid"]);

same("totals on 2026-10-10: cancelled left out, due to date = past balances only",
  ledgerTotals([{ ...reg, paid: 100000 }, { ...sep, paid: 20000 }, oct, nov, { ...busSep, cancelled: { reason: "waived", note: null, at: "x" } }], "2026-10-10"),
  { total: 460000, paid: 120000, balance: 340000, dueNow: 220000 });
