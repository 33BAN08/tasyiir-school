// Phase 4 step 4 Server Actions (subjects, Moroccan subjects template, rooms),
// called over HTTP as real users, each on the page that registers it.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

// file → [page that registers its actions, action names]
const ACTIONS = {
  "src/lib/structure/subject-actions.ts": [
    "/fr/setup/subjects",
    ["createSubject", "updateSubject", "deleteSubject", "applySubjectTemplate"],
  ],
  "src/lib/structure/room-actions.ts": ["/fr/setup/rooms", ["createRoom", "updateRoom", "deleteRoom"]],
};

export async function subjectActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(
    Object.entries(ACTIONS).flatMap(([file, [path, names]]) => names.map((n) => [n, { id: actionId(file, n), path }])),
  );
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const call = (who, action, ...args) => callAction(baseUrl, { ...ids[action], args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P4 action] ${label}`, got === wanted, got);
    return r;
  };
  const subjectsOf = async (schoolId) =>
    (await admin.from("subjects").select("id, name, code, color").eq("school_id", schoolId)).data ?? [];

  // --- Template -------------------------------------------------------------------
  await expect("surveillant cannot apply the subjects template",
    call("survA", "applySubjectTemplate", ["math"], "fr"), "forbidden");
  await expect("unknown UI language is refused", call("dirA", "applySubjectTemplate", ["math"], "de"), "generic");

  // A school subject already using the code "Art": it counts as that template subject.
  await admin.from("subjects").insert({ school_id: A.id, name: "Atelier", code: "Art" });
  const applied = await expect("director applies part of the template (fr)",
    call("dirA", "applySubjectTemplate", ["arabic", "math", "physics", "art"], "fr"), "ok");
  check("[P4 action] …3 subjects created (Art is already there)",
    applied.ok && applied.data.created === 3, JSON.stringify(applied.data ?? {}));
  const afterFr = await subjectsOf(A.id);
  const math = afterFr.find((s) => s.name === "Mathématiques");
  check("[P4 action] …named in French, with code and colour", math?.code === "Math" && math?.color === "red", "");
  check("[P4 action] …a template subject whose code is used is not created again",
    !afterFr.some((s) => s.name === "Éducation artistique"), "");
  check("[P4 action] …unpicked subjects are not created", !afterFr.some((s) => s.name === "Anglais"), "");

  const again = await expect("re-applying from the Arabic UI", call("dirA", "applySubjectTemplate", ["math", "english"], "ar"), "ok");
  check("[P4 action] …creates only the missing one, named in Arabic",
    again.ok && again.data.created === 1 && (await subjectsOf(A.id)).some((s) => s.name === "اللغة الإنجليزية"),
    JSON.stringify(again.data ?? {}));
  await admin.from("subjects").update({ name: "Maths" }).eq("id", math?.id);
  const renamed = await expect("a renamed template subject", call("dirA", "applySubjectTemplate", ["math"], "fr"), "ok");
  check("[P4 action] …is still found by its code", renamed.ok && renamed.data.created === 0, "");

  // --- Subjects -------------------------------------------------------------------
  const created = await expect("director creates a subject",
    call("dirA", "createSubject", { name: "Théâtre", code: "Th", color: "pink" }), "ok");
  const theatre = created.ok ? created.data.id : null;
  await expect("duplicate name (any case) → subjectNameTaken",
    call("dirA", "createSubject", { name: "théâtre", code: "", color: "pink" }), "subjectNameTaken");
  await expect("duplicate code (any case) → subjectCodeTaken",
    call("dirA", "createSubject", { name: "Thèmes", code: "TH", color: "pink" }), "subjectCodeTaken");
  await expect("code over 6 characters → codeTooLong",
    call("dirA", "createSubject", { name: "X", code: "ABCDEFG", color: "pink" }), "codeTooLong");
  await expect("colour outside the palette → colorRequired",
    call("dirA", "createSubject", { name: "X", code: "", color: "#ff0000" }), "colorRequired");
  await expect("surveillant cannot create a subject",
    call("survA", "createSubject", { name: "X", code: "", color: "teal" }), "forbidden");
  await expect("director edits a subject and clears its code",
    call("dirA", "updateSubject", theatre, { name: "Théâtre", code: "", color: "amber" }), "ok");
  check("[P4 action] …empty code is stored as null",
    (await subjectsOf(A.id)).find((s) => s.id === theatre)?.code === null, "");
  await expect("director B cannot edit school A's subject",
    call("dirB", "updateSubject", theatre, { name: "x", code: "", color: "teal" }), "notFound");
  await expect("director B cannot delete school A's subject", call("dirB", "deleteSubject", theatre), "notFound");
  await expect("director deletes a subject", call("dirA", "deleteSubject", theatre), "ok");

  // --- Rooms ----------------------------------------------------------------------
  const room = await expect("director creates a room",
    call("dirA", "createRoom", { name: "Salle 12", capacity: "32", roomType: "classroom" }), "ok");
  const roomId = room.ok ? room.data.id : null;
  await expect("duplicate room name (any case) → roomNameTaken",
    call("dirA", "createRoom", { name: "salle 12", capacity: 30, roomType: "" }), "roomNameTaken");
  await expect("capacity 0 → capacityRange",
    call("dirA", "createRoom", { name: "Salle 0", capacity: "0", roomType: "" }), "capacityRange");
  await expect("capacity 2.5 → capacityRange",
    call("dirA", "createRoom", { name: "Salle 0", capacity: "2.5", roomType: "" }), "capacityRange");
  await expect("unknown room type is refused",
    call("dirA", "createRoom", { name: "Piscine", capacity: 30, roomType: "pool" }), "generic");
  await expect("surveillant cannot create a room",
    call("survA", "createRoom", { name: "X", capacity: 30, roomType: "" }), "forbidden");
  await expect("director edits a room and removes its type",
    call("dirA", "updateRoom", roomId, { name: "Salle 12", capacity: 28, roomType: "" }), "ok");
  const stored = (await admin.from("rooms").select("capacity, room_type").eq("id", roomId).single()).data;
  check("[P4 action] …capacity 28, no type", stored?.capacity === 28 && stored?.room_type === null, "");
  await expect("director B cannot edit school A's room",
    call("dirB", "updateRoom", roomId, { name: "x", capacity: 1, roomType: "" }), "notFound");
  await expect("director B cannot delete school A's room", call("dirB", "deleteRoom", roomId), "notFound");
  await expect("director deletes a room", call("dirA", "deleteRoom", roomId), "ok");

  // Leave nothing for the next suites.
  await admin.from("subjects").delete().in("school_id", [A.id, B.id]);
  await admin.from("rooms").delete().in("school_id", [A.id, B.id]);
}
