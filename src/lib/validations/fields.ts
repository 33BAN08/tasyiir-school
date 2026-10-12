import { z } from "zod";

// Field rules shared by several forms. Error messages are next-intl keys that
// exist in every form's error namespace (platform.errors, staff.errors).

/** A person's full name. */
export const personNameField = z.string().trim().min(2, { error: "nameRequired" }).max(120, { error: "tooLong" });

/** Email, normalized to lower case. */
export const emailField = z.string().trim().toLowerCase().pipe(z.email({ error: "invalidEmail" }));

/** Optional Moroccan/international phone ("" → null). */
export const optionalPhoneField = z
  .string()
  .trim()
  .regex(/^(\+?[0-9][0-9 .-]{5,18})?$/, { error: "phoneInvalid" })
  .transform((v) => v || null);

/** UI language of an account. */
export const localeField = z.enum(["ar", "fr", "en"]);
