// Browser only. Turns the picked file into what is uploaded: a PDF as it is
// (5 MB at most), a photo re-encoded to WebP (JPEG where the browser cannot
// write WebP) with its longest side at most 2000 px. Re-encoding drops every
// metadata block of the original (EXIF, GPS position).

import {
  JUSTIFICATION_FILE_TYPES,
  JUSTIFICATION_IMAGE_SIDE,
  JUSTIFICATION_MAX_BYTES,
  JUSTIFICATION_SOURCE_MAX_BYTES,
  type JustificationExtension,
} from "./rules";

export type FileError = "fileType" | "fileTooBig" | "fileUnreadable";

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

export async function prepareJustificationFile(
  file: File,
): Promise<{ blob: Blob; ext: JustificationExtension } | { error: FileError }> {
  if (!(JUSTIFICATION_FILE_TYPES as readonly string[]).includes(file.type)) return { error: "fileType" };
  if (file.type === "application/pdf") {
    return file.size > JUSTIFICATION_MAX_BYTES ? { error: "fileTooBig" } : { blob: file, ext: "pdf" };
  }
  if (file.size > JUSTIFICATION_SOURCE_MAX_BYTES) return { error: "fileTooBig" };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // applies the EXIF rotation
  } catch {
    return { error: "fileUnreadable" };
  }
  const scale = Math.min(1, JUSTIFICATION_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const webp = await toBlob(canvas, "image/webp");
  const out = webp?.type === "image/webp" ? { blob: webp, ext: "webp" as const } : null;
  const result = out ?? ((b) => (b ? { blob: b, ext: "jpg" as const } : null))(await toBlob(canvas, "image/jpeg"));
  if (!result) return { error: "fileUnreadable" };
  return result.blob.size > JUSTIFICATION_MAX_BYTES ? { error: "fileTooBig" } : result;
}
