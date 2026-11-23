import { describe, it, expect } from "vitest";
import { Meter, assessSufficiency, finalizeCandidates, resolveBudget, type RawCandidate } from "@/lib/prospecting";

const src = [
  { url: "https://chamber.org/members", published_at: null, markdown: "Our members include Acme Data Centers LLC, a proud investor partner of the Austin Chamber since 2019." },
  { url: "https://acme.com/news", published_at: "2026-10-01", markdown: "Acme Data Centers announced a new 40 acre campus under construction in Round Rock Texas this year." },
  { url: "https://news.com/x", published_at: null, markdown: "Local bakery wins award for the best croissant in the whole city of Austin." },
];
const base: RawCandidate = { company: "Acme Data Centers", linkage: "Miembro inversor", linkage_quote: "a proud investor partner of the Austin Chamber since 2019", linkage_source: 0,
  signal: "Nuevo campus", signal_quote: "announced a new 40 acre campus under construction in Round Rock", signal_source: 1, signal_kind: "facility",
  hypothesis: "Respaldo", to_validate: "Consumo", target_role: "Director de energía", intro_request: "¿Sabés quién...?", relevance: "high" };

describe("prospecting rules", () => {
  it("drops irrelevant initial results and does not pad to five", () => {
    const c = finalizeCandidates([base, { ...base, company: "Bakery", relevance: "irrelevant", linkage_source: 2, signal_source: 2 }], src, { hasApprovedCapabilities: true, max: 5 });
    expect(c.map((x) => x.company)).toEqual(["Acme Data Centers"]);
    expect(assessSufficiency(c, 5).gaps.join(" ")).toContain("Solo 1");
  });
  it("without approved capabilities nothing is qualified", () => {
    const [c] = finalizeCandidates([base], src, { hasApprovedCapabilities: false, max: 5 });
    expect(c!.tier).toBe("exploratory");
    expect(finalizeCandidates([base], src, { hasApprovedCapabilities: true, max: 5 })[0]!.tier).toBe("qualified");
  });
  it("unverifiable membership is flagged and never qualified", () => {
    const [c] = finalizeCandidates([{ ...base, linkage_quote: "member of the chamber board of directors since forever" }], src, { hasApprovedCapabilities: true, max: 5 });
    expect(c!.linkage.verified).toBe(false);
    expect(c!.tier).toBe("exploratory");
  });
  it("candidates with nothing documented are excluded", () => {
    expect(finalizeCandidates([{ ...base, linkage_quote: "invented quote text not in source", signal_quote: "", signal_kind: "none" }], src, { hasApprovedCapabilities: true, max: 5 })).toHaveLength(0);
    expect(assessSufficiency([], 5).sufficiency).toBe("insufficient");
  });
  it("budget exhaustion is recorded and caps are enforced", () => {
    const b = resolveBudget({ max_queries: 2, max_seconds: 9999 });
    expect(b.max_seconds).toBe(240);
    const m = new Meter(b);
    expect([m.take("query"), m.take("query"), m.take("query")]).toEqual([true, true, false]);
    expect(m.exhausted).toEqual(["consultas web"]);
    let t = 0; const timed = new Meter(resolveBudget({ max_seconds: 10 }), () => t);
    t = 11000; expect(timed.take("llm")).toBe(false); expect(timed.exhausted).toEqual(["tiempo"]);
  });
});
