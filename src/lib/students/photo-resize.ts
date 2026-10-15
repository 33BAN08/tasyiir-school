// Browser only. Turns the picked file into the stored photo: a square of at
// most 512 px, re-encoded (WebP, or JPEG where the browser cannot write WebP).
// Re-encoding drops every metadata block of the original (EXIF, GPS position).

import { PHOTO_SIZE, PHOTO_SOURCE_MAX_BYTES, PHOTO_SOURCE_TYPES, type PhotoExtension } from "./photo-rules";

export type PhotoError = "photoType" | "photoTooBig" | "photoUnreadable";

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

export async function toStudentPhoto(
  file: File,
): Promise<{ blob: Blob; ext: PhotoExtension } | { error: PhotoError }> {
  if (!(PHOTO_SOURCE_TYPES as readonly string[]).includes(file.type)) return { error: "photoType" };
  if (file.size > PHOTO_SOURCE_MAX_BYTES) return { error: "photoTooBig" };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the EXIF rotation
  } catch {
    return { error: "photoUnreadable" };
  }

  // Square crop, a little above the middle (faces are in the upper part of portraits).
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) * 0.3;
  const size = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")?.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const webp = await toBlob(canvas, "image/webp");
  if (webp?.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await toBlob(canvas, "image/jpeg");
  return jpeg ? { blob: jpeg, ext: "jpg" } : { error: "photoUnreadable" };
}
