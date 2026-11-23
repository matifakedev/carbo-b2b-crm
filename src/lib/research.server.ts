import { EXTRACTION_SCHEMA, EXTRACTION_SYSTEM, sanitizeProposals, type ProposalItem } from "@/lib/brain";
import {
  FINDINGS_SCHEMA, FINDINGS_SYSTEM, FIT_SCHEMA, FIT_SYSTEM, RESEARCH_EXTRACTION_ADDENDUM, buildQuery, classifyFindings,
  communicableCapabilities, sanitizeFits, softenClaims, usableCapabilities,
  type Capability, type Fit, type RawFinding, type Source,
} from "@/lib/research";

const MODEL = "openai/gpt-6-astra" as const;
const FC = "https://api.firecrawl.dev/v2";
const MAX_SRC = 12000;

async function llm(system: string, user: string, name: string, schema: unknown): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
  if (!process.env["LOVABLE_API_KEY"]) return { ok: false, message: "El Brain no está configurado." };
  const { generateResponse } = await import("@lovable.dev/ai-gateway");
  try {
    const res = await generateResponse({ model: MODEL, instructions: system, input: user, text: { format: { type: "json_schema", name, strict: true, schema: schema as Record<string, unknown> } } });
    const out = (res as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? [];
    const text = out.flatMap((o) => (o.type === "message" ? o.content ?? [] : [])).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
    if (!text) return { ok: false, message: "El proveedor de IA no devolvió contenido." };
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    console.error("research llm error", e);
    return { ok: false, message: "El proveedor de IA falló." };
  }
}

type Meta = Record<string, unknown> | undefined;
const pubDate = (m: Meta) => {
  const v = m?.["publishedTime"] ?? m?.["article:published_time"] ?? m?.["datePublished"] ?? m?.["date"] ?? m?.["og:published_time"];
  return typeof v === "string" && v.trim() ? v.trim() : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
};

export async function fcSearch(key: string, query: string): Promise<Source[]> {
  const r = await fetch(`${FC}/search`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 5, scrapeOptions: { formats: ["markdown"], onlyMainContent: true } }) });
  if (!r.ok) { const t = await r.text(); throw new Error(`Búsqueda web falló [${r.status}]: ${t.slice(0, 300)}`); }
  const j = (await r.json()) as { data?: { web?: { url: string; title?: string; markdown?: string; metadata?: Meta }[] } };
  return (j.data?.web ?? []).filter((w) => w.markdown?.trim()).map((w) => ({ url: w.url, title: w.title ?? (w.metadata?.["title"] as string) ?? null, published_at: pubDate(w.metadata), markdown: w.markdown!.slice(0, MAX_SRC), provided_by_user: false }));
}
async function fcScrape(key: string, url: string): Promise<Source> {
  const r = await fetch(`${FC}/scrape`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }) });
  if (!r.ok) { const t = await r.text(); throw new Error(`No se pudo leer ${url} [${r.status}]: ${t.slice(0, 200)}`); }
  const j = (await r.json()) as { data?: { markdown?: string; metadata?: Meta } };
  if (!j.data?.markdown?.trim()) throw new Error(`La página ${url} no tiene contenido legible.`);
  return { url, title: (j.data.metadata?.["title"] as string) ?? null, published_at: pubDate(j.data.metadata), markdown: j.data.markdown.slice(0, MAX_SRC), provided_by_user: true };
}

export type ResearchInput = { workspace_id: string; organization_id: string; focus: string; web_search: boolean; urls: string[]; pasted?: { title: string; url?: string; text: string } | null };

/** Web search that only returns organization candidates (name, url, snippet). Writes nothing. */
export async function findOrgCandidates(query: string): Promise<{ ok: true; candidates: { title: string; url: string; description: string }[] } | { ok: false; message: string }> {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) return { ok: false, message: "La búsqueda web no está configurada en este proyecto: no se consultó internet." };
  const r = await fetch(`${FC}/search`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, limit: 6 }) });
  if (!r.ok) { const t = await r.text(); return { ok: false, message: `Búsqueda web falló [${r.status}]: ${t.slice(0, 200)}` }; }
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

    if (data.web_search || data.urls.length) {
      if (!key) errors.push("La búsqueda web no está configurada en este proyecto: no se consultó internet.");
      else {
        if (data.web_search) { try { sources.push(...(await fcSearch(key, query))); } catch (e) { errors.push((e as Error).message); } }
        for (const u of data.urls) { try { sources.push(await fcScrape(key, u)); } catch (e) { errors.push((e as Error).message); } }
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
