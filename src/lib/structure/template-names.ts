import "server-only";

import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { templateLevels } from "@/lib/structure/level-template";

// A template filière may have been created from any UI language ("Sciences"
// from French, "العلوم" from Arabic): it counts as present if its name in ANY
// language exists on the level, so switching language never duplicates it.

/** Template filière key → its lower-cased name in every UI language. */
async function trackNamesInAllLocales(): Promise<Map<string, Set<string>>> {
  const names = new Map<string, Set<string>>();
  for (const locale of routing.locales) {
    const t = await getTranslations({ locale, namespace: "setup.levels.template.tracks" });
    for (const key of templateLevels().flatMap((l) => l.tracks)) {
      const set = names.get(key) ?? new Set<string>();
      set.add(t(key as Parameters<typeof t>[0]).toLowerCase());
      names.set(key, set);
    }
  }
  return names;
}

/**
 * `"<level lower-cased>:<track key>"` for each template filière the school
 * already has. `levels`: the school's levels with their filière names.
 */
export async function presentTemplateTracks(
  levels: { name: string; tracks: { name: string }[] }[],
): Promise<Set<string>> {
  const names = await trackNamesInAllLocales();
  const present = new Set<string>();
  for (const level of levels) {
    const have = new Set(level.tracks.map((t) => t.name.toLowerCase()));
    for (const [key, variants] of names) {
      if ([...variants].some((v) => have.has(v))) present.add(`${level.name.toLowerCase()}:${key}`);
    }
  }
  return present;
}
