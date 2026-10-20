import { z } from "zod";

// The school's contact card (Phase 9). Same formats as the school_contacts
// CHECKs. Error messages are `schoolSettings.errors` keys.

/** Landline (05) or mobile (06 / 07), stored as +212XXXXXXXXX. */
export const SCHOOL_PHONE_PATTERN = /^\+212[5-7][0-9]{8}$/;

/**
 * "05 37 12 34 56", "0612345678", "+212 6 12 34 56 78", "00212…" →
 * "+212537123456". Anything else → null.
 */
export function normalizeSchoolPhone(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, "");
  const m = /^(?:\+212|00212|212|0)([5-7][0-9]{8})$/.exec(digits);
  return m ? `+212${m[1]}` : null;
}

/** A mobile (06 / 07): WhatsApp numbers only. */
export function isMobile(phone: string): boolean {
  return /^\+212[67]/.test(phone);
}

/** Empty → null; else the stored form, or the error key. */
function number(error: string, accept: (phone: string) => boolean) {
  return z
    .string({ error: "invalid" })
    .trim()
    .max(30, { error })
    .transform((value, ctx) => {
      if (value === "") return null;
      const phone = normalizeSchoolPhone(value);
      if (!phone || !accept(phone)) {
        ctx.addIssue({ code: "custom", message: error });
        return z.NEVER;
      }
      return phone;
    });
}

export const schoolContactSchema = z.object(
  {
    phone: number("phone", () => true),
    whatsapp: number("whatsapp", isMobile),
  },
  { error: "invalid" },
);

export type SchoolContactFormValues = z.input<typeof schoolContactSchema>;
export type SchoolContactValues = z.output<typeof schoolContactSchema>;
