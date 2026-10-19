// Every notification type written by a trigger, a scheduled job or the app
// must be allowed by notifications_type_check. A migration that rewrites the
// list and drops one (as phase9_announcements did with 'demo_request') then
// fails here instead of silently breaking that feature.
// Add a type here in the same step that starts using it.
import { check, skip } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const TYPES = [
  "absence",
  "absence_corrected",
  "unjustified_absences",
  "repeated_lateness",
  "subscription_expiring",
  "demo_request",
  "announcement",
];
// Types whose feature is not in the database yet: required once their table exists.
const PENDING = [["remark", "student_remarks"]];

export async function notificationTypes({ fx }) {
  const A = fx.schools.a;
  const recipient = fx.users.dirA.id;
  const label = (s) => `[notification types] ${s}`;

  const required = [...TYPES];
  for (const [type, table] of PENDING) {
    const { error } = await admin.from(table).select("id").limit(1); // (a head request hides the error)
    if (error) skip(label(`'${type}' is allowed`), `table ${table} does not exist yet (${error.code})`);
    else required.push(type);
  }

  const inserted = [];
  for (const type of required) {
    const { data, error } = await admin.from("notifications")
      .insert({ school_id: A.id, recipient_id: recipient, type, data: { test: true } })
      .select("id").single();
    check(label(`'${type}' is allowed by notifications_type_check`), !error, error ? `${error.code} ${error.message}` : "accepted");
    if (data) inserted.push(data.id);
  }
  const { error } = await admin.from("notifications")
    .insert({ school_id: A.id, recipient_id: recipient, type: "not_a_type", data: {} });
  check(label("an unknown type is refused (control)"), error?.code === "23514", error?.code ?? "ACCEPTED!");

  if (inserted.length) await admin.from("notifications").delete().in("id", inserted);
}
