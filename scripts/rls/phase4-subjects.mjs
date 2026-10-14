// Phase 4 step 4: subjects and rooms (database level). Writes through RLS
// with the user's session: own school + structure.manage.
import { allowed, check, denied, rows } from "./checks.mjs";

export async function phase4Subjects({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const { anon, dirA, survA, dirB, dirC, owner } = as;

  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P4] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };

  // --- Subjects -------------------------------------------------------------------
  const subject = (schoolId, name, extra = {}) => ({ school_id: schoolId, name, ...extra });
  const insertSubject = (client, values) => client.from("subjects").insert(values).select("id");

  const { data: math } = await dirA
    .from("subjects")
    .insert(subject(A.id, "S-Mathématiques", { code: "SM", color: "red" }))
    .select("id")
    .single();
  check("[P4] director creates a subject in own school", Boolean(math));
  await allowed("[P4] a subject without code gets the default colour",
    insertSubject(dirA, subject(A.id, "S-Arabe")));
  await allowed("[P4] another school can use the same name and code",
    insertSubject(dirB, subject(B.id, "S-Mathématiques", { code: "SM" })));

  await denied("[P4] director A cannot create a subject in school B", insertSubject(dirA, subject(B.id, "S-X")));
  await denied("[P4] surveillant cannot create a subject", insertSubject(survA, subject(A.id, "S-X")));
  await denied("[P4] suspended school's director cannot create a subject", insertSubject(dirC, subject(C.id, "S-X")));
  await denied("[P4] platform owner cannot write subjects", insertSubject(owner, subject(A.id, "S-X")));
  await denied("[P4] anonymous cannot create a subject", insertSubject(anon, subject(A.id, "S-X")));

  await refusedWith("subject names are unique per school, ignoring case",
    insertSubject(dirA, subject(A.id, "s-mathématiques")), "23505");
  await refusedWith("subject codes are unique per school, ignoring case",
    insertSubject(dirA, subject(A.id, "S-Autre", { code: "sm" })), "23505");
  await refusedWith("a code longer than 6 characters is refused",
    insertSubject(dirA, subject(A.id, "S-Long", { code: "ABCDEFG" })), "23514");
  await refusedWith("an empty code is refused (no code = null)",
    insertSubject(dirA, subject(A.id, "S-Vide", { code: "" })), "23514");
  await refusedWith("a colour outside the palette is refused",
    insertSubject(dirA, subject(A.id, "S-Hex", { color: "#ff0000" })), "23514");

  await rows("[P4] surveillant reads own school's subjects", survA.from("subjects").select("id"), 2);
  await rows("[P4] director B sees no subject of school A",
    dirB.from("subjects").select("id").eq("school_id", A.id), 0);
  await allowed("[P4] director edits own subject",
    dirA.from("subjects").update({ color: "blue", code: null }).eq("id", math?.id).select("id"));
  await denied("[P4] director cannot move a subject to another school",
    dirA.from("subjects").update({ school_id: B.id }).eq("id", math?.id).select("id"));
  await denied("[P4] director B cannot edit school A's subject",
    dirB.from("subjects").update({ name: "x" }).eq("id", math?.id).select("id"));
  await denied("[P4] director B cannot delete school A's subject",
    dirB.from("subjects").delete().eq("id", math?.id).select("id"));

  // --- Rooms ----------------------------------------------------------------------
  const room = (schoolId, name, capacity = 30, roomType = null) => ({
    school_id: schoolId,
    name,
    capacity,
    room_type: roomType,
  });
  const insertRoom = (client, values) => client.from("rooms").insert(values).select("id");

  const { data: lab } = await dirA.from("rooms").insert(room(A.id, "R-Labo 1", 24, "lab")).select("id").single();
  check("[P4] director creates a room with a type", Boolean(lab));
  await allowed("[P4] a room without type", insertRoom(dirA, room(A.id, "R-Salle 1")));
  await denied("[P4] director A cannot create a room in school B", insertRoom(dirA, room(B.id, "R-X")));
  await denied("[P4] surveillant cannot create a room", insertRoom(survA, room(A.id, "R-X")));
  await denied("[P4] platform owner cannot write rooms", insertRoom(owner, room(A.id, "R-X")));
  await refusedWith("room names are unique per school, ignoring case",
    insertRoom(dirA, room(A.id, "r-labo 1")), "23505");
  await refusedWith("capacity 0 is refused", insertRoom(dirA, room(A.id, "R-Zero", 0)), "23514");
  await refusedWith("capacity over 500 is refused", insertRoom(dirA, room(A.id, "R-Big", 501)), "23514");
  await refusedWith("an unknown room type is refused", insertRoom(dirA, room(A.id, "R-Pool", 30, "pool")), "23514");

  await rows("[P4] surveillant reads own school's rooms", survA.from("rooms").select("id"), 2);
  await rows("[P4] director B sees no room of school A", dirB.from("rooms").select("id").eq("school_id", A.id), 0);
  await denied("[P4] director B cannot edit school A's room",
    dirB.from("rooms").update({ capacity: 10 }).eq("id", lab?.id).select("id"));
  await allowed("[P4] director deletes own room", dirA.from("rooms").delete().eq("id", lab?.id).select("id"));

  // Leave nothing for the next suites.
  await dirA.from("subjects").delete().eq("school_id", A.id);
  await dirB.from("subjects").delete().eq("school_id", B.id);
  await dirA.from("rooms").delete().eq("school_id", A.id);
}
