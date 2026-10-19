import "server-only";

import { compareClassNames } from "@/lib/structure/class-names";
import { getCurrentYear } from "@/lib/students/students";
import { createClient } from "@/lib/supabase/server";
import { announcementIdSchema, type AnnouncementAudience, type AnnouncementScope } from "@/lib/validations/announcements";

// Announcement reads, through the signed-in user's own session: RLS returns
// only what they wrote, what they manage, or what is addressed to them.

export type Announcement = {
  id: string;
  scope: AnnouncementScope;
  audience: AnnouncementAudience;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  createdBy: string;
  /** Names of the targeted levels / classes (empty for the whole school). */
  levels: string[];
  classes: string[];
};

/** The newest announcements shown on the list page. */
export const ANNOUNCEMENT_LIMIT = 100;

const COLUMNS =
  "id, scope, audience, title, body, created_at, updated_at, created_by, announcement_targets(level:levels(name), class:classes(name))";

type Row = {
  id: string;
  scope: string;
  audience: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string | null;
  created_by: string;
  announcement_targets: { level: { name: string } | null; class: { name: string } | null }[];
};

function toAnnouncement(row: Row): Announcement {
  return {
    id: row.id,
    scope: row.scope as AnnouncementScope,
    audience: row.audience as AnnouncementAudience,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    levels: row.announcement_targets.flatMap((t) => (t.level ? [t.level.name] : [])).sort((a, b) => a.localeCompare(b)),
    classes: row.announcement_targets.flatMap((t) => (t.class ? [t.class.name] : [])).sort(compareClassNames),
  };
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(ANNOUNCEMENT_LIMIT);
  if (error) throw new Error("listAnnouncements failed");
  return data.map(toAnnouncement);
}

/** One announcement, or null when it does not exist or is not for this user. */
export async function getAnnouncement(id: string): Promise<Announcement | null> {
  if (!announcementIdSchema.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("announcements").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error("getAnnouncement failed");
  return data ? toAnnouncement(data) : null;
}

export type PostingOptions = {
  /** announcements.manage: any scope and audience. Otherwise a teacher: their own classes, to parents. */
  canManage: boolean;
  /** Null: the school has no current year, so levels and classes cannot be targeted. */
  yearLabel: string | null;
  levels: { id: string; name: string }[];
  classes: { id: string; name: string; levelId: string; levelName: string }[];
};

/** What the signed-in user may address an announcement to (current year). */
export async function getPostingOptions(user: { id: string; schoolId: string }, canManage: boolean): Promise<PostingOptions> {
  const year = await getCurrentYear(user.schoolId);
  if (!year) return { canManage, yearLabel: null, levels: [], classes: [] };

  const supabase = await createClient();
  type ClassRow = { id: string; name: string; level_id: string; level: { name: string; sort_order: number } | null };
  const select = "id, name, level_id, level:levels(name, sort_order)";

  let rows: ClassRow[];
  if (canManage) {
    const { data, error } = await supabase
      .from("classes")
      .select(select)
      .eq("school_id", user.schoolId)
      .eq("academic_year_id", year.id);
    if (error) throw new Error("getPostingOptions failed");
    rows = data;
  } else {
    // A teacher: the classes they have a lesson with this year (RLS shows only their own lessons).
    const { data, error } = await supabase
      .from("lessons")
      .select(`class:classes(${select})`)
      .eq("school_id", user.schoolId)
      .eq("academic_year_id", year.id)
      .eq("teacher_id", user.id);
    if (error) throw new Error("getPostingOptions failed");
    const byId = new Map<string, ClassRow>();
    for (const lesson of data) if (lesson.class) byId.set(lesson.class.id, lesson.class);
    rows = [...byId.values()];
  }

  const order = (r: ClassRow) => r.level?.sort_order ?? 0;
  const classes = rows
    .sort((a, b) => order(a) - order(b) || compareClassNames(a.name, b.name))
    .map((r) => ({ id: r.id, name: r.name, levelId: r.level_id, levelName: r.level?.name ?? "" }));

  let levels: PostingOptions["levels"] = [];
  if (canManage) {
    const { data, error } = await supabase
      .from("levels")
      .select("id, name, sort_order")
      .eq("school_id", user.schoolId)
      .order("sort_order")
      .order("name");
    if (error) throw new Error("getPostingOptions failed");
    levels = data.map((l) => ({ id: l.id, name: l.name }));
  }
  return { canManage, yearLabel: year.label, levels, classes };
}
