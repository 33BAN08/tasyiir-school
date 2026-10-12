"use client";

import { useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY, type Theme } from "./theme-config";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode): the choice lasts for this page only.
  }
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Follow OS changes while the user is on "system".
  const media = matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (readTheme() === "system") applyTheme("system");
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", listener);
  };
}

/** Current theme choice; "system" on the server and before hydration. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}
