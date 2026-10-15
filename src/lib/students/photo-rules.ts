// Student photos: shared by the browser (resize + upload) and the Server
// Actions (path check). Storage rules: migration phase5_student_photos.

export const PHOTO_BUCKET = "student-photos";

/** Stored photos are square, at most this many pixels per side. */
export const PHOTO_SIZE = 512;

/** Signed URLs live 5 minutes. */
export const PHOTO_URL_SECONDS = 300;

/** Files the user may pick. They are re-encoded in the browser before upload. */
export const PHOTO_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Largest file the user may pick (phone photos are often 3–6 MB). What is
 * stored is the 512 px version, far below the bucket's 2 MB limit.
 */
export const PHOTO_SOURCE_MAX_BYTES = 10 * 1024 * 1024;

export type PhotoExtension = "webp" | "jpg";

/** `<school>/<student>/<uuid>.<ext>`: the only shape students.photo_path accepts. */
export function photoPath(schoolId: string, studentId: string, fileId: string, ext: PhotoExtension): string {
  return `${schoolId}/${studentId}/${fileId}.${ext}`;
}

export function isPhotoPathOf(path: string, schoolId: string, studentId: string): boolean {
  const prefix = `${schoolId}/${studentId}/`;
  return path.startsWith(prefix) && /^[0-9a-f-]{36}\.(webp|jpg|png)$/.test(path.slice(prefix.length));
}
