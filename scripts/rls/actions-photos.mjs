// Phase 5 step 2 Server Actions (student photos), called over HTTP as real
// users on the page that registers them. Files are uploaded first with the
// user's own session, like the browser does.
import { randomUUID } from "node:crypto";

import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin, signIn } from "./fixtures.mjs";

const BUCKET = "student-photos";
const FILE = "src/lib/students/photo-actions.ts";
const PAGE = "/fr/students";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export async function photoActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const ids = {
    setStudentPhoto: { id: actionId(FILE, "setStudentPhoto"), path: PAGE },
    removeStudentPhoto: { id: actionId(FILE, "removeStudentPhoto"), path: PAGE },
    deleteStudent: { id: actionId("src/lib/students/student-actions.ts", "deleteStudent"), path: PAGE },
  };
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);
  const call = (who, action, ...args) => callAction(baseUrl, { ...ids[action], args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P5 action] ${label}`, got === wanted, got);
    return r;
  };

  const dirA = await signIn(fx.users.dirA);
  const { data: kid, error } = await admin
    .from("students")
    .insert({ school_id: A.id, first_name: "Photo", last_name: "ACTIONS", birth_date: "2014-01-01", gender: "male" })
    .select("id")
    .single();
  if (error) throw new Error(`photoActions setup (${error.code})`);
  const newPath = (ext = "webp") => `${A.id}/${kid.id}/${randomUUID()}.${ext}`;
  const upload = async (p) => {
    const r = await dirA.storage.from(BUCKET).upload(p, PNG, { contentType: "image/png" });
    if (r.error) throw new Error(`photoActions upload (${r.error.message})`);
    return p;
  };
  const photoPath = async () => (await admin.from("students").select("photo_path").eq("id", kid.id).single()).data?.photo_path;
  const exists = async (p) => {
    const { data } = await admin.storage.from(BUCKET).list(`${A.id}/${kid.id}`);
    return (data ?? []).some((o) => `${A.id}/${kid.id}/${o.name}` === p);
  };

  const first = await upload(newPath());
  await expect("surveillant cannot set a photo", call("survA", "setStudentPhoto", kid.id, first), "forbidden");
  await expect("director B cannot set school A's photo", call("dirB", "setStudentPhoto", kid.id, first), "photoUpload");
  await expect("a path outside the student's folder is refused",
    call("dirA", "setStudentPhoto", kid.id, `${A.id}/${randomUUID()}/${randomUUID()}.webp`), "photoUpload");
  await expect("director sets the uploaded photo", call("dirA", "setStudentPhoto", kid.id, first), "ok");
  check("[P5 action] …saved on the student", (await photoPath()) === first, "");

  await expect("a path that was never uploaded is refused",
    call("dirA", "setStudentPhoto", kid.id, newPath()), "photoUpload");
  check("[P5 action] …and the current photo is kept", (await photoPath()) === first && (await exists(first)), "");

  const second = await upload(newPath());
  await expect("director replaces the photo", call("dirA", "setStudentPhoto", kid.id, second), "ok");
  check("[P5 action] …the new one is saved, the old file deleted",
    (await photoPath()) === second && !(await exists(first)) && (await exists(second)), "");

  await expect("surveillant cannot remove a photo", call("survA", "removeStudentPhoto", kid.id), "forbidden");
  await expect("director removes the photo", call("dirA", "removeStudentPhoto", kid.id), "ok");
  check("[P5 action] …no photo, file deleted", (await photoPath()) === null && !(await exists(second)), "");

  const third = await upload(newPath());
  await call("dirA", "setStudentPhoto", kid.id, third);
  await expect("director deletes the student", call("dirA", "deleteStudent", kid.id), "ok");
  check("[P5 action] …and the photo file goes with them", !(await exists(third)), "");

  // Leave nothing for the next suites.
  const { data: left } = await admin.storage.from(BUCKET).list(`${A.id}/${kid.id}`);
  if (left?.length) await admin.storage.from(BUCKET).remove(left.map((o) => `${A.id}/${kid.id}/${o.name}`));
  await admin.from("students").delete().eq("id", kid.id);
}
