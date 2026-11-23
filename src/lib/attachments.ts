/** Pure rules for Brain chat attachments (no I/O) — shared by browser, server and tests. */

export const ATTACH_LIMITS = {
  maxBytes: 15 * 1024 * 1024,   // storage bucket limit
  maxFilesPerMessage: 5,
  maxPdfPages: 100,             // pages read per PDF
  maxStoredChars: 400_000,      // extracted text kept per file
  maxCharsPerTurn: 40_000,      // attachment text handed to the model in one turn
  maxCharsPerExtraction: 60_000,// text analysed for one reviewable batch
  maxSheetRows: 2_000,
  staleProcessingMs: 3 * 60_000,
} as const;

export type AttachFormat = "pdf" | "text" | "markdown" | "eml" | "docx" | "csv" | "xlsx" | "xls" | "image";
export type AttachStatus = "uploading" | "processing" | "ready" | "partial" | "failed";
export type Segment = { ref: string; start: number; end: number };

const EXT: Record<string, AttachFormat> = { pdf: "pdf", txt: "text", md: "markdown", markdown: "markdown", eml: "eml", docx: "docx", csv: "csv", xlsx: "xlsx", xls: "xls", png: "image", jpg: "image", jpeg: "image", webp: "image" };
export const ACCEPT = ".pdf,.txt,.md,.eml,.docx,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp";

export function formatFromName(name: string): AttachFormat | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EXT[ext] ?? null;
}

const starts = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
/** Checks the real content type (magic bytes) against the extension. Returns an error text or null. */
export function verifyMagic(format: AttachFormat, b: Uint8Array): string | null {
  const zip = starts(b, [0x50, 0x4b, 0x03, 0x04]);
  const cfb = starts(b, [0xd0, 0xcf, 0x11, 0xe0]);
  switch (format) {
    case "pdf": return starts(b, [0x25, 0x50, 0x44, 0x46]) ? null : "El archivo no es un PDF real.";
    case "docx": return zip ? null : cfb ? "protected" : "El archivo no es un DOCX real.";
    case "xlsx": return zip ? null : cfb ? "protected" : "El archivo no es un XLSX real.";
    case "xls": return cfb ? null : "El archivo no es un XLS real.";
    case "image": return starts(b, [0x89, 0x50, 0x4e, 0x47]) || starts(b, [0xff, 0xd8, 0xff]) || (starts(b, [0x52, 0x49, 0x46, 0x46]) && b[8] === 0x57) ? null : "La imagen no tiene un formato válido.";
    default: {
      // Text-like: no NUL bytes in the first 8 KB and valid UTF-8.
      const head = b.subarray(0, 8192);
      if (head.includes(0)) return "El archivo parece binario, no texto.";
      try { new TextDecoder("utf-8", { fatal: true }).decode(b); return null; } catch { return "El texto no está en UTF-8 legible."; }
    }
  }
}

/** Client-side checks before upload: count, size, known extension. */
export function precheck(files: { name: string; size: number }[], already: number): string | null {
  if (files.length + already > ATTACH_LIMITS.maxFilesPerMessage) return `Máximo ${ATTACH_LIMITS.maxFilesPerMessage} archivos por mensaje.`;
  for (const f of files) {
    if (!formatFromName(f.name)) return `${f.name}: formato no admitido (PDF, TXT, MD, EML, DOCX, CSV, XLSX, XLS o imagen).`;
    if (f.size <= 0) return `${f.name} está vacío.`;
    if (f.size > ATTACH_LIMITS.maxBytes) return `${f.name} supera 15 MB.`;
  }
  return null;
}

/** Builds text with explicit fragment markers and their offsets. */
export function joinSegments(parts: { ref: string; text: string }[], cap: number = ATTACH_LIMITS.maxStoredChars): { text: string; segments: Segment[]; truncatedAt: string | null } {
  let text = ""; const segments: Segment[] = []; let truncatedAt: string | null = null;
  for (const p of parts) {
    const body = p.text.trim(); if (!body) continue;
    const head = `[${p.ref}]\n`;
    if (text.length + head.length + body.length > cap) { truncatedAt = p.ref; break; }
    const start = text.length + head.length;
    text += head + body + "\n\n";
    segments.push({ ref: p.ref, start, end: start + body.length });
  }
  return { text, segments, truncatedAt };
}

/** Fragment reference (page, sheet+row, paragraph) where a quote appears, or null if it doesn't appear verbatim. */
export function refForQuote(text: string, segments: Segment[], quote: string | null | undefined): string | null {
  if (!quote) return null;
  const n = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  const q = n(quote).trim(); if (!q) return null;
  for (const s of segments) if (n(text.slice(s.start, s.end)).includes(q)) return s.ref;
  return null;
}

/** Human label of what was read, never claiming more than was processed. */
export function readSummary(a: { format: string; status: string; read_condition: string | null; pages_total: number | null; pages_read: number | null; limitation: string | null }): string {
  const S: Record<string, string> = { uploading: "cargando", processing: "procesando", ready: "listo", partial: "parcialmente procesado", failed: "no se pudo leer" };
  const C: Record<string, string> = { scanned: "PDF escaneado (sin texto)", mixed: "PDF con páginas escaneadas", protected: "protegido con contraseña", unreadable: "ilegible", unsupported: "formato sin lectura disponible" };
  const bits = [S[a.status] ?? a.status];
  if (a.pages_total) bits.push(`${a.pages_read ?? 0} de ${a.pages_total} ${a.format === "pdf" ? "páginas leídas" : "fragmentos leídos"}`);
  if (a.read_condition && C[a.read_condition]) bits.push(C[a.read_condition]!);
  return bits.join(" · ");
}

/** Wraps an attachment for the model: content is data, never instructions. */
export function attachmentForModel(a: { id: string; file_name: string; status: string; read_condition: string | null; pages_total: number | null; pages_read: number | null; limitation: string | null; extracted_text: string | null; format: string }, budget: number): { block: string; used: number } {
  const text = a.extracted_text ?? "";
  const shown = text.slice(0, Math.max(0, budget));
  const cut = shown.length < text.length;
  const lim = [a.limitation, cut ? `Se te muestran ${shown.length} de ${text.length} caracteres; pedí el resto con read_attachment (desde el carácter ${shown.length}). No digas que analizaste el documento completo.` : null].filter(Boolean).join(" ");
  const block = `<adjunto id="${a.id}" nombre="${a.file_name.replace(/"/g, "'")}" estado="${readSummary(a)}"${lim ? ` limitacion="${lim.replace(/"/g, "'")}"` : ""}>\n${shown}\n</adjunto>`;
  return { block, used: shown.length };
}

/** "20 MW" — a number is only backed when it appears with its unit. A bare "20" elsewhere does not count. */
export function quantityStated(text: string, n: number, unit: "MW" | "MWh" | "h"): boolean {
  const vs = [...new Set([String(n), String(n).replace(".", ",")])].map((v) => v.replace(/\./g, "\\."));
  const u = unit === "MW" ? "(MW|megavatios?|megawatts?)(?!h)" : unit === "MWh" ? "(MWh|megavatios?[- ]hora|megawatt[- ]hours?)" : "(h|hs|horas?|hours?)\\b";
  return vs.some((v) => new RegExp(`(^|[^0-9.,])${v}\\s*${u}`, "i").test(text));
}

/** Spreadsheet → structured fragments with sheet + row refs, headers preserved. */
export function sheetFragments(sheets: Record<string, string[][]>, maxRows: number = ATTACH_LIMITS.maxSheetRows) {
  const parts: { ref: string; text: string }[] = []; const structure: { sheet: string; headers: string[]; rows: number; read: number }[] = [];
  for (const [name, grid] of Object.entries(sheets)) {
    const headers = (grid[0] ?? []).map((h) => String(h ?? "").trim());
    const body = grid.slice(1).filter((r) => r.some((c) => String(c ?? "").trim()));
    const read = Math.min(body.length, maxRows);
    structure.push({ sheet: name, headers, rows: body.length, read });
    parts.push({ ref: `Hoja ${name}, encabezados`, text: headers.join(" | ") });
    body.slice(0, read).forEach((r, i) => parts.push({ ref: `Hoja ${name}, fila ${i + 2}`, text: headers.map((h, j) => (String(r[j] ?? "").trim() ? `${h || `Col ${j + 1}`}: ${r[j]}` : "")).filter(Boolean).join("; ") }));
  }
  return { parts, structure };
}

/** Minimal RFC822 reader: keeps headers that matter and text/plain bodies (base64 / quoted-printable). */
export function parseEml(raw: string): { headers: Record<string, string>; body: string } {
  const [head = "", ...rest] = raw.replace(/\r\n/g, "\n").split(/\n\n/);
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\n[ \t]+/g, " ").split("\n")) { const m = /^([\w-]+):\s*(.*)$/.exec(line); if (m) headers[m[1]!.toLowerCase()] = m[2]!; }
  const body = rest.join("\n\n");
  const ct = headers["content-type"] ?? "";
  const b = /boundary="?([^";]+)"?/i.exec(ct)?.[1];
  const decode = (h: Record<string, string>, t: string) => {
    const enc = (h["content-transfer-encoding"] ?? "").toLowerCase();
    if (enc === "base64") { try { return new TextDecoder().decode(Uint8Array.from(atob(t.replace(/\s+/g, "")), (c) => c.charCodeAt(0))); } catch { return t; } }
    if (enc === "quoted-printable") { const bytes = t.replace(/=\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, x: string) => String.fromCharCode(parseInt(x, 16))); try { return new TextDecoder().decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0))); } catch { return bytes; } }
    return t;
  };
  if (!b) return { headers, body: decode(headers, body) };
  const texts: string[] = [];
  for (const part of body.split(`--${b}`)) {
    const p = parseEml(part.replace(/^\n/, ""));
    if (/text\/plain/i.test(p.headers["content-type"] ?? "") || (!p.headers["content-type"] && p.body.trim())) texts.push(decode(p.headers, p.body));
    else if (/multipart\//i.test(p.headers["content-type"] ?? "")) texts.push(p.body);
  }
  return { headers, body: texts.join("\n").trim() };
}

/** DOCX document.xml → paragraphs (no remote resources, no macros executed). */
export function docxParagraphs(xml: string): string[] {
  const ent = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  return xml.split(/<\/w:p>/).map((p) => ent(p.replace(/<w:tab\/>/g, "\t").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")).trim()).filter(Boolean);
}
