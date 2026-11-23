/** Pure IVLP agenda import rules (no I/O) — shared by UI and tests. */

export const FIELDS = {
  full_name: "Nombre completo", title: "Cargo", org_name: "Organización", email: "Email", phone: "Teléfono",
  meeting: "Reunión", date: "Fecha", city: "Ciudad", notes: "Notas",
} as const;
export type FieldKey = keyof typeof FIELDS;
export type Mapping = Partial<Record<FieldKey, number>>; // field -> column index
export type Grid = string[][];
export const MAX_ROWS = 2000;

/** RFC-4180-ish CSV/TSV parser: quoted fields, escaped quotes, embedded newlines. */
export function parseDelimited(text: string): { rows: Grid; error: string | null } {
  const src = text.replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1]);
  const delim = counts[0]![0];
  const rows: Grid = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (q) return { rows: [], error: "El archivo tiene comillas sin cerrar." };
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return { rows: rows.filter((r) => r.some((x) => x.trim() !== "")), error: null };
}

const GUESS: Record<FieldKey, RegExp> = {
  full_name: /^(nombre( completo)?|name|full ?name|participante|persona|contacto)$/i,
  title: /(cargo|puesto|title|position|rol)/i,
  org_name: /(organizaci[oó]n|empresa|instituci[oó]n|organization|company|entidad)/i,
  email: /(e-?mail|correo)/i, phone: /(tel[eé]fono|phone|celular|m[oó]vil)/i,
  meeting: /(reuni[oó]n|meeting|actividad|evento|encuentro)/i, date: /(fecha|date|d[ií]a)/i,
  city: /(ciudad|city|localidad|lugar)/i, notes: /(notas?|notes|observaciones|comentarios)/i,
};
export function guessMapping(header: string[]): Mapping {
  const m: Mapping = {}; const used = new Set<number>();
  for (const k of Object.keys(GUESS) as FieldKey[]) {
    const idx = header.findIndex((h, i) => !used.has(i) && GUESS[k].test(h.trim()));
    if (idx >= 0) { m[k] = idx; used.add(idx); }
  }
  return m;
}

/** Accepts ISO, dd/mm/yyyy, dd-mm-yyyy and Excel serials. Never guesses ambiguous text. */
export function parseDate(v: string): string | null {
  const s = v.trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = +m[3]! < 100 ? 2000 + +m[3]! : +m[3]!; return iso(y, +m[2]!, +m[1]!); }
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000); return d.toISOString().slice(0, 10); }
  return null;
}
function iso(y: number, mo: number, d: number) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

export const normName = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Row = {
  row_number: number; raw: Record<string, string>;
  full_name: string; title: string; org_name: string; email: string; phone: string; meeting: string; date: string | null; city: string; notes: string;
  errors: string[]; warnings: string[]; sameNameRows: number[];
};

export function buildRows(header: string[], body: Grid, mapping: Mapping, headerRowNumber = 1): Row[] {
  const get = (r: string[], k: FieldKey) => (mapping[k] != null ? (r[mapping[k]!] ?? "").trim() : "");
  const rows: Row[] = body.map((r, i) => {
    const raw = Object.fromEntries(header.map((h, j) => [h || `Columna ${j + 1}`, r[j] ?? ""]));
    const dateRaw = get(r, "date");
    const row: Row = { row_number: headerRowNumber + 1 + i, raw, full_name: get(r, "full_name"), title: get(r, "title"), org_name: get(r, "org_name"), email: get(r, "email"),
      phone: get(r, "phone"), meeting: get(r, "meeting"), date: parseDate(dateRaw), city: get(r, "city"), notes: get(r, "notes"), errors: [], warnings: [], sameNameRows: [] };
    if (!row.full_name) row.errors.push("Falta el nombre");
    if (!row.email) row.warnings.push("Sin email");
    else if (!EMAIL.test(row.email)) { row.errors.push(`Email inválido: ${row.email}`); }
    if (!row.org_name) row.warnings.push("Sin organización");
    if (dateRaw && !row.date) row.errors.push(`Fecha ilegible: ${dateRaw}`);
    if (!row.meeting && !row.date) row.warnings.push("Sin reunión ni fecha");
    return row;
  });
  const byName = new Map<string, number[]>();
  for (const r of rows) if (r.full_name) { const k = normName(r.full_name); byName.set(k, [...(byName.get(k) ?? []), r.row_number]); }
  for (const r of rows) {
    const same = r.full_name ? (byName.get(normName(r.full_name)) ?? []).filter((n) => n !== r.row_number) : [];
    r.sameNameRows = same;
    if (same.length) r.warnings.push(`Mismo nombre que fila ${same.join(", ")} (¿homónimo o la misma persona?)`);
  }
  return rows;
}

/** Decision per row: "new" | "existing:<uuid>" | "row:<n>" | "skip" | "pending". */
export type Decision = string;
export function defaultDecision(r: Row, existingMatches: number): Decision {
  if (r.errors.length) return "skip";
  if (existingMatches > 0 || r.sameNameRows.length) return "pending";
  return "new";
}

export type Effect = { people_new: number; people_linked: number; skipped: number; pending: number; orgs_new: number; orgs_existing: number; meetings: number; participants: number; contacts: number };
export function computeEffect(rows: Row[], decisions: Record<number, Decision>, existingOrgs: Set<string>): Effect {
  const e: Effect = { people_new: 0, people_linked: 0, skipped: 0, pending: 0, orgs_new: 0, orgs_existing: 0, meetings: 0, participants: 0, contacts: 0 };
  const orgs = new Set<string>(); const meetings = new Set<string>(); const parts = new Set<string>();
  for (const r of rows) {
    const d = decisions[r.row_number] ?? "pending";
    if (d === "skip") { e.skipped++; continue; }
    if (d === "pending") { e.pending++; continue; }
    if (d === "new") e.people_new++; else e.people_linked++;
    if (r.org_name) orgs.add(normName(r.org_name));
    if (r.meeting || r.date) {
      const mk = `${normName(r.meeting)}|${r.date ?? ""}|${normName(r.city)}`; meetings.add(mk);
      const who = d.startsWith("row:") ? resolveRow(d, decisions) : d === "new" ? `r${r.row_number}` : d;
      parts.add(`${mk}#${who}`);
    }
    if (r.email) e.contacts++; if (r.phone) e.contacts++;
  }
  for (const o of orgs) (existingOrgs.has(o) ? e.orgs_existing++ : e.orgs_new++);
  e.meetings = meetings.size; e.participants = parts.size;
  return e;
}
function resolveRow(d: Decision, decisions: Record<number, Decision>, depth = 0): string {
  const n = Number(d.slice(4)); const t = decisions[n];
  if (!t || depth > 20) return `r${n}`;
  return t.startsWith("row:") ? resolveRow(t, decisions, depth + 1) : t === "new" ? `r${n}` : t;
}

/** Rows referencing another row must point to an earlier row that itself becomes a person. */
export function decisionErrors(rows: Row[], decisions: Record<number, Decision>): string[] {
  const errs: string[] = [];
  for (const r of rows) {
    const d = decisions[r.row_number] ?? "pending";
    if (d.startsWith("row:")) {
      const n = Number(d.slice(4)); const t = decisions[n];
      if (n >= r.row_number) errs.push(`Fila ${r.row_number}: solo puede unirse a una fila anterior.`);
      else if (!t || t === "skip" || t === "pending") errs.push(`Fila ${r.row_number}: la fila ${n} no se importa.`);
    }
    if (d !== "skip" && r.errors.length) errs.push(`Fila ${r.row_number}: tiene errores; corregí el archivo u omitila.`);
  }
  return errs;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
