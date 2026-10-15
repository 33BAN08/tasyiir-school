// How a student's name is shown. Latin names are always there; Arabic names
// are optional (both or neither). Lists show "NOM Prénom", like Massar.

export type StudentNames = {
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
};

function arabicName(s: StudentNames): string | null {
  return s.firstNameAr && s.lastNameAr ? `${s.lastNameAr} ${s.firstNameAr}` : null;
}

function latinName(s: StudentNames): string {
  return `${s.lastName} ${s.firstName}`;
}

/** Main name in the UI language: Arabic in the Arabic UI when known, Latin otherwise. */
export function studentName(s: StudentNames, locale: string): string {
  return (locale === "ar" && arabicName(s)) || latinName(s);
}

/** The name in the other script, shown under the main one (null when there is none). */
export function studentOtherName(s: StudentNames, locale: string): string | null {
  const arabic = arabicName(s);
  if (!arabic) return null;
  return locale === "ar" ? latinName(s) : arabic;
}
