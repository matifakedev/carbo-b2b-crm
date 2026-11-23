import { describe, expect, it } from "vitest";
import { defaultInPipeline, formatQuantity, validateOpportunity } from "@/lib/projects";
import { numberStated, sanitizeProposals, type ProposalItem } from "@/lib/brain";

const base: ProposalItem = { kind: "project", ref: "pr1", full_name: null, description: null, title: null, org_name: null, person_ref: null, introducer_ref: null, introduced_ref: null, target_ref: null, target_description: null, purpose: null, intro_kind: null, certainty: "stated", evidence: "", ambiguity: null, name: "Planta", location: null, power_mw: null, energy_mwh: null, duration_h: null, role: null, blockers: null, next_milestone: null, project_ref: null };

describe("opportunities", () => {
  it("require project, need and rationale", () => {
    expect(validateOpportunity({ project_id: null, title: "x", need: "n", rationale: "r" })).toMatch(/proyecto/);
    expect(validateOpportunity({ project_id: "p", title: "x", need: " ", rationale: "r" })).toMatch(/necesidad/);
    expect(validateOpportunity({ project_id: "p", title: "x", need: "n", rationale: "" })).toMatch(/fundamento/);
    expect(validateOpportunity({ project_id: "p", title: "x", need: "n", rationale: "r" })).toBeNull();
  });
  it("institutional relations and hypotheses stay out of the pipeline by default", () => {
    expect(defaultInPipeline("institutional", "personal")).toBe(false);
    expect(defaultInPipeline("commercial", "hypothesis")).toBe(false);
    expect(defaultInPipeline("commercial", "personal")).toBe(true);
  });
});

describe("magnitudes", () => {
  it("MW, MWh and hours are never derived from each other", () => {
    expect(formatQuantity(null, "MWh")).toBe("MWh: desconocido");
    const [p] = sanitizeProposals([{ ...base, power_mw: 2, energy_mwh: 8, duration_h: 4, evidence: "Necesitan 2 MW por 4 horas" }], "Necesitan 2 MW por 4 horas");
    expect(p?.power_mw).toBe(2);
    expect(p?.duration_h).toBe(4);
    expect(p?.energy_mwh).toBeNull(); // 8 MWh would be an invented conversion
  });
  it("detects decimals written with a comma", () => {
    expect(numberStated("unos 1,5 MW", 1.5)).toBe(true);
    expect(numberStated("unos 15 MW", 1.5)).toBe(false);
  });
});

describe("brain project proposals", () => {
  it("a participant without a project needs resolution; project updates require choosing a project", () => {
    const [part, upd] = sanitizeProposals([
      { ...base, kind: "participant", ref: null, role: "technical_evaluator", target_description: "jefe de mantenimiento", project_ref: "pr9", evidence: "x" },
      { ...base, kind: "project_update", ref: null, evidence: "x" },
    ], "x");
    expect(part?.project_ref).toBeNull();
    expect(part?.ambiguity).toMatch(/proyecto/);
    expect(upd?.ambiguity).toMatch(/proyecto existente/);
  });
});
