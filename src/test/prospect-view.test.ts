import { describe, expect, it } from "vitest";
import { Meter, resolveBudget, buildProspectView, deriveExecution, fetchWithRateLimit, noticesFor, prospectMessage, RateLimited, type Candidate, type ProspectView } from "@/lib/prospecting";

const cand = (company: string, lv: boolean, sv = true): Candidate => ({ company, tier: "exploratory", notes: [], hypothesis: "h", to_validate: "v", target_role: "r", intro_request: "¿sabés quién?",
  linkage: { text: "miembro", url: lv ? "https://a.org/m" : null, quote: lv ? "q" : null, verified: lv },
  signal: { text: "planta", url: sv ? "https://n.com/x" : null, date: null, quote: sv ? "q" : null, verified: sv, kind: sv ? "facility" : "none" } });
const base = (o: Partial<ProspectView> = {}): ProspectView => ({ execution: "completed", sufficiency: "partial", gaps: [], recommendation: "", candidates: [], profile_origin: "p",
  usage: { queries: 1, reads: 0, retries: 0, llm_calls: 1, seconds: 1 }, sources: [], ...o });

describe("resumen vs candidatas", () => {
  it("ignora el texto libre del modelo y respeta el estado de cada empresa", () => {
    const v = buildProspectView(base({ candidates: [cand("Samsung", false)], recommendation: "Samsung es miembro confirmado de la Chamber.", priorities: [{ company: "Samsung", reason: "planta nueva" }] }));
    expect(v.recommendation).not.toMatch(/confirmad/);
    expect(v.recommendation).toMatch(/Samsung \(exploratoria, vinculación pendiente de verificar\)/);
    expect(prospectMessage("Chamber", v)).toMatch(/Samsung\*\* · exploratoria/);
  });
  it("no recomienda empresas descartadas en una lista mixta", () => {
    const v = buildProspectView(base({ candidates: [cand("Dell", true), { ...cand("Acme", true), tier: "qualified" }], priorities: [{ company: "Bakery", reason: "descartada" }, { company: "Dell", reason: "expansión" }] }));
    expect(v.recommendation).not.toMatch(/Bakery/);
    expect(v.recommendation).toMatch(/Empezaría por Dell \(exploratoria/);
    expect(v.recommendation).toMatch(/Acme \(oportunidad calificada\)/);
    expect(v.recommendation).not.toMatch(/Ninguna está calificada/);
  });
  it("lista solo exploratorias aclara que no son oportunidades", () => {
    expect(buildProspectView(base({ candidates: [cand("Dell", true)] })).recommendation).toMatch(/Ninguna está calificada/);
  });
});

describe("fases y propuestas", () => {
  it("el mensaje informa fases incompletas y propuestas guardadas", () => {
    const v = buildProspectView(base({ execution: "partial", proposals_saved: 0, phases: [{ key: "network", label: "Red", status: "done" }, { key: "proposals", label: "Propuestas para el CRM", status: "failed" }] }));
    const m = prospectMessage("X", v);
    expect(m).toMatch(/Propuestas guardadas:\*\* 0/);
    expect(m).toMatch(/Propuestas para el CRM \(falló\)/);
  });
  it("un fallo al guardar hace la ejecución parcial", () => {
    expect(deriveExecution({ searchConfigured: true, sources: 3, exhausted: [], issues: [{ kind: "persist_error", detail: "x" }] })).toBe("partial");
  });
});

describe("presupuesto real", () => {
  it("las páginas que trae una búsqueda cuentan como lecturas", () => {
    const m = new Meter(resolveBudget({ max_scrapes: 6 }));
    expect(m.takeReads(5)).toBe(5);
    expect(m.takeReads(5)).toBe(1);
    expect(m.exhausted).toContain("páginas leídas");
    m.refundReads(2); expect(m.usage().reads).toBe(4);
  });
  it("reserva tiempo para sintetizar y guardar", () => {
    let t = 0; const m = new Meter(resolveBudget({ max_seconds: 100 }), () => t);
    t = 75000; expect(m.take("query", 30)).toBe(false); expect(m.take("llm")).toBe(true);
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
  it("usa retry_after_seconds del cuerpo si falta el header y cuenta el reintento", async () => {
    const waits: number[] = []; let n = 0; let retries = 0;
    const r = await fetchWithRateLimit(async () => (n++ === 0 ? new Response(JSON.stringify({ error: { retry_after_seconds: 4 } }), { status: 429 }) : new Response("ok")), { remainingMs: () => 60000, sleep: async (ms) => { waits.push(ms); }, onRetry: () => { retries++; } });
    expect(r.status).toBe(200); expect(waits).toEqual([4000]); expect(retries).toBe(1);
  });
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
