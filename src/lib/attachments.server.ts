/** Server-side text extraction for chat attachments. Never executes content or loads remote resources. */
import { ATTACH_LIMITS, docxParagraphs, joinSegments, parseEml, sheetFragments, verifyMagic, type AttachFormat, type Segment } from "@/lib/attachments";

export type Extracted = {
  status: "ready" | "partial" | "failed";
  read_condition: "text" | "scanned" | "mixed" | "protected" | "unreadable" | "unsupported";
  pages_total: number | null; pages_read: number | null;
  text: string; segments: Segment[]; structure: unknown; limitation: string | null; error: string | null;
};

const fail = (read_condition: Extracted["read_condition"], limitation: string, error: string | null = null): Extracted =>
  ({ status: "failed", read_condition, pages_total: null, pages_read: null, text: "", segments: [], structure: null, limitation, error });

export async function extractAttachment(format: AttachFormat, bytes: Uint8Array): Promise<Extracted> {
  const magic = verifyMagic(format, bytes);
  if (magic === "protected") return fail("protected", "El archivo está protegido o cifrado; no se pudo leer. Exportalo sin contraseña.");
  if (magic) return fail("unreadable", magic);
  try {
    switch (format) {
      case "pdf": return await pdf(bytes);
      case "text": case "markdown": return fromParts(splitParagraphs(new TextDecoder().decode(bytes)), "Párrafo");
      case "eml": {
        const { headers, body } = parseEml(new TextDecoder().decode(bytes));
        const head = ["from", "to", "cc", "date", "subject"].filter((k) => headers[k]).map((k) => `${k}: ${headers[k]}`).join("\n");
        const r = fromParts([{ ref: "Encabezado", text: head }, ...splitParagraphs(body)], "Párrafo");
        if (!body.trim()) return { ...r, status: "partial", limitation: "El email no tiene cuerpo de texto plano legible (solo HTML o adjuntos); se leyeron los encabezados." };
        return r;
      }
      case "docx": {
        const { unzipSync, strFromU8 } = await import("fflate");
        const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
        const xml = files["word/document.xml"]; if (!xml) return fail("unreadable", "El DOCX no tiene documento legible.");
        return fromParts(docxParagraphs(strFromU8(xml)).map((t, i) => ({ ref: `Párrafo ${i + 1}`, text: t })), "Párrafo");
      }
      case "csv": {
        const { parseDelimited } = await import("@/lib/ivlp-import");
        const { rows, error } = parseDelimited(new TextDecoder().decode(bytes));
        if (error) return fail("unreadable", error);
        return sheet({ CSV: rows });
      }
      case "xlsx": case "xls": {
        const XLSX = await import("xlsx");
        let wb; try { wb = XLSX.read(bytes, { cellDates: true }); } catch (e) { return /password|encrypt/i.test(String(e)) ? fail("protected", "La planilla está protegida con contraseña.") : fail("unreadable", "La planilla no se pudo abrir."); }
        const sheets: Record<string, string[][]> = {};
        for (const n of wb.SheetNames) sheets[n] = (XLSX.utils.sheet_to_json<string[]>(wb.Sheets[n]!, { header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "" }) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
        return sheet(sheets);
      }
      case "image": return fail("unsupported", "Las imágenes y documentos escaneados requieren OCR, que todavía no está disponible en el Brain. No se leyó su contenido; pegá el texto o subí un PDF con texto.");
    }
  } catch (e) {
    return fail("unreadable", "No se pudo leer el archivo.", (e as Error).message.slice(0, 300));
  }
}

function splitParagraphs(t: string) {
  return t.replace(/\r\n/g, "\n").split(/\n{2,}/).map((x, i) => ({ ref: `Párrafo ${i + 1}`, text: x }));
}

function fromParts(parts: { ref: string; text: string }[], unit: string): Extracted {
  const total = parts.filter((p) => p.text.trim()).length;
  const j = joinSegments(parts);
  if (!j.text.trim()) return fail("unreadable", "El archivo no tiene texto legible.");
  const read = j.segments.length;
  const partial = read < total;
  return { status: partial ? "partial" : "ready", read_condition: "text", pages_total: total, pages_read: read, text: j.text, segments: j.segments, structure: null,
    limitation: partial ? `Documento largo: se guardaron ${read} de ${total} ${unit.toLowerCase()}s (hasta ${j.truncatedAt ? `antes de ${j.truncatedAt}` : "el límite"}).` : null, error: null };
}

function sheet(sheets: Record<string, string[][]>): Extracted {
  const { parts, structure } = sheetFragments(sheets);
  const j = joinSegments(parts);
  const cut = structure.some((s) => s.read < s.rows) || j.truncatedAt;
  const rows = structure.reduce((n, s) => n + s.rows, 0);
  if (!rows) return fail("unreadable", "La planilla no tiene filas con datos.");
  return { status: cut ? "partial" : "ready", read_condition: "text", pages_total: rows, pages_read: Math.max(0, j.segments.length - structure.length), text: j.text, segments: j.segments,
    structure: { sheets: structure }, limitation: cut ? `Planilla grande: se leyeron las primeras ${ATTACH_LIMITS.maxSheetRows} filas por hoja. Para importar contactos usá «Revisar mapeo e importar».` : null, error: null };
}

async function pdf(bytes: Uint8Array): Promise<Extracted> {
  const { getDocumentProxy } = await import("unpdf");
  let doc;
  try { doc = await getDocumentProxy(new Uint8Array(bytes)); }
  catch (e) {
    const msg = String((e as Error)?.name ?? "") + String((e as Error)?.message ?? "");
    if (/password/i.test(msg)) return fail("protected", "El PDF está protegido con contraseña; no se pudo leer.");
    return fail("unreadable", "El PDF está dañado o no se pudo abrir.", msg.slice(0, 300));
  }
  const total = doc.numPages; const limit = Math.min(total, ATTACH_LIMITS.maxPdfPages);
  const parts: { ref: string; text: string }[] = []; const empty: number[] = [];
  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const t = (tc.items as { str?: string; hasEOL?: boolean }[]).map((x) => (x.str ?? "") + (x.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+/g, " ").trim();
    if (t.replace(/\s/g, "").length < 20) empty.push(i); else parts.push({ ref: `p. ${i}`, text: t });
  }
  if (!parts.length) return { ...fail("scanned", `PDF escaneado: ninguna de las ${limit} páginas tiene texto seleccionable. Requiere OCR, que todavía no está disponible; no se leyó su contenido.`), pages_total: total, pages_read: 0 };
  const j = joinSegments(parts);
  const readPages = j.segments.length;
  const notes: string[] = [];
  if (empty.length) notes.push(`Páginas sin texto (posible escaneo, no leídas): ${compact(empty)}.`);
  if (total > limit) notes.push(`Se leyeron las primeras ${limit} de ${total} páginas.`);
  if (j.truncatedAt) notes.push(`Texto muy largo: se guardó hasta antes de ${j.truncatedAt}.`);
  return { status: notes.length ? "partial" : "ready", read_condition: empty.length ? "mixed" : "text", pages_total: total, pages_read: readPages, text: j.text, segments: j.segments, structure: null, limitation: notes.join(" ") || null, error: null };
}

function compact(n: number[]): string {
  const out: string[] = []; let s = n[0]!; let p = s;
  for (const x of [...n.slice(1), Infinity]) { if (x === p + 1) { p = x; continue; } out.push(s === p ? `${s}` : `${s}–${p}`); s = x; p = x; }
  return out.join(", ");
}
