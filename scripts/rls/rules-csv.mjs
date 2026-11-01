// Unit checks of the fee reports (Phase 13 step 7): src/lib/csv.ts (formula
// injection, quoting, BOM + CRLF, phones "06 12 34 56 78", amounts) and
// src/lib/fees/report-rules.ts (journal dates, unpaid month filter, totals).
import { check } from "./checks.mjs";

const { csvAmount, csvCell, csvPhone, toCsv } = await import("../../src/lib/csv.ts");
const { journalRange, journalTotals, unpaidMonthFilter, dayAdd } = await import("../../src/lib/fees/report-rules.ts");

const same = (name, got, want) => check(`[P13 csv] ${name}`, got === want, JSON.stringify(got));

// --- Formula injection ---------------------------------------------------------------------------------
same("=HYPERLINK(…) → apostrophe in front (text, never a formula)", csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
same("+ start → apostrophe", csvCell("+33 1 2"), "'+33 1 2");
same("- start → apostrophe", csvCell("-2+3"), "'-2+3");
same("@ start → apostrophe", csvCell("@SUM(A1)"), "'@SUM(A1)");
same("tab start → apostrophe", csvCell("\t=1"), "'\t=1");
same("carriage return start → apostrophe, quoted", csvCell("\r=1"), "\"'\r=1\"");
same("full-width ＝ start → apostrophe", csvCell("＝1+1"), "'＝1+1");
same("= inside a value: unchanged", csvCell("a=b"), "a=b");
same("plain name: unchanged", csvCell("Benali Yassine"), "Benali Yassine");
same("Arabic name: unchanged", csvCell("بنعلي ياسين"), "بنعلي ياسين");

// --- Quoting ---------------------------------------------------------------------------------------------
same("; → quoted", csvCell("a;b"), '"a;b"');
same('" → doubled and quoted', csvCell('dit "oui"'), '"dit ""oui"""');
same("line break → quoted", csvCell("a\nb"), '"a\nb"');
same("null / undefined → empty", csvCell(null) + csvCell(undefined), "");
same("number → text", csvCell(12), "12");

// --- File ------------------------------------------------------------------------------------------------
const file = toCsv(["Élève", "Montant"], [["=evil", "1250,50"], ["Salma", "0,00"]]);
same("file: BOM, ';', CRLF, last line ended", file, "﻿Élève;Montant\r\n'=evil;1250,50\r\nSalma;0,00\r\n");

// --- Phones ----------------------------------------------------------------------------------------------
same("phone +212612345678 → 06 12 34 56 78", csvPhone("+212612345678"), "06 12 34 56 78");
same("phone +212712345678 → 07 12 34 56 78", csvPhone("+212712345678"), "07 12 34 56 78");
same("landline +212522000000 → 05 22 00 00 00", csvPhone("+212522000000"), "05 22 00 00 00");
check("[P13 csv] the phone cell needs no apostrophe and no quotes (Excel keeps it as text with its 0)",
  csvCell(csvPhone("+212612345678")) === "06 12 34 56 78" && !/^'/.test(csvCell(csvPhone("+212612345678"))));
same("empty phone → empty", csvPhone(null), "");

// --- Amounts ---------------------------------------------------------------------------------------------
same("125050 centimes → 1250,50", csvAmount(125050), "1250,50");
same("5 centimes → 0,05", csvAmount(5), "0,05");
same("100000000 centimes → 1000000,00 (no thousands separator)", csvAmount(100000000), "1000000,00");

// --- Journal dates ---------------------------------------------------------------------------------------
const range = (name, from, to, want) => {
  const got = journalRange(from, to, "2026-11-01");
  check(`[P13 journal range] ${name}`, got.from === want[0] && got.to === want[1], JSON.stringify(got));
};
range("absent → this month (1st → today)", undefined, undefined, ["2026-11-01", "2026-11-01"]);
range("a valid range is kept", "2026-09-01", "2026-10-15", ["2026-09-01", "2026-10-15"]);
range("from after to → this month", "2026-10-15", "2026-09-01", ["2026-11-01", "2026-11-01"]);
range("31 February → this month", "2026-02-31", "2026-03-01", ["2026-11-01", "2026-11-01"]);
range("366 days → kept", "2025-11-01", dayAdd("2025-11-01", 366), ["2025-11-01", "2026-11-02"]);
range("367 days → this month", "2025-11-01", dayAdd("2025-11-01", 367), ["2026-11-01", "2026-11-01"]);
range("not a date → this month", "x", "2026-10-01", ["2026-11-01", "2026-11-01"]);

// --- Unpaid month filter ---------------------------------------------------------------------------------
const billed = ["2026-09-01", "2026-10-01"];
const filter = (name, param, want) => {
  const got = unpaidMonthFilter(param, billed);
  check(`[P13 unpaid filter] ${name}`, got.month === want.month && got.registration === want.registration, JSON.stringify(got));
};
filter("absent → every month", undefined, { month: null, registration: false });
filter("registration", "registration", { month: null, registration: true });
filter("a billed month → its 1st", "2026-10", { month: "2026-10-01", registration: false });
filter("a month not billed → every month", "2026-12", { month: null, registration: false });
filter("garbage → every month", "2026-10-01'--", { month: null, registration: false });

// --- Totals ----------------------------------------------------------------------------------------------
const totals = journalTotals([
  { amount: 100000, method: "cash", cancelled: null },
  { amount: 50000, method: "cash", cancelled: null },
  { amount: 20000, method: "cheque", cancelled: { date: "2026-11-01" } },
  { amount: 30000, method: "cheque", cancelled: null },
  { amount: 7000, method: "transfer", cancelled: null },
]);
check("[P13 journal totals] per method, cancelled receipts left out",
  totals.cash.amount === 150000 && totals.cash.count === 2 && totals.cheque.amount === 30000 && totals.cheque.count === 1
    && totals.transfer.amount === 7000 && totals.total.amount === 187000 && totals.total.count === 4, JSON.stringify(totals));
