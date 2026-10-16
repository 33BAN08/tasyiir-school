// Phase 5 step 3 Server Actions (guardians, links, parent accounts, phone
// sign-in), called over HTTP as real users on the page that registers them.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, anon } from "./fixtures.mjs";
import { randomMobile } from "./phase5-guardians.mjs";

// file → [page that registers its actions, action names]. ":id" = a guardian's own page
// (linking, deleting and the account actions only live there).
const ACTIONS = {
  "src/lib/parents/guardian-actions.ts": [
    ["/fr/parents", ["createGuardian", "updateGuardian"]],
    ["/fr/parents/:id", ["deleteGuardian", "linkChild", "unlinkChild", "searchStudentsToLink"]],
  ],
  "src/lib/parents/account-actions.ts": [["/fr/parents/:id", ["createParentAccount", "resetParentPassword", "setParentActive"]]],
  "src/lib/auth/actions.ts": [["/fr/login", ["signIn"]]],
};
const loginEmail = (phone) => `${phone.slice(1)}@phone.tasyiir.invalid`;
/** "+212612345678" → "06 12 34 56 78". */
const typed = (phone) => `0${phone.slice(4)}`.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4 $5");

export async function parentActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    Object.entries(ACTIONS).flatMap(([file, pages]) =>
      pages.flatMap(([path, names]) => names.map((n) => [n, { id: actionId(file, n), path }])),
    ),
  );
  // The guardian page the ":id" actions are posted to (any guardian of the caller's school).
  const pageOf = {};
  // Note: tchA had its password reset by an earlier suite (must change it): not used here.
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, action, ...args) => {
    const { id, path } = ids[action];
    const page = path.replace(":id", pageOf[who] ?? "00000000-0000-0000-0000-000000000000");
    return callAction(baseUrl, { id, path: page, args, cookies: who ? cookies[who] : undefined });
  };
  const expect = async (label, promise, wanted, field) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    const pass = got === wanted && (field === undefined || r.field === field);
    check(`[P5 action] ${label}`, pass, field ? `${got} (${r.field})` : got);
    return r;
  };
  const signsIn = async (phone, password) => !(await anon().auth.signInWithPassword({ email: loginEmail(phone), password })).error;

  const kid = async (school, lastName) =>
    (await admin
      .from("students")
      .insert({ school_id: school.id, first_name: "Kid", last_name: lastName, birth_date: "2014-01-01", gender: "female" })
      .select("id")
      .single()).data.id;
  const kidA = await kid(A, "PARENTKID");
  const kidB = await kid(B, "PARENTKIDB");
  const form = (phone, extra = {}) => ({ lastName: "Alaoui", firstName: "Karim", phone, email: "", ...extra });
  const phone1 = randomMobile();

  // --- Guardians ------------------------------------------------------------------------
  await expect("surveillant cannot add a parent", call("survA", "createGuardian", form(typed(phone1))), "forbidden");
  const created = await expect("director adds a parent, phone typed \"06 12 34 56 78\"",
    call("dirA", "createGuardian", form(typed(phone1), { email: " Karim@Example.COM " })), "ok");
  const gid = created.ok ? created.data.id : null;
  pageOf.dirA = pageOf.survA = gid;
  const row = (await admin.from("guardians").select("phone, email").eq("id", gid).single()).data;
  check("[P5 action] …stored as +212…, email trimmed + lowercased",
    row?.phone === phone1 && row?.email === "karim@example.com", JSON.stringify(row));
  await expect("a landline → invalidPhone", call("dirA", "createGuardian", form("05 22 12 34 56")), "invalidPhone", "phone");
  await expect("the same phone again → phoneTaken", call("dirA", "createGuardian", form(phone1)), "phoneTaken", "phone");

  // --- Links ----------------------------------------------------------------------------
  const found = await call("dirA", "searchStudentsToLink", "parentkid");
  check("[P5 action] student search finds own school's student only",
    found.ok && found.data.length === 1 && found.data[0].id === kidA, JSON.stringify(found.data ?? found.error));
  await expect("director links the child as father", call("dirA", "linkChild", gid, { studentId: kidA, relation: "father" }), "ok");
  await expect("linking twice → alreadyLinked",
    call("dirA", "linkChild", gid, { studentId: kidA, relation: "tutor" }), "alreadyLinked", "studentId");
  await expect("another school's student → studentNotFound",
    call("dirA", "linkChild", gid, { studentId: kidB, relation: "tutor" }), "studentNotFound", "studentId");
  await expect("director B cannot link school A's parent",
    call("dirB", "linkChild", gid, { studentId: kidB, relation: "tutor" }), "notFound");

  // --- Account + phone sign-in -----------------------------------------------------------
  await expect("surveillant cannot create a parent account", call("survA", "createParentAccount", gid, "fr"), "forbidden");
  const account = await expect("director creates the parent account", call("dirA", "createParentAccount", gid, "ar"), "ok");
  const temp = account.ok ? account.data.temporaryPassword : "";
  check("[P5 action] …temporary password: 8+ characters, letters and digits", /^(?=.*\p{L})(?=.*\p{N}).{8,}$/u.test(temp), "");
  const { data: g } = await admin.from("guardians").select("profile_id").eq("id", gid).single();
  const { data: profile } = await admin.from("profiles").select("must_change_password, phone, role:roles(key)").eq("id", g.profile_id).single();
  check("[P5 action] …a parent profile, password change forced, no phone copied into it",
    profile?.role?.key === "parent" && profile.must_change_password && profile.phone === null, JSON.stringify(profile));
  await expect("creating it twice → accountExists", call("dirA", "createParentAccount", gid, "fr"), "accountExists");

  const login = (login, password) => call(null, "signIn", { login, password }, "/", "fr");
  await expect("phone sign-in with a wrong password → invalidCredentials", login(typed(phone1), "wrong-pass1"), "invalidCredentials");
  // Success = the action redirects (no { ok: false, error } result in the response).
  const signedIn = (r) => !r.ok && (r.error === "no result in response" || /^http 30\d$/.test(r.error));
  const okLogin = await login(typed(phone1), temp);
  check("[P5 action] phone sign-in (\"06 …\") with the temporary password succeeds", signedIn(okLogin), okLogin.error ?? "ok");
  const okIntl = await login(`+212 ${phone1.slice(4)}`, temp);
  check("[P5 action] …also typed as +212", signedIn(okIntl), okIntl.error ?? "ok");
  await expect("a landline at sign-in → invalidLogin", login("05 22 12 34 56", temp), "invalidLogin");

  // Same phone in another school: recorded, but no second account.
  const otherSchool = await call("dirB", "createGuardian", form(phone1));
  pageOf.dirB = otherSchool.data?.id;
  await expect("another school's guardian with that phone cannot get an account",
    call("dirB", "createParentAccount", otherSchool.data?.id, "fr"), "phoneHasAccount");

  // --- Phone change follows the account ---------------------------------------------------
  const phone2 = randomMobile();
  await expect("director changes the parent's phone", call("dirA", "updateGuardian", gid, form(typed(phone2))), "ok");
  check("[P5 action] …the new phone signs in with the same password, the old one no longer",
    (await signsIn(phone2, temp)) && !(await signsIn(phone1, temp)), "");
  // A phone that already signs in to another account: refused, nothing changes.
  const otherAccount = await call("dirB", "createGuardian", form(randomMobile(), { lastName: "Other" }));
  const otherCreated = await call("dirB", "createParentAccount", otherAccount.data?.id, "fr");
  const takenPhone = (await admin.from("guardians").select("phone").eq("id", otherAccount.data?.id).single()).data?.phone;
  await expect("…moving to a phone that signs in to another account is refused",
    call("dirA", "updateGuardian", gid, form(takenPhone)), "phoneHasAccount", "phone");
  const after = (await admin.from("guardians").select("phone").eq("id", gid).single()).data?.phone;
  check("[P5 action] …and the guardian keeps a phone that still signs in",
    after !== takenPhone && (await signsIn(after, temp)), `${otherCreated.ok}`);

  // --- Reset + deactivate ----------------------------------------------------------------
  const reset = await expect("director resets the parent's password", call("dirA", "resetParentPassword", gid), "ok");
  const temp2 = reset.ok ? reset.data.temporaryPassword : "";
  check("[P5 action] …old password refused, new one works", !(await signsIn(after, temp)) && (await signsIn(after, temp2)), "");
  await expect("director B cannot reset school A's parent", call("dirB", "resetParentPassword", gid), "notFound");
  await expect("director deactivates the account", call("dirA", "setParentActive", gid, false), "ok");
  check("[P5 action] …the parent can no longer sign in", !(await signsIn(after, temp2)), "");
  await expect("director reactivates it", call("dirA", "setParentActive", gid, true), "ok");
  check("[P5 action] …sign-in works again", await signsIn(after, temp2), "");

  // --- A staff account linked as "guardian" is never touched ----------------------------
  const trap = await call("dirA", "createGuardian", form(randomMobile(), { lastName: "Trap" }));
  await admin.from("guardians").update({ profile_id: fx.users.mgrA.id }).eq("id", trap.data?.id);
  await expect("resetting a staff account from the parents page → noAccount", call("dirA", "resetParentPassword", trap.data?.id), "noAccount");
  await expect("deactivating it → noAccount", call("dirA", "setParentActive", trap.data?.id, false), "noAccount");
  await expect("deleting that guardian is fine", call("dirA", "deleteGuardian", trap.data?.id), "ok");
  const staffStill = await admin.auth.admin.getUserById(fx.users.mgrA.id);
  check("[P5 action] …and the staff account still exists", !staffStill.error && Boolean(staffStill.data.user), "");

  // --- Unlink + delete -----------------------------------------------------------------
  await expect("director removes the link", call("dirA", "unlinkChild", gid, kidA), "ok");
  await expect("director deletes the parent", call("dirA", "deleteGuardian", gid), "ok");
  const gone = g?.profile_id ? await admin.auth.admin.getUserById(g.profile_id) : null;
  check("[P5 action] …and their account is deleted too", Boolean(gone) && (Boolean(gone.error) || !gone.data.user), "");

  // Leave nothing for the next suites (other accounts go with the fixture schools).
  await admin.from("guardians").delete().in("school_id", [A.id, B.id]);
  await admin.from("students").delete().in("id", [kidA, kidB]);
}
