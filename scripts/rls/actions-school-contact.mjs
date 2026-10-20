// Phase 9 step 4: /settings/school + saveSchoolContact (the director's contact
// card) and the card on the parent's /portal. settings.manage only, own school;
// the action normalises "06 12 34 56 78" like the form, refuses what the DB
// would, and writes through RLS with the caller's session. Called over HTTP as
// real users on the page that registers it.
import { randomBytes } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const FILE = "src/lib/school-contact/actions.ts";
const PAGE = "/fr/settings/school";
const FORM_MARK = 'id="field-whatsapp"'; // rendered only with the form
const CARD_MARK = "data-school-contact"; // the parent's card

export async function schoolContactActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P9 contact actions] ${s}`;
  const call = (cookies, ...args) => callAction(baseUrl, { id: actionId(FILE, "saveSchoolContact"), path: PAGE, args, cookies });
  const get = async (path, cookies) => {
    const res = await fetch(new URL(path, baseUrl), { headers: { cookie: cookies }, redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const row = async (school) => (await admin.from("school_contacts").select("*").eq("school_id", school.id).single()).data;

  // A parent account of A (the card is the school's: no child needed).
  const email = `rls-test+${fx.run}-p9capar@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`schoolContactActions setup: parent (${error.message})`);
  fx.createdUserIds.push(created.user.id);
  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id, school_id: A.id, role_id: A.roles.parent, full_name: "RLS p9capar", must_change_password: false,
  });
  if (profileError) throw new Error(`schoolContactActions setup: parent profile (${profileError.code})`);

  const dirA = await sessionCookies(fx.users.dirA);
  const dirB = await sessionCookies(fx.users.dirB);
  const survA = await sessionCookies(fx.users.survA);
  const parA = await sessionCookies({ email, password });

  // --- Page access -----------------------------------------------------------------------------------------
  const page = await get(PAGE, dirA);
  check(label("the director sees the form"), page.status === 200 && page.html.includes(FORM_MARK), String(page.status));
  for (const [who, cookies] of [["a surveillant", survA], ["a parent", parA], ["signed out", ""]]) {
    const other = await get(PAGE, cookies);
    check(label(`${who} → not the form`), other.status !== 200 || !other.html.includes(FORM_MARK), String(other.status));
  }

  // --- Parent card hidden while empty ----------------------------------------------------------------------
  const emptyPortal = await get("/fr/portal", parA);
  check(label("no number set → the parent sees no card"),
    emptyPortal.status === 200 && !emptyPortal.html.includes(`${CARD_MARK}=`), String(emptyPortal.status));

  // --- Save --------------------------------------------------------------------------------------------------
  const saved = await call(dirA, { phone: "05 37 00 01 11", whatsapp: "+212 6 12 34 56 78" });
  const a = await row(A);
  check(label("the director saves (typed numbers stored as +212…)"),
    saved.ok === true && a.phone === "+212537000111" && a.whatsapp === "+212612345678" && a.updated_by === fx.users.dirA.id,
    JSON.stringify(saved));
  check(label("…B's card is untouched"), (await row(B)).whatsapp === null);
  const { data: audit } = await admin.from("audit_logs").select("data").eq("school_id", A.id).eq("action", "school_contact.update");
  check(label("…and it is in the audit log"), audit?.length === 1 && audit[0].data?.whatsapp === "+212612345678", JSON.stringify(audit));

  const portal = await get("/fr/portal", parA);
  check(label("the parent sees the card: call + WhatsApp links"),
    portal.status === 200 && portal.html.includes(`${CARD_MARK}=`) && portal.html.includes('href="tel:+212537000111"')
      && portal.html.includes('href="https://wa.me/212612345678"'),
    String(portal.status));

  // --- Refused values (the field is named so the form shows it) ----------------------------------------------
  const refused = async (name, input, errorKey, field) => {
    const result = await call(dirA, input);
    check(label(`refused: ${name}`), result.ok === false && result.error === errorKey && result.field === field, JSON.stringify(result));
  };
  await refused("a phone that is not Moroccan", { phone: "01 23 45 67 89", whatsapp: "" }, "phone", "phone");
  await refused("a phone one digit short", { phone: "0537 00 01 1", whatsapp: "" }, "phone", "phone");
  await refused("a landline as WhatsApp", { phone: "", whatsapp: "05 37 00 01 11" }, "whatsapp", "whatsapp");
  await refused("a number field missing", { phone: "" }, "invalid", "whatsapp");
  const garbage = await call(dirA, "not an object");
  check(label("refused: not an object"), garbage.ok === false && garbage.error === "invalid", JSON.stringify(garbage));
  check(label("…refused saves changed nothing"), (await row(A)).phone === "+212537000111");

  // --- Who may save --------------------------------------------------------------------------------------------
  for (const [who, cookies] of [["a surveillant", survA], ["a parent", parA], ["signed out", undefined]]) {
    const result = await call(cookies, { phone: "", whatsapp: "" });
    check(label(`${who} cannot save`), result.ok === false, JSON.stringify(result));
  }
  const savedB = await call(dirB, { phone: "", whatsapp: "07 00 00 00 00" });
  check(label("the director of B saves only B's card"),
    savedB.ok === true && (await row(B)).whatsapp === "+212700000000" && (await row(A)).whatsapp === "+212612345678",
    JSON.stringify(savedB));

  // --- Empty fields clear the card ---------------------------------------------------------------------------------
  const cleared = await call(dirA, { phone: "  ", whatsapp: "" });
  const afterClear = await row(A);
  check(label("empty fields clear both numbers"), cleared.ok === true && afterClear.phone === null && afterClear.whatsapp === null,
    JSON.stringify(cleared));
  const clearedPortal = await get("/fr/portal", parA);
  check(label("…and the parent's card is gone"), clearedPortal.status === 200 && !clearedPortal.html.includes(`${CARD_MARK}=`));
}
