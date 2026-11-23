import { describe, expect, it } from "vitest";
import { attachmentForModel, docxParagraphs, joinSegments, parseEml, precheck, quantityStated, refForQuote, sheetFragments, verifyMagic } from "@/lib/attachments";
import { extractAttachment } from "@/lib/attachments.server";
import { stripInventedNumbers } from "@/lib/chat-agent";
import { sanitizeProposals, type ProposalItem } from "@/lib/brain";

const enc = (s: string) => new TextEncoder().encode(s);
function pdfWith(pages: (string | null)[]) {
  // Minimal hand-built PDF; pdf.js rebuilds the xref table if offsets are off.
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  const kids: string[] = [];
  pages.forEach((t) => {
    const content = t ? `BT /F1 12 Tf 72 720 Td (${t}) Tj ET` : "";
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const cId = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${cId} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`);
    kids.push(`${objs.length} 0 R`);
  });
  objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let out = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return enc(out);
}

describe("adjuntos: tipo real y límites", () => {
  it("rechaza un PDF falso por contenido, no por extensión", () => {
    expect(verifyMagic("pdf", enc("hola"))).toMatch(/no es un PDF/);
    expect(verifyMagic("pdf", enc("%PDF-1.4"))).toBeNull();
  });
  it("no lee binarios como texto", () => {
    expect(verifyMagic("text", new Uint8Array([0x68, 0, 0x69]))).toMatch(/binario/);
  });
  it("DOCX cifrado (contenedor OLE) se marca protegido", () => {
    expect(verifyMagic("docx", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2]))).toBe("protected");
  });
  it("máximo 5 archivos y 15 MB", () => {
    expect(precheck([{ name: "a.pdf", size: 10 }], 5)).toMatch(/Máximo 5/);
    expect(precheck([{ name: "a.pdf", size: 16 * 1024 * 1024 }], 0)).toMatch(/15 MB/);
    expect(precheck([{ name: "a.exe", size: 10 }], 0)).toMatch(/no admitido/);
  });
});

describe("adjuntos: procedencia", () => {
  it("cada fragmento conserva su referencia y una cita se ubica en su página", () => {
    const j = joinSegments([{ ref: "p. 1", text: "Intro general" }, { ref: "p. 2", text: "Planta Norte necesita 20 MW de respaldo" }]);
    expect(refForQuote(j.text, j.segments, "necesita 20 MW")).toBe("p. 2");
    expect(refForQuote(j.text, j.segments, "texto inexistente")).toBeNull();
  });
  it("documento largo: no se trunca en silencio", () => {
    const j = joinSegments([{ ref: "p. 1", text: "a".repeat(50) }, { ref: "p. 2", text: "b".repeat(50) }], 70);
    expect(j.segments.map((s) => s.ref)).toEqual(["p. 1"]);
    expect(j.truncatedAt).toBe("p. 2");
    const m = attachmentForModel({ id: "x", file_name: "f.pdf", format: "pdf", status: "ready", read_condition: "text", pages_total: 2, pages_read: 2, limitation: null, extracted_text: "z".repeat(100) }, 40);
    expect(m.used).toBe(40);
    expect(m.block).toMatch(/No digas que analizaste el documento completo/);
  });
  it("planillas conservan encabezados y hoja/fila", () => {
    const { parts, structure } = sheetFragments({ Agenda: [["Nombre", "Email"], ["Ana", "ana@x.com"], ["", ""]] });
    expect(structure[0]).toEqual({ sheet: "Agenda", headers: ["Nombre", "Email"], rows: 1, read: 1 });
    expect(parts[1]).toEqual({ ref: "Hoja Agenda, fila 2", text: "Nombre: Ana; Email: ana@x.com" });
  });
  it("email: encabezados y cuerpo en base64", () => {
    const raw = `From: ana@x.com\nSubject: Planta\nContent-Transfer-Encoding: base64\n\n${btoa("Hola equipo")}`;
    const e = parseEml(raw);
    expect(e.headers["subject"]).toBe("Planta");
    expect(e.body).toBe("Hola equipo");
  });
  it("docx: párrafos sin etiquetas", () => {
    expect(docxParagraphs("<w:p><w:r><w:t>Hola &amp; chau</w:t></w:r></w:p><w:p><w:t>Dos</w:t></w:p>")).toEqual(["Hola & chau", "Dos"]);
  });
});

describe("adjuntos: PDF con texto vs escaneado", () => {
  it("PDF con texto: lee páginas con referencia", async () => {
    const r = await extractAttachment("pdf", pdfWith(["Planta Alfa requiere almacenamiento de 8 horas", "Contacto tecnico Ana Perez en planta"]));
    expect(r.status).toBe("ready");
    expect(r.read_condition).toBe("text");
    expect(r.segments.map((s) => s.ref)).toEqual(["p. 1", "p. 2"]);
  });
  it("PDF sin texto: se informa escaneado, sin inventar contenido", async () => {
    const r = await extractAttachment("pdf", pdfWith([null]));
    expect(r.status).toBe("failed");
    expect(r.read_condition).toBe("scanned");
    expect(r.text).toBe("");
    expect(r.limitation).toMatch(/OCR/);
  });
  it("PDF con una página escaneada queda parcial y lo dice", async () => {
    const r = await extractAttachment("pdf", pdfWith(["Pagina con texto suficiente para leer", null]));
    expect(r.status).toBe("partial");
    expect(r.limitation).toMatch(/Páginas sin texto.*2/);
  });
  it("imagen: no se afirma lectura (OCR no disponible)", async () => {
    const r = await extractAttachment("image", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    expect(r.read_condition).toBe("unsupported");
  });
});

describe("magnitudes con unidad", () => {
  it("un «20» suelto no valida 20 MW, 20 MWh ni 20 horas", () => {
    const t = "Reunión con 20 asistentes. Proyecto de 5 MW.";
    expect(quantityStated(t, 20, "MW")).toBe(false);
    expect(quantityStated(t, 20, "MWh")).toBe(false);
    expect(quantityStated(t, 20, "h")).toBe(false);
    expect(quantityStated(t, 5, "MW")).toBe(true);
    expect(quantityStated("40 MWh", 40, "MW")).toBe(false);
  });
  it("el chat descarta MW sin unidad escrita", () => {
    expect(stripInventedNumbers({ power_mw: 20 }, "somos 20 en el equipo").dropped).toEqual(["power_mw"]);
  });
  it("propuestas desde documentos: número sin unidad se descarta con nota", () => {
    const item = { kind: "project", ref: "p1", name: "Planta", evidence: "Planta", power_mw: 20, energy_mwh: null, duration_h: null, ambiguity: null } as unknown as ProposalItem;
    const [r] = sanitizeProposals([item], "Planta con 20 operarios");
    expect(r!.power_mw).toBeNull();
    expect(r!.ambiguity).toMatch(/20 MW/);
  });
});
