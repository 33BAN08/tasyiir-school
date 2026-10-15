// Phase 5 step 2: student photos in the private Storage bucket (policies on
// storage.objects). Path <school>/<student>/<uuid>.<ext>. Upload: own school's
// folder + students.manage + an existing student. Read / signed URL: only the
// student's CURRENT photo, for who may see that student. Bucket: 2 MB,
// jpg / png / webp.
import { randomUUID } from "node:crypto";

import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const BUCKET = "student-photos";
// 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

export async function phase5Photos({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const { anon, dirA, survA, tchA, mgrA, dirB, owner } = as;

  const student = async (client, schoolId, lastName) => {
    const { data, error } = await client
      .from("students")
      .insert({ school_id: schoolId, first_name: "Photo", last_name: lastName, birth_date: "2014-01-01", gender: "female" })
      .select("id")
      .single();
    if (error) throw new Error(`phase5Photos setup: student (${error.code})`);
    return data.id;
  };
  const kidA = await student(dirA, A.id, "PHOTOA");
  const kidB = await student(dirB, B.id, "PHOTOB");
  const path = (schoolId, studentId, ext = "png") => `${schoolId}/${studentId}/${randomUUID()}.${ext}`;
  const upload = (client, p, body = PNG, type = "image/png") =>
    client.storage.from(BUCKET).upload(p, body, { contentType: type });
  const sign = (client, p) => client.storage.from(BUCKET).createSignedUrl(p, 60);
  const exists = async (p) => {
    const [folder, file] = [p.slice(0, p.lastIndexOf("/")), p.slice(p.lastIndexOf("/") + 1)];
    const { data } = await admin.storage.from(BUCKET).list(folder, { search: file });
    return (data ?? []).some((o) => o.name === file);
  };
  const ok = (label, r) => check(`[P5 photo] ${label}`, !r.error, r.error ? `${r.error.statusCode} ${r.error.message}` : "ok");
  const refused = (label, r) => check(`[P5 photo] ${label}`, Boolean(r.error), r.error ? `refused (${r.error.statusCode})` : "ACCEPTED!");

  // --- Upload -----------------------------------------------------------------------
  const photoA = path(A.id, kidA);
  ok("director uploads a photo for own student", await upload(dirA, photoA));
  refused("the same file name cannot be overwritten", await upload(dirA, photoA));
  refused("director A cannot upload into school B's folder", await upload(dirA, path(B.id, kidB)));
  refused("director A cannot upload for a student of school B", await upload(dirA, path(A.id, kidB)));
  refused("director A cannot upload for an unknown student", await upload(dirA, path(A.id, randomUUID())));
  refused("surveillant (view only) cannot upload", await upload(survA, path(A.id, kidA)));
  refused("teacher cannot upload", await upload(tchA, path(A.id, kidA)));
  refused("platform owner cannot upload", await upload(owner, path(A.id, kidA)));
  refused("anonymous cannot upload", await upload(anon, path(A.id, kidA)));
  refused("a GIF is refused by the bucket", await upload(dirA, path(A.id, kidA), PNG, "image/gif"));
  refused("a file over 2 MB is refused by the bucket",
    await upload(dirA, path(A.id, kidA), Buffer.alloc(2 * 1024 * 1024 + 1), "image/png"));

  // --- Read: only the current photo -------------------------------------------------
  refused("a file that is no student's photo gets no signed URL (director)", await sign(dirA, photoA));
  const { error: setError } = await dirA.from("students").update({ photo_path: photoA }).eq("id", kidA);
  check("[P5 photo] director sets the student's photo", !setError, setError?.code ?? "ok");
  ok("director gets a signed URL for it", await sign(dirA, photoA));
  ok("surveillant (students.view) gets one", await sign(survA, photoA));
  refused("teacher gets none (Phase 6: own classes)", await sign(tchA, photoA));
  refused("staff without student permission gets none", await sign(mgrA, photoA));
  refused("director B gets none", await sign(dirB, photoA));
  refused("platform owner gets none", await sign(owner, photoA));
  refused("anonymous gets none", await sign(anon, photoA));
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(photoA).data.publicUrl;
  const viaPublic = await fetch(publicUrl);
  check("[P5 photo] the public URL does not serve it (private bucket)", !viaPublic.ok, `HTTP ${viaPublic.status}`);
  const signed = await sign(dirA, photoA);
  const viaSigned = signed.data ? await fetch(signed.data.signedUrl) : null;
  check("[P5 photo] the signed URL serves it", viaSigned?.ok === true, `HTTP ${viaSigned?.status}`);

  // --- photo_path must be the student's own folder ------------------------------------
  const { error: badPath } = await dirA.from("students").update({ photo_path: path(B.id, kidA) }).eq("id", kidA);
  check("[P5 photo] a photo path outside the student's folder is refused", badPath?.code === "23514", badPath?.code ?? "ACCEPTED!");

  // --- Delete -------------------------------------------------------------------------
  await dirB.storage.from(BUCKET).remove([photoA]);
  check("[P5 photo] director B cannot delete school A's photo", await exists(photoA), "");
  await survA.storage.from(BUCKET).remove([photoA]);
  check("[P5 photo] surveillant cannot delete a photo", await exists(photoA), "");
  await dirA.storage.from(BUCKET).remove([photoA]);
  check("[P5 photo] director deletes own school's current photo", !(await exists(photoA)), "");

  // Leave nothing for the next suites.
  const { data: leftovers } = await admin.storage.from(BUCKET).list(`${A.id}/${kidA}`);
  if (leftovers?.length) await admin.storage.from(BUCKET).remove(leftovers.map((o) => `${A.id}/${kidA}/${o.name}`));
  await dirA.from("students").delete().eq("id", kidA);
  await dirB.from("students").delete().eq("id", kidB);
}
