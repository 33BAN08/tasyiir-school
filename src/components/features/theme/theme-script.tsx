import { THEME_STORAGE_KEY } from "./theme-config";

/**
 * Runs before first paint (see Next.js "Preventing flash before hydration"):
 * applies the saved theme so dark-mode users never see a light flash.
 * Print pages (/<locale>/print/…) are always light: they are sheets of paper.
 * Keep in sync with applyTheme() in ./theme.ts.
 */
const script = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var p=/^\\/[a-z]{2}\\/print\\//.test(location.pathname);var d=!p&&(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches));var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
