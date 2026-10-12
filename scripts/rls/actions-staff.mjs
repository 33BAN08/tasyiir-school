// Phase 3 Server Actions, called over HTTP as real users: the server-side
// rules (users.manage, role rules, own school only) — not just RLS.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, deactivate } from "./fixtures.mjs";

const PATH = "/fr/staff";

export async function staffActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const createId = actionId("src/lib/staff/actions.ts", "createStaff");
  const cookies = {};
  for (const name of ["dirA", "survA", "mgrA", "pendA", "dirC"]) cookies[name] = await sessionCookies(fx.users[name]);

  let n = 0;
  const newStaff = (roleId, extra = {}) => ({
    fullName: `RLS new ${++n}`,
    email: `rls-test+${fx.run}-new${n}@example.com`,
    roleId,
    phone: "",
    locale: "fr",
    ...extra,
  });
  const create = (who, input) =>
    callAction(baseUrl, { id: createId, path: PATH, args: [input], cookies: who && cookies[who] });
  const accountsWith = async (email) =>
    (await admin.from("profiles").select("id").eq("email", email)).data?.length ?? 0;
  const expectError = async (name, who, input, error) => {
    const before = await accountsWith(input.email);
    const result = await create(who, input);
    check(name, !result.ok && result.error === error, result.ok ? "CREATED!" : result.error);
    if (!result.ok && (await accountsWith(input.email)) !== before) {
      check(`${name} (nothing created)`, false, "an account was created anyway!");
    }
  };
  const ownerRole = (
    await admin.from("roles").select("id").is("school_id", null).eq("key", "platform_owner").single()
  ).data.id;

  // --- Who may call createStaff ---------------------------------------------
  const anonResult = await create(null, newStaff(A.roles.teacher));
  check("[P3 action] signed-out caller cannot create staff", !anonResult.ok, anonResult.ok ? "CREATED!" : anonResult.error);
  await expectError("[P3 action] surveillant (no users.manage) cannot create staff", "survA",
    newStaff(A.roles.teacher), "forbidden");
  await expectError("[P3 action] director still on temporary password cannot create staff", "pendA",
    newStaff(A.roles.teacher), "forbidden");
  await expectError("[P3 action] director of a suspended school cannot create staff", "dirC",
    newStaff(fx.schools.c.roles.teacher), "forbidden");

  // --- Director creates in own school ---------------------------------------
  const ok = newStaff(A.roles.surveillant, { phone: "0612345678" });
  const created = await create("dirA", ok);
  check("[P3 action] director creates a surveillant", created.ok === true, created.ok ? "created" : created.error);
  if (created.ok) {
    const { data: p } = await admin
      .from("profiles").select("school_id, role_id, must_change_password, email").eq("id", created.data.id).single();
    check("[P3 action] new account is in the director's school, with that role",
      p.school_id === A.id && p.role_id === A.roles.surveillant, "");
    check("[P3 action] new account must change its temporary password", p.must_change_password === true, "");
    check("[P3 action] a temporary password is returned once", (created.data.temporaryPassword ?? "").length >= 12, "");
    const { data: logs } = await admin
      .from("audit_logs").select("data").eq("action", "staff.create").eq("entity_id", created.data.id);
    check("[P3 action] creation is in the audit log, without the password",
      logs?.length === 1 && !JSON.stringify(logs[0].data).includes(created.data.temporaryPassword), "");
  }
  await expectError("[P3 action] same email twice is refused", "dirA", { ...newStaff(A.roles.teacher), email: ok.email },
    "emailTaken");
  await expectError("[P3 action] invalid email is refused", "dirA", newStaff(A.roles.teacher, { email: "nope" }),
    "invalidEmail");

  // --- Own school only, and never platform_owner / family roles --------------
  const smuggled = newStaff(A.roles.teacher, { schoolId: B.id, school_id: B.id });
  const smuggledResult = await create("dirA", smuggled);
  if (smuggledResult.ok) {
    const { data: p } = await admin.from("profiles").select("school_id").eq("id", smuggledResult.data.id).single();
    check("[P3 action] a school id in the input is ignored (created in own school)", p.school_id === A.id, "");
  } else {
    check("[P3 action] a school id in the input is ignored (created in own school)", false, smuggledResult.error);
  }
  await expectError("[P3 action] director cannot use another school's role", "dirA", newStaff(B.roles.teacher),
    "roleInvalid");
  await expectError("[P3 action] director cannot assign platform_owner", "dirA", newStaff(ownerRole), "roleInvalid");
  await expectError("[P3 action] director cannot create a parent account here", "dirA", newStaff(A.roles.parent),
    "roleInvalid");
  await expectError("[P3 action] director cannot create a student account here", "dirA", newStaff(A.roles.student),
    "roleInvalid");

  // --- Only a director creates a director; no privilege escalation -----------
  const director = await create("dirA", newStaff(A.roles.director));
  check("[P3 action] director can create another director", director.ok === true, director.ok ? "created" : director.error);
  await expectError("[P3 action] non-director manager cannot create a director", "mgrA", newStaff(A.roles.director),
    "directorOnly");
  await expectError("[P3 action] non-director manager cannot assign a role with more rights", "mgrA",
    newStaff(A.roles.auditor), "roleTooPowerful");
  await expectError("[P3 action] non-director manager cannot assign platform_owner", "mgrA", newStaff(ownerRole),
    "roleInvalid");
  const teacher = await create("mgrA", newStaff(A.roles.teacher));
  check("[P3 action] non-director manager can create a teacher", teacher.ok === true, teacher.ok ? "created" : teacher.error);

  // --- A deactivated manager loses the right immediately (old session) -------
  await deactivate(fx.users.mgrA);
  await expectError("[P3 action] deactivated manager (old session) cannot create staff", "mgrA",
    newStaff(A.roles.teacher), "forbidden");
}
