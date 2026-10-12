// Phase 3 step 4 Server Actions (edit, change role, reset password,
// deactivate / reactivate), called over HTTP as real users.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, anon, signIn } from "./fixtures.mjs";

const FILE = "src/lib/staff/member-actions.ts";

export async function staffMemberActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const u = fx.users;
  const ids = Object.fromEntries(
    ["updateStaffDetails", "changeStaffRole", "resetStaffPassword", "setStaffActive"].map((n) => [n, actionId(FILE, n)]),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "mgrA"]) cookies[name] = await sessionCookies(u[name]);
  // Posted to the target's detail page, like the browser (actions are registered per page).
  const call = (who, name, staffId, ...rest) =>
    callAction(baseUrl, { id: ids[name], path: `/fr/staff/${staffId}`, args: [staffId, ...rest], cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P3 action] ${label}`, got === wanted, got);
    return r;
  };
  const profile = async (id) =>
    (await admin.from("profiles").select("full_name, role_id, must_change_password, deactivated_at").eq("id", id).single()).data;
  const details = (fullName) => ({ fullName, phone: "", locale: "fr" });
  const ownerRole = (await admin.from("roles").select("id").is("school_id", null).eq("key", "platform_owner").single()).data.id;

  // --- Edit details -----------------------------------------------------------
  await expect("director edits a teacher's details", call("dirA", "updateStaffDetails", u.tchA.id, details("RLS teacher renamed")), "ok");
  check("[P3 action] the new name is saved", (await profile(u.tchA.id)).full_name === "RLS teacher renamed", "");
  await expect("director cannot edit another school's director", call("dirA", "updateStaffDetails", u.dirB.id, details("x")), "notFound");
  await expect("director cannot edit the platform owner", call("dirA", "updateStaffDetails", u.owner.id, details("x")), "notFound");
  await expect("surveillant (no users.manage) cannot edit", call("survA", "updateStaffDetails", u.tchA.id, details("x")), "forbidden");
  await expect("manager cannot edit a director", call("mgrA", "updateStaffDetails", u.pendA.id, details("x")), "directorOnly");
  await expect("manager cannot edit a stronger account", call("mgrA", "updateStaffDetails", u.audA.id, details("x")), "roleTooPowerful");
  await expect("manager edits a teacher", call("mgrA", "updateStaffDetails", u.tchA.id, details("RLS teacher")), "ok");
  await expect("manager edits own details", call("mgrA", "updateStaffDetails", u.mgrA.id, details("RLS manager")), "ok");
  await expect("invalid phone is refused", call("dirA", "updateStaffDetails", u.tchA.id, { ...details("RLS teacher"), phone: "abc" }), "phoneInvalid");

  // --- Change role ------------------------------------------------------------
  const role = (who, target, roleId) => call(who, "changeStaffRole", target, { roleId });
  await expect("director changes a teacher to surveillant", role("dirA", u.tchA.id, A.roles.surveillant), "ok");
  check("[P3 action] the new role is saved", (await profile(u.tchA.id)).role_id === A.roles.surveillant, "");
  await expect("director cannot change own role", role("dirA", u.dirA.id, A.roles.teacher), "selfRole");
  await expect("director cannot give platform_owner", role("dirA", u.tchA.id, ownerRole), "roleInvalid");
  await expect("director cannot give another school's role", role("dirA", u.tchA.id, B.roles.teacher), "roleInvalid");
  await expect("director cannot give a family role", role("dirA", u.tchA.id, A.roles.parent), "roleInvalid");
  await expect("director cannot change another school's director", role("dirA", u.dirB.id, B.roles.teacher), "roleInvalid");
  await expect("director cannot change another school's director (own-school role)", role("dirA", u.dirB.id, A.roles.teacher), "notFound");
  await expect("manager cannot promote to director", role("mgrA", u.tchA.id, A.roles.director), "directorOnly");
  await expect("manager cannot give a stronger role", role("mgrA", u.tchA.id, A.roles.auditor), "roleTooPowerful");
  await expect("manager cannot demote a director", role("mgrA", u.pendA.id, A.roles.teacher), "directorOnly");
  await expect("manager cannot change own role", role("mgrA", u.mgrA.id, A.roles.teacher), "selfRole");
  await expect("manager changes a teacher back", role("mgrA", u.tchA.id, A.roles.teacher), "ok");

  // --- Reset password ---------------------------------------------------------
  const reset = await expect("director resets a teacher's password", call("dirA", "resetStaffPassword", u.tchA.id), "ok");
  if (reset.ok) {
    const fresh = await anon().auth.signInWithPassword({ email: u.tchA.email, password: reset.data.temporaryPassword });
    check("[P3 action] the new temporary password works", !fresh.error, fresh.error?.code ?? "");
    const old = await anon().auth.signInWithPassword({ email: u.tchA.email, password: u.tchA.password });
    check("[P3 action] the old password no longer works", old.error?.code === "invalid_credentials", old.error?.code ?? "SIGNED IN!");
    check("[P3 action] must change password at next sign-in", (await profile(u.tchA.id)).must_change_password === true, "");
    const { data: logs } = await admin.from("audit_logs").select("data").eq("action", "staff.password_reset").eq("entity_id", u.tchA.id);
    check("[P3 action] reset is in the audit log, without the password",
      logs?.length === 1 && !JSON.stringify(logs[0].data).includes(reset.data.temporaryPassword), "");
    u.tchA.password = reset.data.temporaryPassword;
  }
  await expect("director cannot reset own password here", call("dirA", "resetStaffPassword", u.dirA.id), "selfPassword");
  await expect("director cannot reset another school's account", call("dirA", "resetStaffPassword", u.dirB.id), "notFound");
  await expect("manager cannot reset a director's password", call("mgrA", "resetStaffPassword", u.pendA.id), "directorOnly");
  await expect("manager cannot reset a stronger account", call("mgrA", "resetStaffPassword", u.audA.id), "roleTooPowerful");
  await expect("surveillant cannot reset passwords", call("survA", "resetStaffPassword", u.tchA.id), "forbidden");

  // --- Deactivate / reactivate ------------------------------------------------
  const teacherSession = await signIn(u.tchA); // stays signed in through the deactivation
  await expect("director cannot deactivate self", call("dirA", "setStaffActive", u.dirA.id, false), "selfDeactivate");
  await expect("manager cannot deactivate a director", call("mgrA", "setStaffActive", u.pendA.id, false), "directorOnly");
  await expect("manager cannot deactivate a stronger account", call("mgrA", "setStaffActive", u.audA.id, false), "roleTooPowerful");
  await expect("director cannot deactivate another school's director", call("dirA", "setStaffActive", u.dirB.id, false), "notFound");
  await expect("director cannot deactivate the platform owner", call("dirA", "setStaffActive", u.owner.id, false), "notFound");

  await expect("director deactivates a teacher", call("dirA", "setStaffActive", u.tchA.id, false), "ok");
  check("[P3 action] deactivated_at is set", (await profile(u.tchA.id)).deactivated_at !== null, "");
  const { data: seen } = await teacherSession.from("schools").select("id");
  check("[P3 action] the deactivated teacher's open session sees nothing", (seen ?? []).length === 0, `${seen?.length} school(s)`);
  const banned = await anon().auth.signInWithPassword({ email: u.tchA.email, password: u.tchA.password });
  check("[P3 action] the deactivated teacher cannot sign in", banned.error?.code === "user_banned", banned.error?.code ?? "SIGNED IN!");
  await expect("no password reset while deactivated", call("dirA", "resetStaffPassword", u.tchA.id), "accountDeactivated");

  await expect("director reactivates the teacher", call("dirA", "setStaffActive", u.tchA.id, true), "ok");
  const back = await anon().auth.signInWithPassword({ email: u.tchA.email, password: u.tchA.password });
  check("[P3 action] the reactivated teacher can sign in again", !back.error, back.error?.code ?? "");

  await expect("director deactivates another director (one active remains)", call("dirA", "setStaffActive", u.pendA.id, false), "ok");
  await expect("manager cannot reactivate a director", call("mgrA", "setStaffActive", u.pendA.id, true), "directorOnly");
  await expect("director reactivates the other director", call("dirA", "setStaffActive", u.pendA.id, true), "ok");

  const actions = ["staff.update", "staff.role_change", "staff.password_reset", "staff.deactivate", "staff.reactivate"];
  const { data: trail } = await admin.from("audit_logs").select("action").eq("school_id", A.id).in("action", actions);
  check("[P3 action] every kind of change is in school A's audit log",
    actions.every((a) => trail?.some((row) => row.action === a)), "");
}
