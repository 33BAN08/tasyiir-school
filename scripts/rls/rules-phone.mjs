// Unit checks of src/lib/parents/phone.ts (loaded with Node's type stripping):
// Moroccan mobiles typed every usual way, and the sign-in address.
import { check } from "./checks.mjs";

const { normalizeMobile, formatMobile, phoneLoginEmail } = await import("../../src/lib/parents/phone.ts");

for (const typed of ["0612345678", "06 12 34 56 78", "06.12.34.56.78", "06-12-34-56-78", "+212612345678", "+212 6 12 34 56 78", "00212612345678", "212612345678"]) {
  check(`[P5 rule] "${typed}" → +212612345678`, normalizeMobile(typed) === "+212612345678", String(normalizeMobile(typed)));
}
check("[P5 rule] 07 numbers are mobiles too", normalizeMobile("0712345678") === "+212712345678", "");
for (const bad of ["0522123456", "061234567", "06123456789", "+33612345678", "abc", ""]) {
  check(`[P5 rule] "${bad}" is refused`, normalizeMobile(bad) === null, String(normalizeMobile(bad)));
}
check("[P5 rule] shown as 06 12 34 56 78", formatMobile("+212612345678") === "06 12 34 56 78", formatMobile("+212612345678"));
check("[P5 rule] sign-in address in the reserved .invalid domain",
  phoneLoginEmail("+212612345678") === "212612345678@phone.tasyiir.invalid", phoneLoginEmail("+212612345678"));
