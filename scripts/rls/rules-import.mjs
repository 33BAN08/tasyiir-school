// Unit checks of the student import's file reading (loaded with Node's type
// stripping): CSV encodings (Arabic must never come out garbled), separators,
// quotes, and headers recognised in every UI language.
import { check } from "./checks.mjs";

const { decodeCsv, parseCsv } = await import("../../src/lib/students/import/csv.ts");
const { columnOf } = await import("../../src/lib/students/import/columns.ts");

const ARABIC = "الإدريسي;سلمى";
const utf8 = new TextEncoder().encode(ARABIC);

// Windows-1256 bytes: invert the decoder (Node can only encode UTF-8).
const cp1256 = new Map();
const table = new TextDecoder("windows-1256").decode(Uint8Array.from({ length: 256 }, (_, i) => i));
[...table].forEach((ch, byte) => cp1256.set(ch, byte));
const win1256 = Uint8Array.from([...ARABIC].map((ch) => cp1256.get(ch)));

const withBom = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]);
const utf16 = Uint8Array.from([0xff, 0xfe, ...[...ARABIC].flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8])]);

for (const [label, bytes, encoding] of [
  ["UTF-8 without BOM", utf8, "utf-8"],
  ["UTF-8 with BOM (BOM removed)", withBom, "utf-8"],
  ["Windows-1256", win1256, "windows-1256"],
  ["UTF-16 (Excel \"Unicode text\")", utf16, "utf-16le"],
]) {
  const decoded = decodeCsv(bytes);
  check(`[P5 import rule] CSV ${label} → Arabic intact`, decoded.text === ARABIC && decoded.encoding === encoding,
    `${decoded.encoding} ${JSON.stringify(decoded.text)}`);
}
// Plain Latin text is valid UTF-8 too: never mistaken for Windows-1256.
check("[P5 import rule] Latin-only CSV stays UTF-8", decodeCsv(new TextEncoder().encode("Nom;Prénom")).encoding === "utf-8", "");

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check("[P5 import rule] \";\" separator (Excel in French)",
  same(parseCsv("Nom;Prénom\r\nBenali;Amine\r\n"), [["Nom", "Prénom"], ["Benali", "Amine"]]), JSON.stringify(parseCsv("Nom;Prénom\r\nBenali;Amine\r\n")));
check("[P5 import rule] \",\" separator", same(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]), "");
check("[P5 import rule] tab separator", same(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]), "");
const quoted = parseCsv('Nom;Note\n"El Idrissi; Salma";"dit ""Sami""\nsur 2 lignes"\n');
check("[P5 import rule] quotes keep separators, \"\" and line breaks",
  same(quoted, [["Nom", "Note"], ["El Idrissi; Salma", 'dit "Sami"\nsur 2 lignes']]), JSON.stringify(quoted));
check("[P5 import rule] a blank line is kept (line numbers stay right)",
  parseCsv("a;b\n\n1;2").length === 3, String(parseCsv("a;b\n\n1;2").length));

for (const [header, column] of [
  ["Nom (latin)", "lastName"],
  ["NOM", "lastName"],
  ["Prénom", "firstName"],
  ["Nom (arabe)", "lastNameAr"],
  ["Date de naissance (jj/mm/aaaa)", "birthDate"],
  ["date naissance", "birthDate"],
  ["تاريخ الازدياد", "birthDate"],
  ["الاسم (بالعربية)", "firstNameAr"],
  ["Code Massar", "codeMassar"],
  ["رمز مسار", "codeMassar"],
  ["Classe", "className"],
  ["القسم", "className"],
  ["Gender (M/F)", "gender"],
  ["Téléphone du parent", "parentPhone"],
  ["صلة القرابة (أب/أم/ولي)", "parentRelation"],
  ["Lien", "parentRelation"],
  ["Remarques", null],
]) {
  check(`[P5 import rule] header "${header}" → ${column}`, columnOf(header) === column, String(columnOf(header)));
}
