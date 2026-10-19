import { Almarai, Inter } from "next/font/google";

// Fonts loaded with next/font (self-hosted, preloaded, size-adjusted fallbacks).

/** Latin text, tables, numbers (`font-numeric`); the public home page's Latin font. */
export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Arabic text of the public home page. */
export const almarai = Almarai({
  variable: "--font-almarai",
  subsets: ["arabic"],
  weight: ["400", "700", "800"],
  display: "swap",
});

/**
 * Inter for Latin, Almarai for Arabic. Both real fonts must come before their
 * size-adjusted fallbacks: "Inter Fallback" is a local Arial, which has Arabic
 * letters and would otherwise be used for them instead of Almarai.
 */
export function latinThenArabic(): string {
  const [interFont, interFallback] = inter.style.fontFamily.split(",").map((s) => s.trim());
  const [almaraiFont, almaraiFallback] = almarai.style.fontFamily.split(",").map((s) => s.trim());
  return [interFont, almaraiFont, interFallback, almaraiFallback, "system-ui", "sans-serif"]
    .filter(Boolean)
    .join(", ");
}
