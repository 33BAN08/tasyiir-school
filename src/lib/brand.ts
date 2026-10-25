/** Brand names: proper nouns, identical in every locale (docs/DESIGN.md). */
export const BRAND = {
  name: "Madar",
  nameAr: "مدار",
  product: "Madar School",
} as const;

/** Public address of the site (link previews need absolute URLs). */
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.NEXT_PUBLIC_APP_URL || "https://tasyiir-school.vercel.app";

/** Social preview (Open Graph / WhatsApp / Instagram), 1200×630. */
export const OG_IMAGE = {
  url: "/brand/og-image.png",
  width: 1200,
  height: 630,
  alt: "Madar School — Chaque élève. Chaque cours. Un seul système.",
} as const;

/**
 * Logo files in public/brand (Amiri lettering is drawn as shapes inside the SVGs).
 * The square book icon kept its old file names (tasyir-icon*): only the wordmark changed.
 */
export const BRAND_ASSETS = {
  logo: "/brand/madar-logo.svg",
  logoDark: "/brand/madar-logo-white.svg",
  icon: "/brand/tasyir-icon.svg",
} as const;

/** Publisher named on the privacy policy and terms (/privacy, /terms), and the date they last changed. */
export const LEGAL = {
  publisher: "IAM AGENCY",
  updated: "2026-10-23",
} as const;
