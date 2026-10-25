// Sections of the school structure, in order. A plain module (not the
// "use client" nav): a constant exported from a client file reaches server
// components as a client reference, not its value.
export const SETUP_TABS = [
  { key: "years", href: "/setup/years" },
  { key: "levels", href: "/setup/levels" },
  { key: "classes", href: "/setup/classes" },
  { key: "subjects", href: "/setup/subjects" },
  { key: "rooms", href: "/setup/rooms" },
  { key: "timeSlots", href: "/setup/time-slots" },
  { key: "grading", href: "/setup/grading" },
] as const;

export type SetupTabKey = (typeof SETUP_TABS)[number]["key"];
