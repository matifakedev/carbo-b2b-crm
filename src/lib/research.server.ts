import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, sanitizeProposals, type ProposalItem } from "@/lib/brain";
import {
  FINDINGS_SCHEMA, FINDINGS_SYSTEM, FIT_SCHEMA, FIT_SYSTEM, RESEARCH_EXTRACTION_ADDENDUM, buildQuery, classifyFindings,
  communicableCapabilities, sanitizeFits, softenClaims, usableCapabilities,
  type Capability, type Fit, type RawFinding, type Source,
} from "@/lib/research";

const MODEL = "openai/gpt-6-astra" as const;
const FC = "https://api.firecrawl.dev/v2";
const MAX_SRC = 12000;

/** Model call bounded by the shared deadline (timeoutMs). */
export async function llm(system: string, user: string, name: string, schema: unknown, timeoutMs = 90000): Promise<{ ok: true; json: unknown } | { ok: false; message: string; rateLimited?: boolean }> {
  if (!process.env["LOVABLE_API_KEY"]) return { ok: false, message: "El Brain no está configurado." };
  if (timeoutMs < 3000) return { ok: false, message: "Sin tiempo restante para el análisis del modelo." };
  const { generateResponse } = await import("@lovable.dev/ai-gateway");
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const res = await Promise.race([
      generateResponse({ model: MODEL, instructions: system, input: user, text: { format: { type: "json_schema", name, strict: true, schema: schema as Record<string, unknown> } } }),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); }),
    ]).finally(() => clearTimeout(timer));
    const out = (res as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? [];
    const text = out.flatMap((o) => (o.type === "message" ? o.content ?? [] : [])).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
    if (!text) return { ok: false, message: "El proveedor de IA no devolvió contenido." };
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    console.error("research llm error", e);
    const st = (e as { httpStatus?: number }).httpStatus;
    if ((e as Error).message === "timeout") return { ok: false, message: "El análisis del modelo excedió el tiempo disponible." };
    return { ok: false, message: st === 429 ? "El proveedor de IA limitó temporalmente las consultas [429]." : "El proveedor de IA falló.", rateLimited: st === 429 };
  }
}

type Meta = Record<string, unknown> | undefined;
const pubDate = (m: Meta) => {
  const v = m?.["publishedTime"] ?? m?.["article:published_time"] ?? m?.["datePublished"] ?? m?.["date"] ?? m?.["og:published_time"];
  return typeof v === "string" && v.trim() ? v.trim() : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
};

/** Shared deadline + retry accounting; every external call is cancelled when time runs out. */
export type RL = { remainingMs: () => number; onRetry?: () => void };
export const simpleRL = (seconds: number): RL => { const end = Date.now() + seconds * 1000; return { remainingMs: () => Math.max(0, end - Date.now()) }; };
const send = async (url: string, key: string, body: unknown, rl: RL) => {
  const go = () => fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(1000, rl.remainingMs())) });
  const { fetchWithRateLimit } = await import("@/lib/prospecting");
  return fetchWithRateLimit(go, rl);
};
/** Search with page content: each returned page is a read; `limit` must come from the read budget. */
export async function fcSearch(key: string, query: string, rl: RL = simpleRL(60), limit = 5): Promise<Source[]> {
  if (limit < 1) return [];
  const r = await send(`${FC}/search`, key, { query, limit, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }, rl);
  if (!r.ok) { const t = await r.text(); throw new Error(`Búsqueda web falló [${r.status}]: ${t.slice(0, 300)}`); }
  const j = (await r.json()) as { data?: { web?: { url: string; title?: string; markdown?: string; metadata?: Meta }[] } };
  return (j.data?.web ?? []).filter((w) => w.markdown?.trim()).map((w) => ({ url: w.url, title: w.title ?? (w.metadata?.["title"] as string) ?? null, published_at: pubDate(w.metadata), markdown: w.markdown!.slice(0, MAX_SRC), provided_by_user: false }));
}
export async function fcScrape(key: string, url: string, rl: RL = simpleRL(60)): Promise<Source> {
  const r = await send(`${FC}/scrape`, key, { url, formats: ["markdown"], onlyMainContent: true }, rl);
  if (!r.ok) { const t = await r.text(); throw new Error(`No se pudo leer ${url} [${r.status}]: ${t.slice(0, 200)}`); }
  const j = (await r.json()) as { data?: { markdown?: string; metadata?: Meta } };
  if (!j.data?.markdown?.trim()) throw new Error(`La página ${url} no tiene contenido legible.`);
  return { url, title: (j.data.metadata?.["title"] as string) ?? null, published_at: pubDate(j.data.metadata), markdown: j.data.markdown.slice(0, MAX_SRC), provided_by_user: true };
}

export type ResearchInput = { workspace_id: string; organization_id: string; focus: string; web_search: boolean; urls: string[]; pasted?: { title: string; url?: string; text: string } | null };

/** Web search that only returns organization candidates (name, url, snippet). Writes nothing. */
export async function findOrgCandidates(query: string): Promise<{ ok: true; candidates: { title: string; url: string; description: string }[] } | { ok: false; message: string; rateLimited?: boolean }> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) return { ok: false, message: "La búsqueda web no está configurada en este proyecto: no se consultó internet." };
  const { RateLimited } = await import("@/lib/prospecting");
  let r: Response;
  try { r = await send(`${FC}/search`, key, { query, limit: 6 }, simpleRL(30)); }
  catch (e) {
    console.warn("findOrgCandidates", e);
    return e instanceof RateLimited ? { ok: false, rateLimited: true, message: "El buscador limitó temporalmente las consultas; probá de nuevo en unos minutos." } : { ok: false, message: "La búsqueda web no respondió a tiempo." };
  }
  if (!r.ok) { console.warn("findOrgCandidates", r.status, (await r.text()).slice(0, 200)); return { ok: false, message: "La búsqueda web no respondió correctamente." }; }
  const j = (await r.json()) as { data?: { web?: { url: string; title?: string; description?: string }[] } };
  return { ok: true, candidates: (j.data?.web ?? []).map((w) => ({ title: w.title ?? w.url, url: w.url, description: (w.description ?? "").slice(0, 240) })) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeResearch(sb: any, data: ResearchInput) {
    
    const { data: org } = await sb.from("organizations").select("id, name, workspace_id").eq("id", data.organization_id).eq("workspace_id", data.workspace_id).maybeSingle();
    if (!org) throw new Error("Organización no encontrada en este espacio");
    const query = buildQuery(org.name, data.focus);
    const { data: run, error } = await sb.from("research_runs").insert({ workspace_id: data.workspace_id, organization_id: org.id, focus: data.focus || null, query: data.web_search ? query : null, model: MODEL }).select("id").single();
    if (error) throw new Error(error.message);
    const fetchedAt = new Date().toISOString();
    const key = process.env["FIRECRAWL_API_KEY"];
    const errors: string[] = [];
    const sources: Source[] = [];
    const { RateLimited } = await import("@/lib/prospecting");
    const rl = simpleRL(120);
    const webFail = (e: unknown) => { console.warn("research web", e); errors.push(e instanceof RateLimited ? "El buscador limitó temporalmente las consultas: se conservó lo obtenido." : "Una búsqueda o página no respondió: el alcance quedó reducido."); };

    if (data.web_search || data.urls.length) {
      if (!key) errors.push("La búsqueda web no está configurada en este proyecto: no se consultó internet.");
      else {
        if (data.web_search) { try { sources.push(...(await fcSearch(key, query, rl))); } catch (e) { webFail(e); } }
        for (const u of data.urls) { try { sources.push(await fcScrape(key, u, rl)); } catch (e) { webFail(e); } }
      }
    }
    if (data.pasted) sources.push({ url: data.pasted.url?.trim() || "Fuente aportada por el usuario", title: data.pasted.title.trim() || "Texto aportado", published_at: null, markdown: data.pasted.text.slice(0, MAX_SRC), provided_by_user: true });

    const finish = async (status: string, extra: Record<string, unknown> = {}) => {
      await sb.from("research_runs").update({ status, search_error: errors.length ? errors.join(" · ") : null, ...extra }).eq("id", run.id);
      return { run_id: run.id, status, errors };
    };
    if (!sources.length) return finish(!key && (data.web_search || data.urls.length) ? "not_configured" : "failed");

    // 1) Findings with verbatim evidence
    const srcBlock = sources.map((s, i) => `<fuente n="${i}" url="${s.url}">\n${s.markdown}\n</fuente>`).join("\n");
    const fr = await llm(FINDINGS_SYSTEM, `Organización: ${org.name}\nEnfoque: ${data.focus || "miembros, proyectos y necesidades"}\n\n${srcBlock}`, "findings", FINDINGS_SCHEMA);
    if (!fr.ok) { errors.push(fr.message); return finish("failed"); }
    const findings = classifyFindings(((fr.json as { findings: RawFinding[] }).findings ?? []), sources);
    if (findings.length) {
      const { error: e2 } = await sb.from("research_findings").insert(findings.map((f, position) => ({ ...f, workspace_id: data.workspace_id, run_id: run.id, fetched_at: fetchedAt, position })));
      if (e2) throw new Error(e2.message);
    }

    // 2) Reviewable CRM proposals (same mechanism as pasted documents)
    const docText = sources.map((s, i) => `[Fuente ${i}] ${s.url} · consultada ${fetchedAt.slice(0, 10)}${s.published_at ? ` · publicada ${s.published_at}` : ""}\n${s.markdown}`).join("\n\n---\n\n");
    const { data: doc, error: e3 } = await sb.from("source_documents").insert({ workspace_id: data.workspace_id, kind: "research", title: `Research · ${org.name} · ${fetchedAt.slice(0, 10)}`, original_text: docText, organization_id: org.id }).select("id").single();
    if (e3) throw new Error(e3.message);
    const { data: ex } = await sb.from("brain_extractions").insert({ workspace_id: data.workspace_id, source_document_id: doc.id, model: MODEL }).select("id").single();
    const pr = await llm(EXTRACTION_SYSTEM + RESEARCH_EXTRACTION_ADDENDUM, `<documento tipo="research" organizacion="${org.name}">\n${docText}\n</documento>`, "extraction", EXTRACTION_SCHEMA);
    if (pr.ok && ex) {
      const items = sanitizeProposals(((pr.json as { items?: ProposalItem[] }).items ?? []).filter((i) => ["person", "affiliation", "need", "project", "participant"].includes(i.kind)), docText);
      if (items.length) await sb.from("brain_proposals").insert(items.map((i, position) => ({ workspace_id: data.workspace_id, extraction_id: ex.id, kind: i.kind, proposed: i as never, evidence: i.evidence, ambiguity: i.ambiguity, position })));
    } else if (ex) { await sb.from("brain_extractions").update({ status: "failed", error: pr.ok ? null : pr.message }).eq("id", ex.id); errors.push("No se pudieron preparar propuestas para el CRM."); }

    // 3) Fit against approved capabilities only
    const { data: caps } = await sb.from("carbo_capabilities").select("id, title, applications, limits, evidence, communicable, is_commercial_sensitive, status").eq("workspace_id", data.workspace_id).is("archived_at", null);
    const approved = usableCapabilities((caps ?? []) as Capability[]);
    const comm = communicableCapabilities(approved);
    const evidenced = findings.map((f, i) => ({ i, f })).filter(({ f }) => f.condition !== "insufficient" && (f.category === "need" || f.category === "project"));
    let fit: { fits: Fit[]; note: string | null } = { fits: [], note: null }; let intro: string | null = null;
    if (!approved.length) fit.note = "No hay capacidades de Carbo aprobadas: no se evaluó encaje.";
    else if (!evidenced.length) fit.note = "No hay necesidades documentadas con evidencia suficiente: no se evaluó encaje.";
    else {
      const capBlock = approved.map((c) => ({ id: c.id, title: c.title, applications: c.applications, limits: c.limits, evidence: c.evidence }));
      const fitIn = `<hallazgos>\n${JSON.stringify(evidenced.map(({ i, f }) => ({ id: i, statement: f.statement, quote: f.quote, condition: f.condition, url: f.url })))}\n</hallazgos>\n<capacidades>\n${JSON.stringify(capBlock)}\n</capacidades>\n<comunicable>\n${comm.map((c) => `- ${c.title}: ${c.communicable}`).join("\n")}\n</comunicable>\nOrganización: ${org.name}`;
      const fx = await llm(FIT_SYSTEM, fitIn, "fit", FIT_SCHEMA);
      if (fx.ok) {
        const j = fx.json as { fits: Fit[]; intro_draft: string };
        fit = { fits: sanitizeFits(j.fits ?? [], new Set(approved.map((c) => c.id)), findings.length), note: null };
        intro = comm.length && j.intro_draft?.trim() ? softenClaims(j.intro_draft.trim()) : null;
      } else { fit.note = "No se pudo evaluar el encaje: " + fx.message; }
    }
    return finish(errors.length ? "partial" : "done", { source_document_id: doc.id, extraction_id: ex?.id ?? null, fit: fit as never, intro_draft: intro });
  }

export type ProspectInput = { workspace_id: string; organization_id: string; place: string | null; commercial_profile: string | null; budget?: Record<string, unknown> };

/** Multi-round prospecting through an institution's network. Writes a research_runs row and, only for selected candidates, reviewable proposals. */
export async function executeProspecting(sb: any, data: ProspectInput) {
  const P = await import("@/lib/prospecting");
  const budget = P.resolveBudget(data.budget as never);
  const meter = new P.Meter(budget);
  const { data: org } = await sb.from("organizations").select("id, name, location, website").eq("id", data.organization_id).eq("workspace_id", data.workspace_id).maybeSingle();
  if (!org) throw new Error("Organización no encontrada en este espacio");
  const place = data.place ?? org.location ?? null;
  const { data: caps } = await sb.from("carbo_capabilities").select("id, title, applications, limits, evidence, communicable, is_commercial_sensitive, status").eq("workspace_id", data.workspace_id).is("archived_at", null);
  const approved = usableCapabilities((caps ?? []) as Capability[]);
  const { data: prof } = await sb.from("carbo_context").select("title, body").eq("workspace_id", data.workspace_id).eq("kind", "commercial_profile").eq("status", "approved").is("archived_at", null);
  const { PROVISIONAL_PROFILE } = await import("@/lib/chat-agent");
  const capText = approved.map((c) => `${c.title}: ${c.applications ?? ""}${c.limits ? ` (límites: ${c.limits})` : ""}`).join("\n");
  const profile = prof?.length
    ? { origin: "perfil comercial aprobado", text: [prof.map((p: { title: string; body: string }) => `${p.title}: ${p.body}`).join("\n"), capText].filter(Boolean).join("\n") }
    : { origin: "perfil provisional", text: [PROVISIONAL_PROFILE, data.commercial_profile?.trim() ? `Aportado por el usuario: ${data.commercial_profile.trim()}` : "", capText].filter(Boolean).join("\n") };
  const { data: run, error } = await sb.from("research_runs").insert({ workspace_id: data.workspace_id, organization_id: org.id, focus: "Prospección por red institucional", query: P.NETWORK_QUERIES(org.name, place).join(" | "), model: MODEL }).select("id").single();
  if (error) throw new Error(error.message);
  const key = process.env["FIRECRAWL_API_KEY"];
  const errors: string[] = []; const sources: Source[] = []; const issues: import("@/lib/prospecting").Issue[] = [];
  const addSources = (xs: Source[]) => { for (const x of xs) if (!sources.some((s) => s.url === x.url)) sources.push(x); };
  // Search phases stop early to keep RESERVE_SECONDS for synthesis and saving.
  const rl = { remainingMs: () => meter.remainingMs(P.RESERVE_SECONDS), onRetry: () => { meter.retries++; } };
  const R = P.RESERVE_SECONDS;
  const phases: import("@/lib/prospecting").Phase[] = [];
  const phase = (key: string, label: string, status: import("@/lib/prospecting").Phase["status"]) => phases.push({ key, label, status });
  const search = async (q: string, want: number) => {
    if (!meter.take("query", R)) return false;
    const g = meter.takeReads(want); if (!g) return false;
    try { const xs = await fcSearch(key!, q, rl, g); meter.refundReads(g - xs.length); addSources(xs); } catch (e) { meter.refundReads(g); fail(e); }
    return true;
  };
  const fail = (e: unknown) => { const rate = e instanceof P.RateLimited; const d = rate ? (e as InstanceType<typeof P.RateLimited>).detail : (e as Error).message; errors.push(d); issues.push({ kind: rate ? "rate_limit" : "search_error", detail: d }); };
  const llmFail = (r: { message: string; rateLimited?: boolean }) => { errors.push(r.message); issues.push({ kind: r.rateLimited ? "rate_limit" : "llm_error", detail: r.message }); };
  let candidates: import("@/lib/prospecting").Candidate[] = []; let priorities: { company: string; reason: string }[] = [];

  if (!key) { errors.push("La búsqueda web no está configurada: no se consultó internet."); }
  else {
    // Round 1: institution network sources
    const i0 = issues.length;
    if (org.website && meter.take("scrape", R)) { try { addSources([await fcScrape(key, org.website, rl)]); } catch (e) { fail(e); } }
    let ran = 0; for (const q of P.NETWORK_QUERIES(org.name, place)) { if (!(await search(q, 5))) break; ran++; }
    const netCount = sources.length;
    phase("network", "Red de la institución", !netCount ? "failed" : issues.length > i0 || ran < P.NETWORK_QUERIES(org.name, place).length ? "partial" : "done");
    // Round 2: candidate selection by commercial profile
    let picked: { company: string }[] = [];
    if (netCount && meter.take("llm", R)) {
      const block = sources.map((s, i) => `<fuente n="${i}" url="${s.url}">\n${s.markdown.slice(0, 6000)}\n</fuente>`).join("\n");
      const r = await llm(P.CANDIDATES_SYSTEM, `Institución: ${org.name}${place ? ` (${place})` : ""}\nPerfil comercial (${profile.origin}):\n${profile.text}\n\n${block}`, "candidates", P.CANDIDATES_SCHEMA, meter.remainingMs(R));
      if (r.ok) picked = ((r.json as { candidates: { company: string; relevance: string }[] }).candidates ?? []).filter((c) => c.relevance === "high" || c.relevance === "medium").slice(0, 8);
      else llmFail(r);
      phase("select", "Selección de candidatas", r.ok ? "done" : "failed");
    } else phase("select", "Selección de candidatas", "skipped");
    // Round 3: research each candidate in its own sources (2 pages each, counted as reads)
    const i1 = issues.length; let done3 = 0;
    for (const c of picked) { if (!(await search(P.candidateQuery(c.company, place), 2))) break; done3++; }
    phase("candidates", "Búsqueda por candidata", !picked.length ? "skipped" : done3 === picked.length && issues.length === i1 ? "done" : done3 ? "partial" : "failed");
    // Round 4: prioritize up to N (uses the reserved time)
    if (picked.length && meter.take("llm")) {
      const block = sources.map((s, i) => `<fuente n="${i}" url="${s.url}"${s.published_at ? ` publicada="${s.published_at}"` : ""}>\n${s.markdown.slice(0, 4000)}\n</fuente>`).join("\n");
      const capBlock = approved.map((c) => ({ id: c.id, title: c.title, applications: c.applications, limits: c.limits, evidence: c.evidence }));
      const r = await llm(P.FINAL_SYSTEM, `Institución: ${org.name}${place ? ` (${place})` : ""}\nCandidatas preseleccionadas: ${picked.map((p) => p.company).join(", ")}\nPerfil comercial (${profile.origin}):\n${profile.text}\n<capacidades>\n${JSON.stringify(capBlock)}\n</capacidades>\nMáximo: ${budget.max_candidates}\n\n${block}`, "prospects", P.FINAL_SCHEMA, Math.max(0, meter.remainingMs() - 10000));
      if (r.ok) {
        const j = r.json as { candidates: import("@/lib/prospecting").RawCandidate[]; priorities: { company: string; reason: string }[] };
        candidates = P.finalizeCandidates(j.candidates ?? [], sources, { approved: approved.map((c) => ({ id: c.id, title: c.title, limits: c.limits })), max: budget.max_candidates });
        priorities = j.priorities ?? [];
      } else llmFail(r);
      phase("prioritize", "Priorización", r.ok ? "done" : "failed");
    } else phase("prioritize", "Priorización", "skipped");
  }
  // CRM proposals only for selected candidates, from their verified evidence
  let proposals = 0; let docId: string | null = null; let exId: string | null = null;
  const evid = candidates.flatMap((c) => [c.linkage.verified ? `[${c.company}] Vinculación: ${c.linkage.quote} (${c.linkage.url})` : null, c.signal.verified ? `[${c.company}] Señal: ${c.signal.quote} (${c.signal.url})` : null]).filter(Boolean).join("\n");
  if (evid) {
    const docText = `Prospección vía ${org.name} · consultada ${new Date().toISOString().slice(0, 10)}\n\n${evid}`;
    const { data: doc } = await sb.from("source_documents").insert({ workspace_id: data.workspace_id, kind: "research", title: `Prospección · ${org.name} · ${new Date().toISOString().slice(0, 10)}`, original_text: docText, organization_id: org.id }).select("id").single();
    docId = doc?.id ?? null;
    if (!doc) { issues.push({ kind: "persist_error", detail: "source_documents insert failed" }); }
    if (doc && meter.take("llm")) {
      const { data: ex } = await sb.from("brain_extractions").insert({ workspace_id: data.workspace_id, source_document_id: doc.id, model: MODEL }).select("id").single();
      exId = ex?.id ?? null;
      const pr = await llm(EXTRACTION_SYSTEM + RESEARCH_EXTRACTION_ADDENDUM, `<documento tipo="research" organizacion="${org.name}">\n${docText}\n</documento>`, "extraction", EXTRACTION_SCHEMA);
      if (pr.ok && ex) {
        const items = sanitizeProposals(((pr.json as { items?: ProposalItem[] }).items ?? []).filter((i) => ["need", "project", "affiliation"].includes(i.kind)), docText);
        if (items.length) {
          const { error: pe } = await sb.from("brain_proposals").insert(items.map((i, position) => ({ workspace_id: data.workspace_id, extraction_id: ex.id, kind: i.kind, proposed: i as never, evidence: i.evidence, ambiguity: i.ambiguity, position })));
          if (pe) issues.push({ kind: "persist_error", detail: pe.message }); else proposals = items.length;
        }
      } else { llmFail(pr.ok ? { message: "No se pudo crear la extracción." } : pr); if (ex) await sb.from("brain_extractions").update({ status: "failed", error: pr.ok ? null : pr.message }).eq("id", ex.id); }
      phase("proposals", "Propuestas para el CRM", proposals ? "done" : "failed");
    } else phase("proposals", "Propuestas para el CRM", doc ? "skipped" : "failed");
  } else phase("proposals", "Propuestas para el CRM", "skipped");
  // Final state computed after every phase, including persistence.
  const execution = P.deriveExecution({ searchConfigured: !!key, sources: sources.length, exhausted: meter.exhausted, issues });
  const { sufficiency, gaps } = P.assessSufficiency(candidates, budget.max_candidates);
  if (meter.exhausted.length) gaps.push(`Presupuesto agotado (${meter.exhausted.join(", ")}): resultado parcial.`);
  if (issues.length) gaps.push("Hubo fallos durante la ejecución que redujeron el alcance de la búsqueda.");
  if (!key) gaps.push("No se consultó internet porque la búsqueda web no está configurada.");
  if (!approved.length) gaps.push("No hay capacidades de Carbo aprobadas: las hipótesis no validan encaje técnico.");


  const view = P.buildProspectView({ execution, sufficiency, gaps, recommendation: "", priorities, phases, proposals_saved: proposals, candidates, profile_origin: profile.origin, notices: P.noticesFor(issues), usage: meter.usage(), sources: sources.map((s) => ({ url: s.url, title: s.title, published_at: s.published_at })) });
  const result = { kind: "prospecting", ...view, budget };
  await sb.from("research_runs").update({ status: execution === "completed" ? "done" : execution === "budget_exhausted" || execution === "partial" ? "partial" : execution === "search_unavailable" ? "not_configured" : "failed", search_error: errors.length ? errors.slice(0, 5).join(" · ") : null, fit: result as never, source_document_id: docId, extraction_id: exId }).eq("id", run.id);
  return { run_id: run.id, organization: org.name, errors, proposals, view, ...result };
}
