import "server-only";

import { randomUUID } from "node:crypto";

import { listClasses } from "@/lib/structure/classes";
import { createClient } from "@/lib/supabase/server";
import { studentSchema } from "@/lib/validations/students";

import { cellText, parseBirthDate, parseGender, parsePhone, parseRelation } from "./cells";
import { normalizeHeader, PARENT_COLUMNS, type ImportColumn } from "./columns";
import type { RawRow } from "./read";
import type { ImportIssue, ImportIssueKey, ImportPreview, ImportRowPreview, ImportWarning } from "./types";

// Checks every row of an import file against the school (classes of the
// current year, Massar codes, parents' phones, students with the same name and
// birth date), through RLS with the caller's session. Returns the preview AND
// the rows ready for public.import_students(), with their file line (so rows
// the user unticked can be left out).

/** One row as public.import_students() takes it. */
export type ImportPayloadRow = {
  id: string;
  last_name: string;
  first_name: string;
  last_name_ar: string | null;
  first_name_ar: string | null;
  birth_date: string;
  gender: string;
  code_massar: string | null;
  class_id: string;
  guardian_last_name: string | null;
  guardian_first_name: string | null;
  guardian_phone: string | null;
  guardian_relation: string | null;
};

const LOOKUP_CHUNK = 200; // values per "in (…)" filter: keeps request URLs short

/** zod path (studentSchema) → file column. */
const COLUMN_OF_FIELD: Record<string, ImportColumn> = {
  lastName: "lastName",
  firstName: "firstName",
  lastNameAr: "lastNameAr",
  firstNameAr: "firstNameAr",
  birthDate: "birthDate",
  gender: "gender",
  codeMassar: "codeMassar",
};

const classKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");
const personKey = (last: string, first: string) => `${last} ${first}`.toLowerCase().replace(/\s+/g, " ").trim();
/** Same student? Latin names ignoring case, accents, spaces and dashes, + birth date. */
const studentKey = (last: string, first: string, birthDate: string) =>
  `${normalizeHeader(last)}|${normalizeHeader(first)}|${birthDate}`;

async function chunkedLookup<T>(
  values: string[],
  query: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const found: T[] = [];
  for (let i = 0; i < values.length; i += LOOKUP_CHUNK) {
    const { data, error } = await query(values.slice(i, i + LOOKUP_CHUNK));
    if (error) throw new Error("import lookup failed");
    found.push(...(data ?? []));
  }
  return found;
}

export async function validateImport(
  schoolId: string,
  yearId: string,
  fileName: string,
  read: {
    rows: RawRow[];
    columns: Set<ImportColumn>;
    ignoredHeaders: string[];
  },
): Promise<{
  preview: ImportPreview;
  payload: { line: number; row: ImportPayloadRow }[];
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // --- What the school already has -----------------------------------------------
  const classes = new Map((await listClasses(schoolId, yearId)).map((c) => [classKey(c.name), c]));
  const text = (row: RawRow, column: ImportColumn) => cellText(row.cells[column]);
  const massarCodes = [
    ...new Set(read.rows.map((r) => text(r, "codeMassar").replace(/\s+/g, "").toUpperCase()).filter(Boolean)),
  ];
  const birthDates = [
    ...new Set(read.rows.map((r) => parseBirthDate(r.cells.birthDate ?? null)).filter((d): d is string => Boolean(d))),
  ];
  const phones = [
    ...new Set(read.rows.map((r) => parsePhone(r.cells.parentPhone)).filter((p): p is string => Boolean(p))),
  ];

  const existingMassar = new Set(
    (
      await chunkedLookup(massarCodes, (chunk) =>
        supabase.from("students").select("code_massar").eq("school_id", schoolId).in("code_massar", chunk),
      )
    ).map((s) => s.code_massar),
  );
  const existingParents = new Map(
    (
      await chunkedLookup(phones, (chunk) =>
        supabase.from("guardians").select("phone, last_name, first_name").eq("school_id", schoolId).in("phone", chunk),
      )
    ).map((g) => [g.phone, `${g.last_name} ${g.first_name}`]),
  );

  // Students born on those days: possible duplicates (warning only).
  const sameNameAndBirth = new Map<string, { name: string; codeMassar: string | null }>();
  for (const s of await chunkedLookup(birthDates, (chunk) =>
    supabase
      .from("students")
      .select("last_name, first_name, birth_date, code_massar")
      .eq("school_id", schoolId)
      .in("birth_date", chunk),
  )) {
    sameNameAndBirth.set(studentKey(s.last_name, s.first_name, s.birth_date), {
      name: `${s.last_name} ${s.first_name}`,
      codeMassar: s.code_massar,
    });
  }

  // --- Row by row ---------------------------------------------------------------
  const firstMassarLine = new Map<string, number>();
  const firstPhone = new Map<string, { line: number; name: string }>();
  const firstStudentLine = new Map<string, number>();
  const rows: ImportRowPreview[] = [];
  const payload: { line: number; row: ImportPayloadRow }[] = [];

  for (const raw of read.rows) {
    const issues: ImportIssue[] = [];
    const add = (column: ImportColumn, key: ImportIssueKey, line?: number) => {
      // No `line: undefined`: it would reach the browser as "$undefined".
      if (!issues.some((i) => i.column === column && i.key === key))
        issues.push(line ? { column, key, line } : { column, key });
    };

    const birthDate = parseBirthDate(raw.cells.birthDate ?? null);
    const gender = parseGender(raw.cells.gender ?? null);
    const className = text(raw, "className");
    const schoolClass = className ? classes.get(classKey(className)) : undefined;

    const parsed = studentSchema.safeParse({
      lastName: text(raw, "lastName"),
      firstName: text(raw, "firstName"),
      lastNameAr: text(raw, "lastNameAr"),
      firstNameAr: text(raw, "firstNameAr"),
      birthDate: birthDate ?? "",
      gender: gender ?? "",
      codeMassar: text(raw, "codeMassar"),
      classId: schoolClass?.id ?? "",
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const column = COLUMN_OF_FIELD[String(issue.path[0])];
        // The date range is checked below, only on a readable date.
        if (column && issue.message !== "birthDateRange") add(column, issue.message as ImportIssueKey);
      }
    }
    // Checks studentSchema only runs once the fields are valid: always report them.
    if (Boolean(text(raw, "lastNameAr")) !== Boolean(text(raw, "firstNameAr"))) {
      add(text(raw, "lastNameAr") ? "firstNameAr" : "lastNameAr", "arabicNamesBoth");
    }
    if (birthDate && (birthDate <= "1980-01-01" || birthDate > today)) add("birthDate", "birthDateRange");
    if (!className) add("className", "classRequired");
    else if (!schoolClass) add("className", "unknownClass");

    const codeMassar = text(raw, "codeMassar").replace(/\s+/g, "").toUpperCase();
    const exists = Boolean(codeMassar) && existingMassar.has(codeMassar);
    if (codeMassar && !exists) {
      const first = firstMassarLine.get(codeMassar);
      if (first !== undefined) add("codeMassar", "massarDuplicateInFile", first);
      else firstMassarLine.set(codeMassar, raw.line);
    }

    // Parent: optional, but complete when any of its cells is filled.
    let parent: ImportRowPreview["parent"] = null;
    if (PARENT_COLUMNS.some((c) => text(raw, c))) {
      const lastName = text(raw, "parentLastName");
      const firstName = text(raw, "parentFirstName");
      const phone = parsePhone(raw.cells.parentPhone ?? null);
      const relation = parseRelation(raw.cells.parentRelation ?? null);
      if (!lastName) add("parentLastName", "parentNameRequired");
      else if (lastName.length > 60) add("parentLastName", "tooLong");
      if (!firstName) add("parentFirstName", "parentNameRequired");
      else if (firstName.length > 60) add("parentFirstName", "tooLong");
      if (!phone) add("parentPhone", "invalidPhone");
      if (!relation) add("parentRelation", "relationRequired");

      const existingName = phone ? (existingParents.get(phone) ?? null) : null;
      // Same phone twice in the file (siblings): fine with the same name, an error otherwise.
      if (phone && !existingName && lastName && firstName) {
        const seen = firstPhone.get(phone);
        if (!seen)
          firstPhone.set(phone, {
            line: raw.line,
            name: personKey(lastName, firstName),
          });
        else if (seen.name !== personKey(lastName, firstName)) add("parentPhone", "phoneNameConflict", seen.line);
      }
      parent = {
        lastName,
        firstName,
        phone: phone ?? text(raw, "parentPhone"),
        relation,
        existingName,
      };
    }

    // Possible duplicates: a warning, never an error.
    const warnings: ImportWarning[] = [];
    if (!exists && birthDate && text(raw, "lastName") && text(raw, "firstName")) {
      const key = studentKey(text(raw, "lastName"), text(raw, "firstName"), birthDate);
      const inSchool = sameNameAndBirth.get(key);
      if (inSchool) warnings.push({ key: "possibleDuplicate", ...inSchool });
      const first = firstStudentLine.get(key);
      if (first !== undefined) warnings.push({ key: "possibleDuplicateInFile", line: first });
      else firstStudentLine.set(key, raw.line);
    }

    // A Massar code the school already has: skipped, whatever else the row says.
    const status = exists ? "exists" : issues.length > 0 ? "error" : "ready";
    rows.push({
      line: raw.line,
      status,
      lastName: text(raw, "lastName"),
      firstName: text(raw, "firstName"),
      lastNameAr: text(raw, "lastNameAr"),
      firstNameAr: text(raw, "firstNameAr"),
      birthDate,
      gender,
      codeMassar,
      className,
      parent,
      issues: exists ? [] : issues,
      warnings,
    });

    if (status === "ready" && parsed.success) {
      const v = parsed.data;
      payload.push({
        line: raw.line,
        row: {
          id: randomUUID(),
          last_name: v.lastName,
          first_name: v.firstName,
          last_name_ar: v.lastNameAr || null,
          first_name_ar: v.firstNameAr || null,
          birth_date: v.birthDate,
          gender: v.gender,
          code_massar: v.codeMassar || null,
          class_id: v.classId,
          guardian_last_name: parent?.lastName ?? null,
          guardian_first_name: parent?.firstName ?? null,
          guardian_phone: parent ? parent.phone : null,
          guardian_relation: parent?.relation ?? null,
        },
      });
    }
  }

  const counts = { ready: 0, exists: 0, error: 0 };
  for (const row of rows) counts[row.status]++;
  const duplicates = rows.filter((r) => r.status === "ready" && r.warnings.length > 0).length;
  return {
    preview: {
      fileName,
      rows,
      counts,
      duplicates,
      ignoredHeaders: read.ignoredHeaders,
      hasArabic: read.columns.has("lastNameAr") || read.columns.has("firstNameAr"),
      hasParents: PARENT_COLUMNS.some((c) => read.columns.has(c)),
      placesLeft: null,
    },
    payload,
  };
}
