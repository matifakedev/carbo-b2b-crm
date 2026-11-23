import { describe, expect, it } from "vitest";
import { ASSOCIATION_NOTE, classifyFindings, communicableCapabilities, sanitizeFits, softenClaims, type Capability, type Source } from "@/lib/research";

const src: Source[] = [{ url: "https://ej.org/a", title: "A", published_at: null, provided_by_user: false, markdown: "La empresa anunció un parque solar de 50 MW en Córdoba para 2027 con almacenamiento previsto." }];

describe("research findings", () => {
  it("keeps a fact only when the quote is verbatim in the source", () => {
    const [f] = classifyFindings([{ source: 0, category: "project", statement: "Parque solar", quote: "anunció un parque solar de 50 MW en Córdoba", condition: "fact" }], src);
    expect(f?.condition).toBe("fact");
  });
  it("marks unverifiable quotes as insufficient evidence", () => {
    const [f] = classifyFindings([{ source: 0, category: "need", statement: "Necesita baterías", quote: "la empresa necesita urgentemente baterías de 4 horas", condition: "fact" }], src);
    expect(f?.condition).toBe("insufficient");
  });
  it("drops findings pointing to a non-existent source", () => {
    expect(classifyFindings([{ source: 3, category: "other", statement: "x", quote: "y", condition: "fact" }], src)).toHaveLength(0);
  });
  it("association membership never implies personal access", () => {
    const [f] = classifyFindings([{ source: 0, category: "association", statement: "Miembro de cámara", quote: "anunció un parque solar de 50 MW en Córdoba", condition: "fact" }], src);
    expect(f?.note).toContain(ASSOCIATION_NOTE);
  });
});

describe("fit against capabilities", () => {
  const caps: Capability[] = [
    { id: "a", title: "A", applications: null, limits: null, evidence: null, communicable: "Texto", is_commercial_sensitive: false, status: "approved" },
    { id: "b", title: "B", applications: null, limits: null, evidence: null, communicable: "Precio", is_commercial_sensitive: true, status: "approved" },
    { id: "c", title: "C", applications: null, limits: null, evidence: null, communicable: "Borrador", is_commercial_sensitive: false, status: "in_review" },
  ];
  it("only approved, non-sensitive capabilities are communicable", () => {
    expect(communicableCapabilities(caps).map((c) => c.id)).toEqual(["a"]);
  });
  it("never declares 'ideal' and drops unapproved capability refs", () => {
    const [f] = sanitizeFits([{ need: "n", finding_ids: [0], capability_ids: ["c"], assessment: "Es la solución ideal", doubts: "", to_validate: "" }], new Set(["a"]), 1);
    expect(f?.assessment).not.toMatch(/ideal/i);
    expect(f?.capability_ids).toEqual([]);
    expect(f?.assessment).toContain("Sin capacidad aprobada");
  });
  it("softens absolute claims", () => { expect(softenClaims("Perfecto e ideal")).toBe("posible e posible"); });
});
