/** Shared by the inline <head> script (server) and the theme hook (client). */
export const THEME_STORAGE_KEY = "theme";
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
