import { describe, expect, it } from "vitest";
import { buildProspectView, deriveExecution, fetchWithRateLimit, noticesFor, prospectMessage, RateLimited, type Candidate, type ProspectView } from "@/lib/prospecting";

const cand = (company: string, lv: boolean, sv = true): Candidate => ({ company, tier: "exploratory", notes: [], hypothesis: "h", to_validate: "v", target_role: "r", intro_request: "¿sabés quién?",
  linkage: { text: "miembro", url: lv ? "https://a.org/m" : null, quote: lv ? "q" : null, verified: lv },
  signal: { text: "planta", url: sv ? "https://n.com/x" : null, date: null, quote: sv ? "q" : null, verified: sv, kind: sv ? "facility" : "none" } });
const base = (o: Partial<ProspectView> = {}): ProspectView => ({ execution: "completed", sufficiency: "partial", gaps: [], recommendation: "", candidates: [], profile_origin: "p",
  usage: { queries: 1, scrapes: 0, llm_calls: 1, seconds: 1, cost_units: 2 }, sources: [], ...o });

describe("resumen vs candidatas", () => {
  it("no promueve un vínculo pendiente a confirmado", () => {
    const v = buildProspectView(base({ candidates: [cand("Samsung", false)], recommendation: "Samsung es miembro confirmado de la Chamber. Conviene ir primero." }));
    expect(v.recommendation).not.toMatch(/confirmado/);
    expect(v.recommendation).toMatch(/pendiente de verificar: Samsung/);
    expect(prospectMessage("Chamber", v)).toMatch(/Samsung\*\* · exploratoria · vinculación pendiente de verificar/);
  });
  it("no presenta exploratorias como calificadas", () => {
    expect(buildProspectView(base({ candidates: [cand("Dell", true)], recommendation: "Dell es una oportunidad calificada. Ir primero." })).recommendation).toBe("Ir primero.");
  });
});

describe("estados", () => {
  it("terminada con fallos es parcial, no completa", () => {
    expect(deriveExecution({ searchConfigured: true, sources: 5, exhausted: [], issues: [{ kind: "rate_limit", detail: "429" }] })).toBe("partial");
    expect(deriveExecution({ searchConfigured: true, sources: 5, exhausted: [], issues: [] })).toBe("completed");
    expect(deriveExecution({ searchConfigured: true, sources: 0, exhausted: [], issues: [{ kind: "rate_limit", detail: "429" }] })).toBe("failed");
  });
  it("mensaje y tarjeta muestran el mismo estado", () => {
    const v = buildProspectView(base({ execution: "partial" }));
    expect(prospectMessage("X", v)).toMatch(/Terminada con fallos \(parcial\)/);
  });
  it("el aviso de 429 no pide fuentes ni muestra el error técnico", () => {
    const n = noticesFor([{ kind: "rate_limit", detail: "Firecrawl 429 {json}" }]).join(" ");
    expect(n).not.toMatch(/fuente|429|json/i);
  });
});

describe("campos vacíos", () => {
  it("descarta fuentes no inspeccionables y brechas vacías", () => {
    const v = buildProspectView(base({ gaps: ["", "  ", "Falta X"], sources: [{ url: "", title: null, published_at: null }, { url: "Fuente aportada", title: null, published_at: null }, { url: "https://ok.com", title: "", published_at: "" }] }));
    expect(v.gaps).toEqual(["Falta X"]);
    expect(v.sources).toEqual([{ url: "https://ok.com", title: null, published_at: null }]);
  });
});

describe("429", () => {
  const res = (status: number, ra?: string) => new Response("x", { status, headers: ra ? { "retry-after": ra } : {} });
  it("respeta Retry-After y reintenta", async () => {
    const waits: number[] = []; let n = 0;
    const r = await fetchWithRateLimit(async () => (n++ === 0 ? res(429, "3") : res(200)), { remainingMs: () => 60000, sleep: async (ms) => { waits.push(ms); } });
    expect(r.status).toBe(200); expect(waits).toEqual([3000]);
  });
  it("corta tras 2 reintentos", async () => {
    let n = 0;
    await expect(fetchWithRateLimit(async () => { n++; return res(429, "1"); }, { remainingMs: () => 60000, sleep: async () => {} })).rejects.toBeInstanceOf(RateLimited);
    expect(n).toBe(3);
  });
  it("no espera más que el tiempo restante", async () => {
    let n = 0;
    await expect(fetchWithRateLimit(async () => { n++; return res(429, "10"); }, { remainingMs: () => 5000, sleep: async () => {} })).rejects.toBeInstanceOf(RateLimited);
    expect(n).toBe(1);
  });
});
