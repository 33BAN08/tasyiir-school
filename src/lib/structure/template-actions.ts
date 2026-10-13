"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { templateLevels } from "@/lib/structure/level-template";
import { presentTemplateTracks } from "@/lib/structure/template-names";
import { createClient } from "@/lib/supabase/server";
import { templateSelectionSchema } from "@/lib/validations/structure";

// Applies the Moroccan template (structure.manage): creates the picked levels
// and filières that the school does not have yet (by name, ignoring case; a
// template filière counts in any UI language), so applying it twice — even
// from another language — never duplicates anything. New filière names are
// written in the director's UI language. Writes go through RLS (session).

const localeSchema = z.enum(routing.locales);

export async function applyLevelTemplate(
  selection: unknown,
  locale: unknown,
): Promise<StructureActionResult<{ levels: number; tracks: number }>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const picked = templateSelectionSchema.safeParse(selection);
  const lang = localeSchema.safeParse(locale);
  if (!picked.success || !lang.success) return { ok: false, error: "generic" };

  const wantedLevels = new Set(picked.data.levels);
  const wantedTracks = new Set(picked.data.tracks);
  const template = templateLevels();
  const tTracks = await getTranslations({ locale: lang.data, namespace: "setup.levels.template.tracks" });

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("levels")
    .select("id, name, tracks(name)")
    .eq("school_id", actor.schoolId);
  if (readError) return { ok: false, error: "generic" };
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
  const present = await presentTemplateTracks(existing);

  // 1. Missing levels.
  const newLevels = template.filter((l) => wantedLevels.has(l.name) && !byName.has(l.name.toLowerCase()));
  const levelIds = new Map(existing.map((l) => [l.name.toLowerCase(), l.id]));
  if (newLevels.length > 0) {
    const { data, error } = await supabase
      .from("levels")
      .insert(newLevels.map((l) => ({ school_id: actor.schoolId, cycle: l.cycle, name: l.name, sort_order: l.sortOrder })))
      .select("id, name");
    if (error) return { ok: false, error: dbErrorKey(error) };
    for (const l of data) levelIds.set(l.name.toLowerCase(), l.id);
  }

  // 2. Missing filières, on levels that exist now (picked or already there).
  const newTracks = template.flatMap((level) => {
    const levelId = levelIds.get(level.name.toLowerCase());
    if (!levelId) return [];
    const have = new Set((byName.get(level.name.toLowerCase())?.tracks ?? []).map((t) => t.name.toLowerCase()));
    return level.tracks
      .map((key, i) => ({ key, name: tTracks(key as Parameters<typeof tTracks>[0]), sortOrder: (i + 1) * 10 }))
      .filter(
        (track) =>
          wantedTracks.has(track.key) &&
          !present.has(`${level.name.toLowerCase()}:${track.key}`) &&
          !have.has(track.name.toLowerCase()),
      )
      .map((track) => ({
        school_id: actor.schoolId,
        level_id: levelId,
        name: track.name,
        sort_order: track.sortOrder,
      }));
  });
  if (newTracks.length > 0) {
    const { error } = await supabase.from("tracks").insert(newTracks);
    if (error) return { ok: false, error: dbErrorKey(error) };
  }

  await auditStructure(actor, "level.template", "school", actor.schoolId, {
    levels: newLevels.length,
    tracks: newTracks.length,
  });
  return { ok: true, data: { levels: newLevels.length, tracks: newTracks.length } };
}
