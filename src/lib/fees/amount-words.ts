// An amount in words for the receipt (Phase 13 step 5b): French, and formal
// Arabic ending with "فقط لا غير" (user, 2026-11-01). Plain module, no
// dependency: the tables of rules-amount-words.mjs check it. Amounts up to
// 1 000 000 DH (payments_amount_check).

// --- French (traditional spelling: hyphens below 100, "et" for 21…71) -------

const FR_UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const FR_TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 0–99; `final`: nothing follows (quatre-vingts takes its s). */
function frBelow100(n: number, final: boolean): string {
  if (n <= 16) return FR_UNITS[n];
  if (n < 20) return `dix-${FR_UNITS[n - 10]}`;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7 || ten === 9) {
    const base = ten === 7 ? "soixante" : "quatre-vingt";
    const rest = n - (ten === 7 ? 60 : 80);
    return ten === 7 && rest === 11 ? "soixante et onze" : `${base}-${frBelow100(rest, true)}`;
  }
  if (ten === 8) return unit === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : `quatre-vingt-${FR_UNITS[unit]}`;
  if (unit === 0) return FR_TENS[ten];
  if (unit === 1) return `${FR_TENS[ten]} et un`;
  return `${FR_TENS[ten]}-${FR_UNITS[unit]}`;
}

/** 0–999; `final`: nothing follows (cents / quatre-vingts take their s). */
function frBelow1000(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds === 1) parts.push("cent");
  else if (hundreds > 1) parts.push(`${FR_UNITS[hundreds]} ${rest === 0 && final ? "cents" : "cent"}`);
  if (rest > 0 || hundreds === 0) parts.push(frBelow100(rest, final));
  return parts.join(" ");
}

export function frenchNumber(n: number): string {
  if (n === 0) return "zéro";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  // "millions" is a noun: the number before it keeps its s (deux cents millions).
  if (millions) parts.push(millions === 1 ? "un million" : `${frBelow1000(millions, true)} millions`);
  // "mille" never takes an s, nor does the cent / vingt before it (deux cent mille).
  if (thousands) parts.push(thousands === 1 ? "mille" : `${frBelow1000(thousands, false)} mille`);
  if (rest) parts.push(frBelow1000(rest, true));
  return parts.join(" ");
}

/** 125050 centimes → "mille deux cent cinquante dirhams et cinquante centimes". */
export function frenchAmount(centimes: number): string {
  const whole = Math.floor(centimes / 100);
  const cents = centimes % 100;
  const parts: string[] = [];
  if (whole > 0) {
    const of = whole % 1_000_000 === 0 ? " de" : "";
    parts.push(`${frenchNumber(whole)}${of} ${whole === 1 ? "dirham" : "dirhams"}`);
  }
  if (cents > 0) parts.push(`${frenchNumber(cents)} ${cents === 1 ? "centime" : "centimes"}`);
  return parts.join(" et ") || "zéro dirham";
}

// --- Arabic (formal, the counted noun agrees with the last part) ----------

const AR_UNITS = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
const AR_TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function arBelow100(n: number): string {
  if (n <= 10) return AR_UNITS[n];
  if (n === 11) return "أحد عشر";
  if (n === 12) return "اثنا عشر";
  if (n < 20) return `${AR_UNITS[n - 10]} عشر`;
  const unit = n % 10;
  const tens = AR_TENS[Math.floor(n / 10)];
  return unit === 0 ? tens : `${AR_UNITS[unit]} و${tens}`;
}

/** 1–999 as a group of words joined with "و"; `construct`: 200 directly before its noun (مائتا). */
function arBelow1000(n: number, construct: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(hundreds === 2 && rest === 0 && construct ? "مائتا" : AR_HUNDREDS[hundreds]);
  if (rest) parts.push(arBelow100(rest));
  return parts.join(" و");
}

type ArNoun = { one: string; two: string; few: string; many: string };
const THOUSAND: ArNoun = { one: "ألف", two: "ألفان", few: "آلاف", many: "ألفا" };
const MILLION: ArNoun = { one: "مليون", two: "مليونان", few: "ملايين", many: "مليونا" };
const DIRHAM: ArNoun = { one: "درهم", two: "درهمان", few: "دراهم", many: "درهما" };
const CENTIME: ArNoun = { one: "سنتيم", two: "سنتيمان", few: "سنتيمات", many: "سنتيما" };

/**
 * A count with its noun: 1 ألف / 2 ألفان / 3–10 ثلاثة آلاف / 11–99 أحد عشر ألفا /
 * a round hundred مائة ألف; above 100 the last two digits decide.
 */
function arCounted(n: number, noun: ArNoun, beforeNoun: boolean): string {
  // Directly before درهم (nothing follows in the number): ألفا درهم, أحد عشر ألف درهم.
  if (n === 1) return noun.one;
  if (n === 2) return beforeNoun ? noun.many : noun.two;
  const last = n % 100;
  const form = last === 0 || last <= 2 ? noun.one : last <= 10 ? noun.few : beforeNoun ? noun.one : noun.many;
  return `${arBelow1000(n, last === 0)} ${form}`;
}

/** The number as words, without its noun (for the dirham part, see arabicAmount). */
function arParts(n: number): string[] {
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(arCounted(millions, MILLION, thousands === 0 && rest === 0));
  if (thousands) parts.push(arCounted(thousands, THOUSAND, rest === 0));
  if (rest) parts.push(arBelow1000(rest, true));
  return parts;
}

/** "ألف ومائتان وخمسون درهما" — the noun after the whole number, in the form its last part asks. */
function arAmountOf(n: number, noun: ArNoun): string {
  if (n === 1) return `${noun.one} واحد`;
  if (n === 2) return noun.two;
  const rest = n % 1000;
  const last = n % 100;
  const form = rest === 0 || last === 0 || last <= 2 ? noun.one : last <= 10 ? noun.few : noun.many;
  return `${arParts(n).join(" و")} ${form}`;
}

/** 125050 centimes → "ألف ومائتان وخمسون درهما وخمسون سنتيما فقط لا غير". */
export function arabicAmount(centimes: number): string {
  const whole = Math.floor(centimes / 100);
  const cents = centimes % 100;
  const parts: string[] = [];
  if (whole > 0) parts.push(arAmountOf(whole, DIRHAM));
  if (cents > 0) parts.push(arAmountOf(cents, CENTIME));
  return `${parts.join(" و") || `صفر ${DIRHAM.one}`} فقط لا غير`;
}

export function amountInWords(centimes: number, language: "fr" | "ar"): string {
  return language === "ar" ? arabicAmount(centimes) : frenchAmount(centimes);
}
