// Phase 10 step 4: sending pushes (DB side). A parent's notification of a pushed
// type (absences + corrections + daily alerts, remarks, announcements) is queued in
// push_outbox only when that parent has a phone subscribed; other types and parents
// without a phone are not. Nobody but the secret key reads the queue or calls
// push_claim / push_done; a claim returns what the sentence needs (type, data, the
// student's names, the parent's language, the phones with their keys) and is not
// handed out twice; push_done removes the rows, resets phones that took it, removes
// phones that are gone and counts failures; a deleted notification leaves the queue;
// the demo reset clears the demo school's queue.
import { randomBytes } from "node:crypto";

import { check } from "./checks.mjs";
import { ensureDemoSchool } from "./demo-fixture.mjs";
import { admin, signIn } from "./fixtures.mjs";

export async function phase10PushSend({ fx, as }) {
  const A = fx.schools.a;
  const label = (s) => `[P10 send] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase10PushSend setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const code = async (query) => (await query).error?.code ?? "none";
  const account = async (name, locale) => {
    const email = `rls-test+${fx.run}-${name}@example.com`;
    const password = `${randomBytes(12).toString("base64url")}a1`;
    const user = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), name).user;
    fx.createdUserIds.push(user.id);
    must(await admin.from("profiles").insert({ id: user.id, school_id: A.id, role_id: A.roles.parent, full_name: `RLS ${name}`, locale, must_change_password: false }), name);
    return { id: user.id, client: await signIn({ email, password }) };
  };
  const endpoint = () => `https://push.example.com/rls-${fx.run}/${randomBytes(8).toString("hex")}`;
  const notify = async (recipient, type, extra = {}) =>
    must(await admin.from("notifications").insert({ school_id: A.id, recipient_id: recipient, type, data: { test: true }, ...extra }).select("id").single(), type).id;
  const queued = async (ids) => must(await admin.from("push_outbox").select("id, notification_id, school_id, attempts").in("notification_id", ids), "outbox");

  const withPhone = await account("p10sendp", "fr");
  const noPhone = await account("p10sendn", "ar");
  const phone = endpoint();
  const phone2 = endpoint();
  must(await withPhone.client.rpc("save_push_subscription", { p_endpoint: phone, p_p256dh: "BKeyOne", p_auth: "authOne", p_user_agent: "RLS" }), "phone");
  must(await withPhone.client.rpc("save_push_subscription", { p_endpoint: phone2, p_p256dh: "BKeyTwo", p_auth: "authTwo", p_user_agent: "RLS" }), "phone 2");
  const student = must(
    await admin.from("students").insert({ school_id: A.id, first_name: "Push", last_name: `Kid ${fx.run}`, birth_date: "2014-01-01", gender: "male" }).select("id, first_name").single(),
    "student",
  );
  const notes = [];

  try {
    // --- What is queued ------------------------------------------------------------------------------------
    const pushed = ["absence", "absence_corrected", "unjustified_absences", "repeated_lateness", "remark", "announcement"];
    const ids = {};
    for (const type of pushed) {
      ids[type] = await notify(withPhone.id, type, { student_id: type === "announcement" ? null : student.id });
      notes.push(ids[type]);
    }
    const rows = await queued(Object.values(ids));
    check(label("each pushed type is queued for a parent with a phone"), rows.length === pushed.length, `${rows.length}/${pushed.length}`);
    check(label("…with the notification's school, never tried yet"), rows.every((r) => r.school_id === A.id && r.attempts === 0));
    const other = await notify(withPhone.id, "subscription_expiring");
    notes.push(other);
    check(label("a type that is not pushed is not queued"), (await queued([other])).length === 0);
    const silent = await notify(noPhone.id, "remark", { student_id: student.id });
    notes.push(silent);
    check(label("a parent without a phone is not queued"), (await queued([silent])).length === 0);

    // --- Nobody else touches the queue ---------------------------------------------------------------------
    for (const [who, client] of [["the parent", withPhone.client], ["a director", as.dirA], ["a visitor", as.anon]]) {
      check(label(`${who} cannot read the queue`), (await code(client.from("push_outbox").select("id"))) === "42501");
      check(label(`${who} cannot claim`), (await code(client.rpc("push_claim", { p_limit: 5 }))) === "42501");
      check(label(`${who} cannot report`), (await code(client.rpc("push_done", { p_outbox: rows.map((r) => r.id) }))) === "42501");
    }
    check(label("…the parent cannot read the phones' failures"), (await code(withPhone.client.from("push_subscriptions").select("failures"))) === "42501");

    // --- Claiming --------------------------------------------------------------------------------------------
    const claimed = must(await admin.rpc("push_claim", { p_limit: 500 }), "claim").filter((c) => Object.values(ids).includes(c.notification_id));
    check(label("the secret key claims the queued rows"), claimed.length === pushed.length, `${claimed.length}`);
    const remark = claimed.find((c) => c.type === "remark");
    check(
      label("…with the parent's language, the student's names and both phones with their keys"),
      remark?.locale === "fr" &&
        remark.student?.firstName === student.first_name &&
        remark.subscriptions.length === 2 &&
        remark.subscriptions.some((s) => s.endpoint === phone && s.p256dh === "BKeyOne" && s.auth === "authOne"),
      JSON.stringify(remark && { ...remark, subscriptions: remark.subscriptions.length }),
    );
    check(label("…an announcement has no student"), claimed.find((c) => c.type === "announcement")?.student === null);
    const again = must(await admin.rpc("push_claim", { p_limit: 500 }), "claim again").filter((c) => Object.values(ids).includes(c.notification_id));
    check(label("a claimed row is not handed out twice"), again.length === 0);
    check(label("…and counts one attempt"), (await queued(Object.values(ids))).every((r) => r.attempts === 1));

    // --- Reporting -------------------------------------------------------------------------------------------
    must(await admin.from("push_subscriptions").update({ failures: 3 }).eq("endpoint", phone), "failures");
    const done = claimed.filter((c) => c.type !== "absence");
    must(await admin.rpc("push_done", { p_outbox: done.map((c) => c.outbox_id), p_ok: [phone], p_gone: [phone2], p_failed: [] }), "done");
    check(label("reported rows leave the queue"), (await queued(done.map((c) => c.notification_id))).length === 0);
    const subs = must(await admin.from("push_subscriptions").select("endpoint, failures, last_success_at").in("endpoint", [phone, phone2]), "subs");
    check(label("a phone that took it: failures back to 0, success time set"), subs.some((s) => s.endpoint === phone && s.failures === 0 && s.last_success_at));
    check(label("a phone the push service says is gone is removed"), !subs.some((s) => s.endpoint === phone2));
    must(await admin.from("push_subscriptions").update({ failures: 9 }).eq("endpoint", phone), "failures 9");
    must(await admin.rpc("push_done", { p_outbox: [], p_failed: [phone] }), "failed");
    check(label("the 10th failure in a row removes the phone"), (await admin.from("push_subscriptions").select("id").eq("endpoint", phone)).data?.length === 0);

    // --- Deleted notification --------------------------------------------------------------------------------
    must(await admin.from("notifications").delete().eq("id", ids.absence), "delete");
    check(label("a deleted notification leaves the queue"), (await queued([ids.absence])).length === 0);

    // --- Demo school -----------------------------------------------------------------------------------------
    const demo = await ensureDemoSchool(fx);
    const demoPhone = endpoint();
    must(await admin.from("push_subscriptions").insert({ school_id: demo.id, profile_id: demo.users.demoParent.id, endpoint: demoPhone, p256dh: "k", auth: "a" }), "demo phone");
    const demoNote = must(
      await admin.from("notifications").insert({ school_id: demo.id, recipient_id: demo.users.demoParent.id, type: "announcement", data: { test: true } }).select("id").single(),
      "demo note",
    ).id;
    check(label("a demo parent's notification is queued like any other"), (await queued([demoNote])).length === 1);
    must(await admin.rpc("run_demo_reset", { p_school: demo.id }), "demo reset");
    check(
      label("the demo reset clears the demo school's queue"),
      must(await admin.from("push_outbox").select("id").eq("school_id", demo.id), "demo outbox").length === 0,
    );
  } finally {
    await admin.from("notifications").delete().in("id", notes);
    await admin.from("push_subscriptions").delete().in("endpoint", [phone, phone2]);
    await admin.from("students").delete().eq("id", student.id);
  }
}
