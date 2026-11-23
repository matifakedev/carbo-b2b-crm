import { describe, expect, it } from "vitest";
import { sanitizeProposals, validateAnswer, type ProposalItem } from "@/lib/brain";
import { buildDecisions } from "@/lib/brain-review";

const base: ProposalItem = { kind: "person", ref: null, full_name: null, description: null, title: null, org_name: null, person_ref: null, introducer_ref: null, introduced_ref: null, target_ref: null, target_description: null, purpose: null, intro_kind: null, certainty: "stated", evidence: "", ambiguity: null, name: null, location: null, power_mw: null, energy_mwh: null, duration_h: null, role: null, blockers: null, next_milestone: null, project_ref: null };
const note = "Hablé con Ana Pérez. Me dijo que podría presentarte al jefe de planta de una minera.";

describe("brain proposals", () => {
  it("'podría presentarte' never becomes a done introduction", () => {
    const [, intro] = sanitizeProposals([
      { ...base, ref: "p1", full_name: "Ana Pérez", evidence: "Hablé con Ana Pérez" },
      { ...base, kind: "introduction", introducer_ref: "p1", target_description: "jefe de planta de una minera", intro_kind: "done", certainty: "possible", evidence: "podría presentarte al jefe de planta" },
    ], note);
    expect(intro?.intro_kind).toBe("hypothetical");
    expect(intro?.target_ref).toBeNull();
  });
  it("flags evidence that is not in the original", () => {
    const [p] = sanitizeProposals([{ ...base, ref: "p1", full_name: "Juan", evidence: "Juan es gerente" }], note);
    expect(p?.ambiguity).toMatch(/no aparece textual/);
  });
  it("drops refs to persons that were not proposed", () => {
    const [t] = sanitizeProposals([{ ...base, kind: "task", title: "Llamar", person_ref: "p9", evidence: "Hablé con Ana Pérez" }], note);
    expect(t?.person_ref).toBeNull();
  });
});

describe("brain review", () => {
  const pending = [{ id: "a", proposed: { ...base, full_name: "Ana" } }, { id: "b", proposed: base }, { id: "c", proposed: base }];
  it("rejected sends reject, pending sends nothing, edits become correct", () => {
    const d = buildDecisions(pending, { a: { action: "accept", edits: { full_name: "Ana Pérez" } }, b: { action: "reject", edits: {} }, c: { action: "pending", edits: {} } });
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ proposal_id: "a", action: "correct", final: { full_name: "Ana Pérez" } });
    expect(d[1]).toEqual({ proposal_id: "b", action: "reject" });
  });
});

describe("brain answers", () => {
  it("a fact without a valid citation is demoted to hypothesis", () => {
    const a = validateAnswer({ facts: [{ text: "Ana trabaja en X", refs: ["person:fake"] }, { text: "Ana es conectora", refs: ["person:1"] }], hypotheses: [], unknowns: [], commitments: [{ text: "x", refs: [] }], next_steps: [] }, new Set(["person:1"]));
    expect(a.facts).toHaveLength(1);
    expect(a.hypotheses).toHaveLength(1);
    expect(a.commitments).toHaveLength(0);
  });
});
