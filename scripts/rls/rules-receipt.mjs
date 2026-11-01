// Unit checks of the receipt (Phase 13 step 5b): src/lib/fees/amount-words.ts
// (French, traditional spelling; formal Arabic ending with "فقط لا غير") and
// src/lib/fees/print-reuse.ts (the FR ⇄ AR switch re-uses a print only for
// the same payment, the same person, less than 10 minutes old).
import { check } from "./checks.mjs";

const { arabicAmount, frenchAmount } = await import("../../src/lib/fees/amount-words.ts");
const { canReusePrint } = await import("../../src/lib/fees/print-reuse.ts");

const NOW = Date.parse("2026-11-01T10:00:00Z");
const print = (minutesAgo, extra = {}) =>
  ({ id: "p", paymentId: "pay", printedBy: "u", printedAt: new Date(NOW - minutesAgo * 60_000).toISOString(), printNo: 1, ...extra });
const reuse = (name, row, want, ctx = {}) =>
  check(`[P13 print reuse] ${name}`, canReusePrint(row, { paymentId: "pay", userId: "u", nowMs: NOW, ...ctx }) === want);
reuse("same payment, same person, 1 minute old → re-used", print(1), true);
reuse("9 min 59 s old → re-used", print(9 + 59 / 60), true);
reuse("exactly 10 minutes old → a new print", print(10), false);
reuse("an hour old → a new print", print(60), false);
reuse("another person's print → a new print", print(1, { printedBy: "other" }), false);
reuse("a print of another payment → a new print", print(1, { paymentId: "other" }), false);
reuse("a print whose author left (printed_by null) → a new print", print(1, { printedBy: null }), false);
reuse("dated 5 minutes in the future → a new print", print(-5), false);

const same = (lang, centimes, want) => {
  const got = lang === "fr" ? frenchAmount(centimes) : arabicAmount(centimes);
  check(`[P13 amount words] ${lang} ${centimes / 100}`, got === want, got);
};

same("fr", 100, "un dirham");
same("fr", 2100, "vingt et un dirhams");
same("fr", 7100, "soixante et onze dirhams");
same("fr", 7700, "soixante-dix-sept dirhams");
same("fr", 8000, "quatre-vingts dirhams");
same("fr", 8100, "quatre-vingt-un dirhams");
same("fr", 9100, "quatre-vingt-onze dirhams");
same("fr", 10000, "cent dirhams");
same("fr", 20000, "deux cents dirhams");
same("fr", 20100, "deux cent un dirhams");
same("fr", 100000, "mille dirhams");
same("fr", 125050, "mille deux cent cinquante dirhams et cinquante centimes");
same("fr", 8000000, "quatre-vingt mille dirhams");
same("fr", 20000000, "deux cent mille dirhams");
same("fr", 9999999, "quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf dirhams et quatre-vingt-dix-neuf centimes");
same("fr", 100000000, "un million de dirhams");
same("fr", 1, "un centime");
same("fr", 50, "cinquante centimes");

same("ar", 100, "درهم واحد فقط لا غير");
same("ar", 200, "درهمان فقط لا غير");
same("ar", 300, "ثلاثة دراهم فقط لا غير");
same("ar", 1000, "عشرة دراهم فقط لا غير");
same("ar", 1100, "أحد عشر درهما فقط لا غير");
same("ar", 1200, "اثنا عشر درهما فقط لا غير");
same("ar", 2100, "واحد وعشرون درهما فقط لا غير");
same("ar", 10000, "مائة درهم فقط لا غير");
same("ar", 20000, "مائتا درهم فقط لا غير");
same("ar", 25000, "مائتان وخمسون درهما فقط لا غير");
same("ar", 100000, "ألف درهم فقط لا غير");
same("ar", 200000, "ألفا درهم فقط لا غير");
same("ar", 300000, "ثلاثة آلاف درهم فقط لا غير");
same("ar", 1100000, "أحد عشر ألف درهم فقط لا غير");
same("ar", 1150000, "أحد عشر ألفا وخمسمائة درهم فقط لا غير");
same("ar", 125050, "ألف ومائتان وخمسون درهما وخمسون سنتيما فقط لا غير");
same("ar", 10000000, "مائة ألف درهم فقط لا غير");
same("ar", 100000000, "مليون درهم فقط لا غير");
same("ar", 50, "خمسون سنتيما فقط لا غير");
same("ar", 1, "سنتيم واحد فقط لا غير");
