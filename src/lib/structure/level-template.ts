// Moroccan levels and filières (app data, no table). The director picks from
// it on /setup/levels; picked items become ordinary, editable rows.
// Level names are the usual codes; filière names come from the messages
// (`setup.levels.template.tracks.<key>`) in the director's language.

export const CYCLES = ["prescolaire", "primaire", "college", "lycee", "other"] as const;
export type Cycle = (typeof CYCLES)[number];

export type TemplateLevel = { name: string; tracks: readonly string[] };

export const MOROCCAN_TEMPLATE: Record<Exclude<Cycle, "other">, readonly TemplateLevel[]> = {
  prescolaire: [
    { name: "PS", tracks: [] },
    { name: "MS", tracks: [] },
    { name: "GS", tracks: [] },
  ],
  primaire: [
    { name: "CP", tracks: [] },
    { name: "CE1", tracks: [] },
    { name: "CE2", tracks: [] },
    { name: "CM1", tracks: [] },
    { name: "CM2", tracks: [] },
    { name: "6AP", tracks: [] },
  ],
  college: [
    { name: "1AC", tracks: [] },
    { name: "2AC", tracks: [] },
    { name: "3AC", tracks: [] },
  ],
  lycee: [
    { name: "TC", tracks: ["tcSciences", "tcLettres", "tcTechno"] },
    { name: "1Bac", tracks: ["bac1Sex", "bac1Sm", "bac1Lettres", "bac1Eco"] },
    {
      name: "2Bac",
      tracks: ["bac2Pc", "bac2Svt", "bac2SmA", "bac2SmB", "bac2Lettres", "bac2Sh", "bac2Eco", "bac2Gestion"],
    },
  ],
};

/** Every template level with its cycle and display order (10, 20, … within the cycle). */
export function templateLevels(): { cycle: Cycle; name: string; sortOrder: number; tracks: readonly string[] }[] {
  return Object.entries(MOROCCAN_TEMPLATE).flatMap(([cycle, levels]) =>
    levels.map((level, i) => ({ cycle: cycle as Cycle, name: level.name, sortOrder: (i + 1) * 10, tracks: level.tracks })),
  );
}

/** Track keys of the template, for validation. */
export const TEMPLATE_TRACK_KEYS: readonly string[] = templateLevels().flatMap((l) => l.tracks);
