// Columns of the student import file (Excel or CSV). Shared by the server
// (reading a file) and the browser (writing the template).
//
// A header is recognised in any UI language, ignoring case, accents, spaces
// and punctuation: "Date de naissance (jj/mm/aaaa)", "date naissance" and
// "تاريخ الازدياد" all mean `birthDate`. Column order does not matter.

export const IMPORT_COLUMNS = [
  "lastName",
  "firstName",
  "lastNameAr",
  "firstNameAr",
  "birthDate",
  "gender",
  "codeMassar",
  "className",
  "parentLastName",
  "parentFirstName",
  "parentPhone",
  "parentRelation",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const REQUIRED_COLUMNS: readonly ImportColumn[] = ["lastName", "firstName", "birthDate", "gender", "className"];
export const PARENT_COLUMNS: readonly ImportColumn[] = ["parentLastName", "parentFirstName", "parentPhone", "parentRelation"];

export const MAX_IMPORT_ROWS = 2000;
/** Under Vercel's 4.5 MB request limit; 2000 rows are about 300 KB. */
export const MAX_IMPORT_BYTES = 3 * 1024 * 1024;

type Locale = "ar" | "fr" | "en";

/** The template's header row, per UI language. Every one of them is also recognised when reading. */
export const TEMPLATE_HEADERS: Record<Locale, Record<ImportColumn, string>> = {
  fr: {
    lastName: "Nom (latin)",
    firstName: "Prénom (latin)",
    lastNameAr: "Nom (arabe)",
    firstNameAr: "Prénom (arabe)",
    birthDate: "Date de naissance (jj/mm/aaaa)",
    gender: "Sexe (G/F)",
    codeMassar: "Code Massar",
    className: "Classe",
    parentLastName: "Nom du parent",
    parentFirstName: "Prénom du parent",
    parentPhone: "Téléphone du parent",
    parentRelation: "Lien (Père/Mère/Tuteur)",
  },
  ar: {
    lastName: "النسب (بالحروف اللاتينية)",
    firstName: "الاسم (بالحروف اللاتينية)",
    lastNameAr: "النسب (بالعربية)",
    firstNameAr: "الاسم (بالعربية)",
    birthDate: "تاريخ الازدياد (يوم/شهر/سنة)",
    gender: "الجنس (ذكر/أنثى)",
    codeMassar: "رمز مسار",
    className: "القسم",
    parentLastName: "نسب ولي الأمر",
    parentFirstName: "اسم ولي الأمر",
    parentPhone: "هاتف ولي الأمر",
    parentRelation: "صلة القرابة (أب/أم/ولي)",
  },
  en: {
    lastName: "Last name (Latin)",
    firstName: "First name (Latin)",
    lastNameAr: "Last name (Arabic)",
    firstNameAr: "First name (Arabic)",
    birthDate: "Birth date (dd/mm/yyyy)",
    gender: "Gender (M/F)",
    codeMassar: "Massar code",
    className: "Class",
    parentLastName: "Parent last name",
    parentFirstName: "Parent first name",
    parentPhone: "Parent phone",
    parentRelation: "Relationship (Father/Mother/Guardian)",
  },
};

/** Other common spellings (Massar exports, short forms). */
const EXTRA_ALIASES: Record<ImportColumn, string[]> = {
  lastName: ["nom", "lastname", "nomlatin", "nomdefamille", "name"],
  firstName: ["prenom", "firstname", "prenomlatin"],
  lastNameAr: ["nomenarabe", "النسب", "النسببالعربيه"],
  firstNameAr: ["prenomenarabe", "الاسم", "الاسمبالعربيه", "الإسم"],
  birthDate: ["datedenaissance", "datenaissance", "naissance", "birthdate", "dateofbirth", "تاريخالازدياد", "تاريخالميلاد"],
  gender: ["sexe", "genre", "gender", "sex", "الجنس", "النوع"],
  codeMassar: ["massar", "codemassar", "code", "massarcode", "رمزمسار", "رقممسار"],
  className: ["classe", "class", "القسم", "الفصل"],
  parentLastName: ["nomparent", "nomtuteur", "parentname"],
  parentFirstName: ["prenomparent", "prenomtuteur"],
  parentPhone: ["telephone", "telephoneparent", "tel", "telparent", "phone", "gsm", "الهاتف", "هاتفولي"],
  parentRelation: ["lien", "relation", "relationship", "liendeparente", "صلةالقرابه", "القرابه"],
};

/** Lowercase, no accents or Arabic diacritics, one alef and one ha, only letters and digits. */
export function normalizeHeader(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

const ALIASES: Map<string, ImportColumn> = (() => {
  const map = new Map<string, ImportColumn>();
  for (const column of IMPORT_COLUMNS) {
    // Exact template headers first, then the extras: never overwrite an earlier match.
    for (const headers of Object.values(TEMPLATE_HEADERS)) {
      const key = normalizeHeader(headers[column]);
      if (!map.has(key)) map.set(key, column);
    }
  }
  for (const column of IMPORT_COLUMNS) {
    for (const alias of EXTRA_ALIASES[column]) {
      const key = normalizeHeader(alias);
      if (!map.has(key)) map.set(key, column);
    }
  }
  return map;
})();

/** The column a header means, or null. "Nom (arabe)" is tried whole first, then as "Nom". */
export function columnOf(header: string): ImportColumn | null {
  const whole = ALIASES.get(normalizeHeader(header));
  if (whole) return whole;
  const base = header.split("(")[0];
  return base !== header ? (ALIASES.get(normalizeHeader(base)) ?? null) : null;
}
