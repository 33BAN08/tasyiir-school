// Phase 10 step 3: push subscriptions. Only a parent of an active school saves one
// (school + account from the session, through save_push_subscription); nobody inserts
// or updates the table directly; a parent reads and deletes only their own rows (never
// the keys); the same browser moving to another account is moved, not duplicated;
// staff, another parent and another school see nothing; a demo reset clears them.
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { ensureDemoSchool } from "./demo-fixture.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase10Push({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const label = (s) => `[P10 push] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase10Push setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const code = async (query) => (await query).error?.code ?? "none";
  const account = async (name, school, roleId) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: school.id, role_id: roleId, full_name: `RLS ${name}`, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const endpoint = () => `https://push.example.com/rls-${fx.run}/${randomBytes(8).toString("hex")}`;
  const save = (client, ep, extra = {}) =>
    client.rpc("save_push_subscription", { p_endpoint: ep, p_p256dh: "BKeyRls", p_auth: "authRls", p_user_agent: "RLS test", ...extra });
  const mine = async (client) => must(await client.from("push_subscriptions").select("id, endpoint"), "read own");
  const rowsOf = async (ep) => must(await admin.from("push_subscriptions").select("profile_id, school_id, p256dh").eq("endpoint", ep), "admin read");

  const parA = await account("p10para", A, A.roles.parent);
  const parA2 = await account("p10para2", A, A.roles.parent);
  const parB = await account("p10parb", B, B.roles.parent);
  const created = [];

  try {
    // --- Saving ------------------------------------------------------------------------------------
    const ep = endpoint();
    created.push(ep);
    check(label("a parent saves this phone"), (await code(save(parA.client, ep))) === "none");
    const row = (await rowsOf(ep))[0];
    check(label("…in their own school and account"), row?.profile_id === parA.id && row.school_id === A.id);
    check(label("…the parent reads it back (endpoint only)"), (await mine(parA.client)).some((r) => r.endpoint === ep));
    check(
      label("…but never the keys"),
      (await code(parA.client.from("push_subscriptions").select("p256dh"))) === "42501" && (await code(parA.client.from("push_subscriptions").select("auth"))) === "42501",
    );
    check(label("saving again keeps one row"), (await code(save(parA.client, ep))) === "none" && (await rowsOf(ep)).length === 1);

    for (const [who, client] of [["a director", as.dirA], ["a teacher", as.tchA], ["a surveillant", as.survA]]) {
      const other = endpoint();
      created.push(other);
      check(label(`${who} cannot save one`), (await code(save(client, other))) === "42501" && (await rowsOf(other)).length === 0);
    }
    check(label("a signed-out visitor cannot save one"), (await code(save(as.anon, endpoint()))) !== "none");
    check(label("an http (not https) address is refused"), (await code(save(parA.client, "http://push.example.com/x"))) === "23514");

    // --- No direct writes ---------------------------------------------------------------------------
    check(
      label("no direct insert, even for yourself"),
      (await code(parA.client.from("push_subscriptions").insert({ school_id: A.id, profile_id: parA.id, endpoint: endpoint(), p256dh: "k", auth: "a" }))) === "42501",
    );
    check(label("no update (keys cannot be swapped)"), (await code(parA.client.from("push_subscriptions").update({ endpoint: endpoint() }).eq("endpoint", ep))) === "42501");

    // --- Who sees what ---------------------------------------------------------------------------------
    check(label("another parent of the school sees nothing of it"), !(await mine(parA2.client)).some((r) => r.endpoint === ep));
    check(label("a parent of school B sees nothing of it"), !(await mine(parB.client)).some((r) => r.endpoint === ep));
    check(label("the director sees no subscription"), (await mine(as.dirA)).length === 0);
    check(label("another parent cannot delete it"), (await parA2.client.from("push_subscriptions").delete().eq("endpoint", ep).select("id")).data?.length === 0 && (await rowsOf(ep)).length === 1);

    // --- The same browser, another account -----------------------------------------------------------
    check(label("the same phone saved by another parent moves to them"), (await code(save(parA2.client, ep))) === "none");
    const moved = await rowsOf(ep);
    check(label("…one row, now theirs"), moved.length === 1 && moved[0].profile_id === parA2.id);
    check(label("…and gone from the first parent's list"), !(await mine(parA.client)).some((r) => r.endpoint === ep));

    // --- Deleting ----------------------------------------------------------------------------------------
    check(label("the parent deletes their own"), (await parA2.client.from("push_subscriptions").delete().eq("endpoint", ep).select("id")).data?.length === 1 && (await rowsOf(ep)).length === 0);

    // --- Demo school: cleared by the nightly reset -------------------------------------------------------
    const demo = await ensureDemoSchool(fx);
    const demoEp = endpoint();
    created.push(demoEp);
    must(await admin.from("push_subscriptions").insert({ school_id: demo.id, profile_id: demo.users.demoParent.id, endpoint: demoEp, p256dh: "k", auth: "a" }), "demo row");
    must(await admin.rpc("run_demo_reset", { p_school: demo.id }), "demo reset");
    check(label("the demo reset clears the demo school's subscriptions"), (await rowsOf(demoEp)).length === 0);
  } finally {
    await admin.from("push_subscriptions").delete().in("endpoint", created);
  }
}
