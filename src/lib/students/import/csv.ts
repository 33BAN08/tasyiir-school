// CSV files for the student import: bytes → text → rows of cells.
//
// Encodings met in Moroccan schools: UTF-8 (with or without BOM, from Google
// Sheets, LibreOffice or "CSV UTF-8" in Excel), UTF-16 ("Unicode text") and
// Windows-1256 (the old Arabic Windows code page: "CSV" saved by Excel on an
// Arabic Windows). Valid UTF-8 is never mistaken for Windows-1256: a strict
// UTF-8 decode is tried first and only a decode error falls back.
//
// Separator: Excel in French uses ";", others ",", "Unicode text" uses tabs —
// whichever is most frequent in the header line, outside quotes.

export type CsvEncoding = "utf-8" | "utf-16le" | "utf-16be" | "windows-1256";

export function decodeCsv(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "utf-16le" };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1256").decode(bytes), encoding: "windows-1256" };
  }
}

function detectSeparator(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const counts = new Map<string, number>([[";", 0], [",", 0], ["\t", 0]]);
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
  }
  const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ",";
}

/** RFC 4180: quoted fields may hold separators, newlines and "" (one quote). Blank lines are kept (line numbers stay right). */
export function parseCsv(text: string): string[][] {
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === sep) {
      endField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}
