// Phase 9 step 4: school_contacts — the contact card parents see (phone +
// WhatsApp). One row per school, seeded with the school (phone taken from
// schools.phone when it reads as a Moroccan number); every active account of
// the school reads it, only settings.manage (director) changes the two
// numbers; nobody inserts / deletes rows through the API; formats = the CHECKs.
import { randomBytes } from "node:crypto";

import { check, denied, rows } from "./checks.mjs";
import { admin, deactivate, signIn } from "./fixtures.mjs";

export async function phase9SchoolContacts({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const label = (s) => `[P9 contact] ${s}`;
  const must = (r, what) => {
    if (r.error) throw new Error(`phase9SchoolContacts setup: ${what} (${r.error.code ?? r.error.message})`);
    return r.data;
  };
  const row = async (school) => (await admin.from("school_contacts").select("*").eq("school_id", school).maybeSingle()).data;
  const change = (client, school, values) =>
    client.from("school_contacts").update(values).eq("school_id", school.id).select("school_id");

  // A parent account of school A (no child needed: the card is the school's).
  const email = `rls-test+${fx.run}-p9cpar@example.com`;
  const password = `${randomBytes(12).toString("base64url")}a1`;
  const parUser = must(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "parent").user;
  fx.createdUserIds.push(parUser.id);
  must(await admin.from("profiles").insert({
    id: parUser.id, school_id: A.id, role_id: A.roles.parent, full_name: "RLS p9cpar", must_change_password: false,
  }), "parent profile");
  const parA = await signIn({ email, password });

  // --- One row per school ---------------------------------------------------------------------------------
  const seeded = (await admin.from("school_contacts").select("*").in("school_id", [A.id, B.id, C.id])).data ?? [];
  check(label("every new school gets its card, empty (no phone given)"),
    seeded.length === 3 && seeded.every((r) => r.phone === null && r.whatsapp === null && r.updated_by === null), JSON.stringify(seeded));

  const temp = async (phone) => {
    const s = must(await admin.from("schools")
      .insert({ name: `RLS contact ${fx.run}`, slug: `rls-test-p9c-${fx.run}-${randomBytes(3).toString("hex")}`, phone })
      .select("id").single(), "temp school");
    fx.createdSchoolIds.push(s.id);
    return s.id;
  };
  const landline = await temp("0537 12 34 56");
  check(label("the school's phone starts the card (\"0537 12 34 56\" → +212537123456)"), (await row(landline))?.phone === "+212537123456");
  const junk = await temp("12 34");
  const junkRow = await row(junk);
  check(label("a phone that is not Moroccan leaves the card empty"), junkRow && junkRow.phone === null, JSON.stringify(junkRow));
  await admin.from("schools").delete().in("id", [landline, junk]);
  check(label("deleting a school deletes its card"), (await row(landline)) === null && (await row(junk)) === null);
  fx.createdSchoolIds = fx.createdSchoolIds.filter((id) => id !== landline && id !== junk);

  // --- The director fills it -------------------------------------------------------------------------------
  const { data: saved, error: saveError } = await as.dirA.from("school_contacts")
    .update({ phone: "+212537000111", whatsapp: "+212612345678" }).eq("school_id", A.id).select("*");
  check(label("the director sets the phone + WhatsApp (who + when recorded)"),
    !saveError && saved?.length === 1 && saved[0].phone === "+212537000111" && saved[0].whatsapp === "+212612345678"
      && saved[0].updated_by === fx.users.dirA.id,
    saveError?.code ?? JSON.stringify(saved));
  must(await admin.from("school_contacts").update({ phone: "+212522000222" }).eq("school_id", B.id), "B phone");

  // --- Reads -----------------------------------------------------------------------------------------------
  const onlyA = (list) => list.length === 1 && list[0].school_id === A.id && list[0].whatsapp === "+212612345678";
  for (const who of ["dirA", "survA", "tchA", "mgrA", "audA"]) {
    await rows(label(`${who} reads their school's card, not B's`), as[who].from("school_contacts").select("school_id, whatsapp"), onlyA);
  }
  await rows(label("a parent of A reads A's card, not B's"), parA.from("school_contacts").select("school_id, whatsapp"), onlyA);
  await rows(label("the director of B reads only B's card"), as.dirB.from("school_contacts").select("school_id"),
    (list) => list.length === 1 && list[0].school_id === B.id);
  await rows(label("suspended school C: its director reads nothing"), as.dirC.from("school_contacts").select("school_id"), 0);
  await deactivate(fx.users.deactA); // already done by phase3 in a full run
  await rows(label("a deactivated account reads nothing"), as.deactA.from("school_contacts").select("school_id"), 0);
  await rows(label("the platform owner reads no school's card"), as.owner.from("school_contacts").select("school_id"), 0);
  const { data: anonRows, error: anonError } = await as.anon.from("school_contacts").select("school_id");
  check(label("signed out: nothing (no grant)"), anonError?.code === "42501" || anonRows?.length === 0, anonError?.code ?? `${anonRows?.length} row(s)`);

  // --- Who may change it -----------------------------------------------------------------------------------
  const other = { whatsapp: "+212700000000" };
  await denied(label("a surveillant cannot change it"), change(as.survA, A, other));
  await denied(label("a teacher cannot change it"), change(as.tchA, A, other));
  await denied(label("a parent cannot change it"), change(parA, A, other));
  await denied(label("the director of A cannot change B's card"), change(as.dirA, B, other));
  await denied(label("suspended school C: its director cannot change it"), change(as.dirC, C, other));
  check(label("…A's and B's cards are unchanged"),
    (await row(A.id)).whatsapp === "+212612345678" && (await row(B.id)).whatsapp === null && (await row(B.id)).phone === "+212522000222");

  // --- Only the two numbers, never the school; no insert / delete ------------------------------------------
  await denied(label("the director cannot move the card to another school"), change(as.dirA, A, { school_id: B.id }));
  await denied(label("the director cannot set who changed it"), change(as.dirA, A, { updated_by: fx.users.survA.id }));
  await denied(label("the director cannot add a card"), as.dirA.from("school_contacts").insert({ school_id: A.id }).select("school_id"));
  await denied(label("the director cannot delete the card"), as.dirA.from("school_contacts").delete().eq("school_id", A.id).select("school_id"));
  check(label("…A still has its card"), (await row(A.id))?.phone === "+212537000111");

  // --- Formats ---------------------------------------------------------------------------------------------
  const refused = async (name, values) => {
    const { error } = await change(as.dirA, A, values);
    check(label(`refused: ${name}`), error?.code === "23514", error?.code ?? "accepted!");
  };
  await refused("a phone not in the stored form (\"0612345678\")", { phone: "0612345678" });
  await refused("a phone starting with 8", { phone: "+212812345678" });
  await refused("a phone one digit short", { phone: "+21261234567" });
  await refused("a landline as WhatsApp", { whatsapp: "+212537000111" });
  const { data: cleared, error: clearError } = await change(as.dirA, A, { phone: null, whatsapp: null });
  check(label("the director clears both numbers"), !clearError && cleared?.length === 1 && (await row(A.id)).phone === null,
    clearError?.code ?? JSON.stringify(cleared));
}
