// Moroccan mobile numbers (06 / 07), stored as +2126XXXXXXXX / +2127XXXXXXXX
// (database check guardians_phone_check).
//
// Parents sign in with their phone + password. Supabase's phone sign-in
// needs the Phone provider (an SMS setup we do not pay for), so a parent
// account's Auth identifier is an address derived from the phone, in the
// reserved ".invalid" domain: it can never receive mail and nothing is ever
// sent to it. The login form turns a typed phone into that address.

export const PHONE_PATTERN = /^\+212[67][0-9]{8}$/;

const PHONE_LOGIN_DOMAIN = "phone.tasyiir.invalid";

/**
 * "06 12 34 56 78", "0612345678", "+212 6 12 34 56 78", "00212612345678",
 * "212612345678" → "+212612345678". Anything else (landline, wrong length) → null.
 */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, "");
  const m = /^(?:\+212|00212|212|0)([67][0-9]{8})$/.exec(digits);
  return m ? `+212${m[1]}` : null;
}

/** "+212612345678" → "06 12 34 56 78" (how Moroccans write it; landlines "05 …" too). */
export function formatMobile(phone: string): string {
  const local = `0${phone.slice(4)}`;
  return local.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");
}

/** "+212612345678" → "212612345678@phone.tasyiir.invalid": the parent account's Auth identifier. */
export function phoneLoginEmail(phone: string): string {
  return `${phone.slice(1)}@${PHONE_LOGIN_DOMAIN}`;
}
