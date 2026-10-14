// Subjects: colour palette and the Moroccan template (app data, no table).
// The director picks from the template on /setup/subjects; picked items
// become ordinary, editable rows. Names come from the messages
// (`setup.subjects.template.names.<key>`) in the director's language; codes
// are the same in every language.

/** Same list as the subjects_color_check constraint; CSS tokens --subject-<key>. */
export const SUBJECT_COLORS = [
  "teal",
  "blue",
  "indigo",
  "violet",
  "pink",
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "cyan",
  "slate",
] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];

/** Tailwind needs whole class names in the source: one swatch class per colour. */
export const SUBJECT_SWATCH: Record<SubjectColor, string> = {
  teal: "bg-subject-teal",
  blue: "bg-subject-blue",
  indigo: "bg-subject-indigo",
  violet: "bg-subject-violet",
  pink: "bg-subject-pink",
  red: "bg-subject-red",
  orange: "bg-subject-orange",
  amber: "bg-subject-amber",
  lime: "bg-subject-lime",
  green: "bg-subject-green",
  cyan: "bg-subject-cyan",
  slate: "bg-subject-slate",
};

export type TemplateSubject = { key: string; code: string; color: SubjectColor };

// Amazigh shares violet with Philosophie (taught at different levels).
export const SUBJECT_TEMPLATE: readonly TemplateSubject[] = [
  { key: "arabic", code: "Ar", color: "green" },
  { key: "french", code: "Fr", color: "blue" },
  { key: "english", code: "Ang", color: "indigo" },
  { key: "math", code: "Math", color: "red" },
  { key: "physics", code: "PC", color: "orange" },
  { key: "svt", code: "SVT", color: "lime" },
  { key: "history", code: "HG", color: "amber" },
  { key: "islamic", code: "EI", color: "teal" },
  { key: "philosophy", code: "Philo", color: "violet" },
  { key: "computing", code: "Info", color: "cyan" },
  { key: "pe", code: "EPS", color: "slate" },
  { key: "art", code: "Art", color: "pink" },
  { key: "amazigh", code: "Amz", color: "violet" },
];

export const SUBJECT_TEMPLATE_KEYS: readonly string[] = SUBJECT_TEMPLATE.map((s) => s.key);
