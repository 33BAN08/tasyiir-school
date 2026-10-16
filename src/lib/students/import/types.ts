// Results of the student import preview, sent to the browser.
// Error and info texts are `students.import.*` message keys.

import type { Relation } from "@/lib/validations/parents";
import type { Gender } from "@/lib/validations/students";

import type { ImportColumn } from "./columns";

export type ImportIssueKey =
  | "nameRequired"
  | "tooLong"
  | "latinOnly"
  | "arabicOnly"
  | "arabicNamesBoth"
  | "invalidDate"
  | "birthDateRange"
  | "genderRequired"
  | "invalidMassar"
  | "massarDuplicateInFile"
  | "classRequired"
  | "unknownClass"
  | "parentNameRequired"
  | "invalidPhone"
  | "relationRequired"
  | "phoneNameConflict";

/** `line`: the other line involved (duplicate Massar code, same phone with another name). */
export type ImportIssue = { column: ImportColumn; key: ImportIssueKey; line?: number };

/**
 * Non-blocking: same Latin name + birth date as a student of the school
 * (`name` = that student) or as another line of the file (`line`).
 * The row stays "ready"; the user may untick it before importing.
 */
export type ImportWarning =
  | { key: "possibleDuplicate"; name: string; codeMassar: string | null }
  | { key: "possibleDuplicateInFile"; line: number };

export type ImportRowStatus = "ready" | "exists" | "error";

export type ImportRowPreview = {
  /** Line in the file (the header is line 1 when it is the first line). */
  line: number;
  status: ImportRowStatus;
  lastName: string;
  firstName: string;
  lastNameAr: string;
  firstNameAr: string;
  /** "yyyy-mm-dd" when readable. */
  birthDate: string | null;
  gender: Gender | null;
  codeMassar: string;
  className: string;
  parent: {
    lastName: string;
    firstName: string;
    /** "+2126…" when valid, otherwise what the file says. */
    phone: string;
    relation: Relation | null;
    /** The school already has a parent with this phone: they are linked, named as in the school. */
    existingName: string | null;
  } | null;
  issues: ImportIssue[];
  warnings: ImportWarning[];
};

export type ImportFileErrorKey =
  | "noFile"
  | "unsupportedType"
  | "oldExcel"
  | "tooBig"
  | "unreadable"
  | "empty"
  | "tooManyRows"
  | "missingColumns"
  | "noCurrentYear"
  | "parentsForbidden";

export type ImportFileError = { key: ImportFileErrorKey; columns?: ImportColumn[] };

export type ImportPreview = {
  fileName: string;
  rows: ImportRowPreview[];
  counts: Record<ImportRowStatus, number>;
  /** Ready rows with a possible-duplicate warning. */
  duplicates: number;
  /** Headers that matched no column (ignored). */
  ignoredHeaders: string[];
  /** Which optional columns the file has (the preview only shows those). */
  hasArabic: boolean;
  hasParents: boolean;
};

export type PreviewResult = { ok: true; data: ImportPreview } | { ok: false; error: string; file?: ImportFileError };
/** `skipped`: Massar code already in the school; `excluded`: rows the user unticked. */
export type CommitResult =
  | { ok: true; data: { created: number; skipped: number; excluded: number } }
  | { ok: false; error: string; file?: ImportFileError };
