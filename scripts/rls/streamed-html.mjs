// A streamed page's HTML as the browser ends up with it. React can cut a page
// anywhere, even inside a table row: the rest comes later as a hidden segment
// (<div hidden id="S:n">, <table hidden><tr id="S:n">, ...) that a script moves
// into its placeholder (<template id="P:n">, or B:n for a Suspense boundary).
// Where the cut falls depends on timing and page size, so checks that slice a
// row or a cell out of raw HTML pass or fail at random. Run them on this.

// The wrappers React writes around a segment, by insertion context.
const WRAPPERS = [
  { open: '<div hidden id="', tag: "div", close: "</div>" },
  { open: '<table hidden><tbody id="', tag: "tbody", close: "</tbody></table>" },
  { open: '<table hidden><tr id="', tag: "tr", close: "</tr></table>" },
  { open: '<table hidden><colgroup id="', tag: "colgroup", close: "</colgroup></table>" },
  { open: '<table hidden id="', tag: "table", close: "</table>" },
  { open: '<svg aria-hidden="true" style="display:none" id="', tag: "svg", close: "</svg>" },
  { open: '<math aria-hidden="true" style="display:none" id="', tag: "math", close: "</math>" },
];

// Index of the "</tag>" closing the element whose content starts at `from`.
function closingIndex(html, tag, from) {
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

// The first segment in the document: its id, inner HTML and full extent.
function firstSegment(html) {
  let best = null;
  for (const w of WRAPPERS) {
    let at = html.indexOf(w.open);
    while (at !== -1) {
      const idStart = at + w.open.length;
      const idEnd = html.indexOf('"', idStart);
      const id = html.slice(idStart, idEnd);
      if (/^S:[0-9a-z]+$/.test(id)) {
        if (!best || at < best.start) {
          const innerStart = html.indexOf(">", idEnd) + 1;
          const innerEnd = closingIndex(html, w.tag, innerStart);
          if (innerEnd !== -1) {
            best = { id, start: at, end: innerEnd + w.close.length, inner: html.slice(innerStart, innerEnd) };
          }
        }
        break;
      }
      at = html.indexOf(w.open, at + 1);
    }
  }
  return best;
}

export function resolveStreamed(html) {
  let out = html;
  for (let guard = 0; guard < 10_000; guard++) {
    const seg = firstSegment(out);
    if (!seg) return out;
    const n = seg.id.slice(2);
    out = out.slice(0, seg.start) + out.slice(seg.end);
    // $RS("S:n","P:n") fills a placeholder; $RC("B:x","S:n") completes a Suspense boundary.
    const boundary = out.match(new RegExp(`\\$RC\\("(B:[0-9a-z]+)","S:${n}"\\)`))?.[1];
    const placeholder = `<template id="${boundary ?? `P:${n}`}"></template>`;
    const at = out.indexOf(placeholder);
    if (at !== -1) out = out.slice(0, at) + seg.inner + out.slice(at + placeholder.length);
  }
  throw new Error("resolveStreamed: too many segments");
}
