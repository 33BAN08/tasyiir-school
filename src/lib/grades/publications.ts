import "server-only";

import { createClient } from "@/lib/supabase/server";

// Published report cards (Phase 11 step 7), read with the caller's session:
// RLS gives staff (grades.view / manage) the school's, a parent only their own
// children's. Cards are snapshots: nothing here is recomputed.

export type Publication = {
  id: string;
  showRank: boolean;
  firstPublishedAt: string;
  publishedAt: string;
  publishedBy: string | null;
};

/** The publication of a class for a semester (`periodId` null = the year), if any. */
export async function getPublication(classId: string, periodId: string | null): Promise<Publication | null> {
  const supabase = await createClient();
  let query = supabase
    .from("grade_publications")
    .select("id, show_rank, first_published_at, published_at, publisher:profiles(full_name)")
    .eq("class_id", classId);
  query = periodId ? query.eq("period_id", periodId) : query.is("period_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("getPublication failed");
  return data
    ? {
        id: data.id,
        showRank: data.show_rank,
        firstPublishedAt: data.first_published_at,
        publishedAt: data.published_at,
        publishedBy: data.publisher?.full_name ?? null,
      }
    : null;
}

export type CardMark = { kind: "control" | "activities"; number: number; score: number | null; absent: boolean };
export type CardSubject = {
  subjectId: string;
  name: string;
  color: string;
  coefficient: number | null;
  average: number | null;
  rank: number | null;
  classAverage: number | null;
  classMin: number | null;
  classMax: number | null;
  marks: CardMark[];
  /** Year card: each semester's average. */
  periods: { number: number; average: number | null }[];
};
export type ReportCard = {
  id: string;
  publicationId: string;
  studentId: string;
  /** null = the year. */
  periodNumber: number | null;
  /** Number of semesters of the year (names: semestre / trimestre / période). */
  periodCount: number;
  yearLabel: string;
  publishedAt: string;
  scale: number;
  average: number | null;
  rank: number | null;
  ranked: number | null;
  missing: number;
  classAverage: number | null;
  classMin: number | null;
  classMax: number | null;
  subjects: CardSubject[];
  /** Year card: each semester's general average + rank. */
  periods: { number: number; average: number | null; rank: number | null }[];
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type RawSubject = {
  subject_id: string; name: string; color: string; coefficient: unknown; average: unknown; rank: number | null;
  class_average: unknown; class_min: unknown; class_max: unknown;
  marks?: { kind: "control" | "activities"; number: number; score: unknown; absent: boolean }[];
  periods?: { number: number; average: unknown }[];
};

const CARD_SELECT =
  "id, publication_id, student_id, scale, average, rank, ranked, missing, class_average, class_min, class_max, subjects, periods, "
  + "publication:grade_publications(published_at, academic_year_id, period:grading_periods(number))";

type YearInfo = { label: string; periods: number };

/** Year labels and number of semesters (no direct key from a publication to its year). */
async function yearInfo(yearIds: string[]): Promise<Map<string, YearInfo>> {
  if (yearIds.length === 0) return new Map();
  const supabase = await createClient();
  const [years, periods] = await Promise.all([
    supabase.from("academic_years").select("id, label").in("id", yearIds),
    supabase.from("grading_periods").select("academic_year_id").in("academic_year_id", yearIds),
  ]);
  const info = new Map<string, YearInfo>((years.data ?? []).map((y) => [y.id, { label: y.label, periods: 0 }]));
  for (const p of periods.data ?? []) {
    const y = info.get(p.academic_year_id);
    if (y) y.periods += 1;
  }
  return info;
}

type Row = {
  id: string; publication_id: string; student_id: string; scale: number; average: unknown; rank: number | null;
  ranked: number | null; missing: number; class_average: unknown; class_min: unknown; class_max: unknown;
  subjects: unknown; periods: unknown;
  publication: { published_at: string; academic_year_id: string; period: { number: number } | null } | null;
};

function toCard(r: Row, years: Map<string, YearInfo>): ReportCard {
  const year = years.get(r.publication?.academic_year_id ?? "");
  const subjects = (r.subjects as RawSubject[]).map((s) => ({
    subjectId: s.subject_id,
    name: s.name,
    color: s.color,
    coefficient: num(s.coefficient),
    average: num(s.average),
    rank: s.rank ?? null,
    classAverage: num(s.class_average),
    classMin: num(s.class_min),
    classMax: num(s.class_max),
    marks: (s.marks ?? []).map((m) => ({ kind: m.kind, number: m.number, score: num(m.score), absent: m.absent })),
    periods: (s.periods ?? []).map((p) => ({ number: p.number, average: num(p.average) })),
  }));
  return {
    id: r.id,
    publicationId: r.publication_id,
    studentId: r.student_id,
    periodNumber: r.publication?.period?.number ?? null,
    periodCount: year?.periods || 2,
    yearLabel: year?.label ?? "",
    publishedAt: r.publication?.published_at ?? "",
    scale: r.scale,
    average: num(r.average),
    rank: r.rank,
    ranked: r.ranked,
    missing: r.missing,
    classAverage: num(r.class_average),
    classMin: num(r.class_min),
    classMax: num(r.class_max),
    subjects,
    periods: (r.periods as { number: number; average: unknown; rank: number | null }[]).map((p) => ({
      number: p.number, average: num(p.average), rank: p.rank ?? null,
    })),
  };
}

/** A child's published cards, newest year first, then the year card before its semesters' (last semester first). */
export async function listChildCards(studentId: string): Promise<ReportCard[]> {
  const { data, error } = await (await createClient()).from("report_cards").select(CARD_SELECT).eq("student_id", studentId);
  if (error) throw new Error("listChildCards failed");
  const rows = data as unknown as Row[];
  const years = await yearInfo([...new Set(rows.map((r) => r.publication?.academic_year_id).filter((x): x is string => !!x))]);
  return rows
    .map((r) => toCard(r, years))
    .sort((a, b) => b.yearLabel.localeCompare(a.yearLabel) || (b.periodNumber ?? 99) - (a.periodNumber ?? 99));
}

/** One card of a child, by publication. */
export async function getChildCard(studentId: string, publicationId: string): Promise<ReportCard | null> {
  const { data, error } = await (await createClient())
    .from("report_cards")
    .select(CARD_SELECT)
    .eq("student_id", studentId)
    .eq("publication_id", publicationId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as Row;
  return toCard(row, await yearInfo(row.publication ? [row.publication.academic_year_id] : []));
}
