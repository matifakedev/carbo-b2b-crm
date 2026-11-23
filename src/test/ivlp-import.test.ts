import { describe, expect, it } from "vitest";
import { buildRows, computeEffect, decisionErrors, defaultDecision, guessMapping, parseDate, parseDelimited } from "@/lib/ivlp-import";

const CSV = `Nombre,Cargo,Organización,Email,Teléfono,Reunión,Fecha,Ciudad
Ana Pérez,Gerente,Empresa Uno,,+1 555 0100,Visita planta,14/03/2026,Austin
Juan López,Director,Empresa Uno,juan@uno.com,,Visita planta,14/03/2026,Austin
Juan López,Analista,Otra SA,jl@otra.com,,Panel energía,15/03/2026,Houston
,Sin nombre,Empresa Uno,,,,,
"Carla ""Cata"" Ruiz","Jefa, Operaciones",,carla@x.com,,,,`;

const parsed = parseDelimited(CSV);
const header = parsed.rows[0]!;
const rows = buildRows(header, parsed.rows.slice(1), guessMapping(header));

describe("IVLP import", () => {
  it("parses quoted fields with commas and escaped quotes", () => {
    expect(parsed.error).toBeNull();
    expect(rows[4]?.full_name).toBe('Carla "Cata" Ruiz');
    expect(rows[4]?.title).toBe("Jefa, Operaciones");
  });
  it("person without email is a warning, not an error", () => {
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[0]?.warnings).toContain("Sin email");
  });
  it("missing name is an error and defaults to skip", () => {
    expect(rows[3]?.errors).toContain("Falta el nombre");
    expect(defaultDecision(rows[3]!, 0)).toBe("skip");
  });
  it("homonyms are flagged and require a decision", () => {
    expect(rows[2]?.sameNameRows).toEqual([3]);
    expect(defaultDecision(rows[2]!, 0)).toBe("pending");
  });
  it("repeated organization counts once; participants of a meeting are not linked to each other", () => {
    const d = { 2: "new", 3: "new", 4: "new", 5: "skip", 6: "new" };
    const e = computeEffect(rows, d, new Set());
    expect(e.orgs_new).toBe(2);
    expect(e.meetings).toBe(2);
    expect(e.participants).toBe(3);
    expect(e.people_new).toBe(4);
  });
  it("a row may only merge into an earlier imported row", () => {
    expect(decisionErrors(rows, { 2: "new", 3: "new", 4: "row:3", 5: "skip", 6: "new" })).toEqual([]);
    expect(decisionErrors(rows, { 2: "new", 3: "row:4", 4: "new", 5: "skip", 6: "new" })[0]).toContain("fila anterior");
  });
  it("parses day-first dates and rejects impossible ones", () => {
    expect(parseDate("14/03/2026")).toBe("2026-03-14");
    expect(parseDate("31/02/2026")).toBeNull();
  });
});
