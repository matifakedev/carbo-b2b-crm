import { supabase } from "@/integrations/supabase/client";

export const LINK_KIND_LABELS: Record<string, string> = {
  knows: "Conoce",
  colleague: "Colega",
  internal_referral: "Deriva internamente",
  external_referral: "Deriva a otra empresa",
  other: "Otro vínculo",
};
export const INTRO_KIND_LABELS: Record<string, string> = {
  request: "Pedido pendiente",
  done: "Presentación realizada",
  hypothetical: "Conexión hipotética",
};
export const INTRO_STATUS_LABELS: Record<string, string> = {
  requested: "Solicitada",
  in_progress: "En curso",
  done: "Realizada",
  declined: "Rechazada",
  no_response: "Sin respuesta",
};
export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  waiting: "Esperando respuesta",
  done: "Hecha",
  cancelled: "Cancelada",
};
export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  not_discussed: "Sin hablar",
  interested: "Mostró interés",
  talking: "En conversación",
  agreed: "Acordado",
  discarded: "Descartado",
};

export type NodeKind = "person" | "org" | "pending" | "root";
export type GNode = { id: string; kind: NodeKind; label: string; archived: boolean; sourceIvlp?: boolean };
export type EdgeKind = "link" | "intro" | "intro_target" | "affiliation";
export type GEdge = {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
  /** introduction status / kind for filtering */
  status?: string;
  introKind?: string;
  ownerUserId?: string | null;
  refId: string;
  archived: boolean;
};
export type Graph = { nodes: Map<string, GNode>; edges: GEdge[] };

export const ROOT_ID = "root:ivlp";
export const personKey = (id: string) => `p:${id}`;
export const orgKey = (id: string) => `o:${id}`;

/** Loads the whole workspace graph. Expansion in the UI is on demand; the dataset is small. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadGraph(workspaceId: string, client: any = supabase): Promise<Graph> {
  const supabase = client as typeof import("@/integrations/supabase/client").supabase;
  const [people, orgs, links, intros, affs, members] = await Promise.all([
    supabase.from("people").select("id, full_name, archived_at, source_type").eq("workspace_id", workspaceId),
    supabase.from("organizations").select("id, name, archived_at").eq("workspace_id", workspaceId),
    supabase.from("person_links").select("id, from_person_id, to_person_id, kind, archived_at").eq("workspace_id", workspaceId),
    supabase.from("introductions").select("id, introducer_person_id, introduced_person_id, target_person_id, target_org_id, target_description, kind, status, owner_user_id, archived_at").eq("workspace_id", workspaceId),
    supabase.from("affiliations").select("id, person_id, organization_id, title, archived_at").eq("workspace_id", workspaceId),
    supabase.from("workspace_members").select("person_id").eq("workspace_id", workspaceId),
  ]);
  for (const r of [people, orgs, links, intros, affs, members]) if (r.error) throw r.error;
  const teamPersonIds = new Set((members.data ?? []).map((m) => m.person_id).filter(Boolean) as string[]);
  return buildGraph({
    people: people.data ?? [],
    orgs: orgs.data ?? [],
    links: links.data ?? [],
    intros: intros.data ?? [],
    affs: affs.data ?? [],
    teamPersonIds,
  });
}

type Raw = {
  people: { id: string; full_name: string; archived_at: string | null; source_type: string }[];
  orgs: { id: string; name: string; archived_at: string | null }[];
  links: { id: string; from_person_id: string; to_person_id: string; kind: string; archived_at: string | null }[];
  intros: {
    id: string; introducer_person_id: string | null; introduced_person_id: string | null;
    target_person_id: string | null; target_org_id: string | null; target_description: string | null;
    kind: string; status: string; owner_user_id: string | null; archived_at: string | null;
  }[];
  affs: { id: string; person_id: string; organization_id: string; title: string | null; archived_at: string | null }[];
  teamPersonIds: Set<string>;
};

export function buildGraph(r: Raw): Graph {
  const nodes = new Map<string, GNode>();
  nodes.set(ROOT_ID, { id: ROOT_ID, kind: "root", label: "IVLP · Equipo", archived: false });
  for (const p of r.people) nodes.set(personKey(p.id), { id: personKey(p.id), kind: "person", label: p.full_name, archived: !!p.archived_at, sourceIvlp: p.source_type === "ivlp" });
  for (const o of r.orgs) nodes.set(orgKey(o.id), { id: orgKey(o.id), kind: "org", label: o.name, archived: !!o.archived_at });
  const edges: GEdge[] = [];
  for (const p of r.people) {
    if (r.teamPersonIds.has(p.id)) edges.push({ id: `team:${p.id}`, from: ROOT_ID, to: personKey(p.id), kind: "link", label: "Equipo", refId: p.id, archived: false });
  }
  for (const l of r.links) edges.push({ id: `l:${l.id}`, from: personKey(l.from_person_id), to: personKey(l.to_person_id), kind: "link", label: LINK_KIND_LABELS[l.kind] ?? l.kind, refId: l.id, archived: !!l.archived_at });
  for (const a of r.affs) edges.push({ id: `a:${a.id}`, from: personKey(a.person_id), to: orgKey(a.organization_id), kind: "affiliation", label: a.title ? `Afiliación · ${a.title}` : "Afiliación", refId: a.id, archived: !!a.archived_at });
  for (const i of r.intros) {
    const base = { status: i.status, introKind: i.kind, ownerUserId: i.owner_user_id, refId: i.id, archived: !!i.archived_at };
    const label = `${INTRO_KIND_LABELS[i.kind] ?? i.kind}`;
    if (i.introducer_person_id && i.introduced_person_id)
      edges.push({ id: `i:${i.id}:a`, from: personKey(i.introducer_person_id), to: personKey(i.introduced_person_id), kind: "intro", label: `Presenta · ${label}`, ...base });
    const from = i.introducer_person_id ? personKey(i.introducer_person_id) : i.introduced_person_id ? personKey(i.introduced_person_id) : null;
    if (!from) continue;
    if (i.target_person_id) edges.push({ id: `i:${i.id}:p`, from, to: personKey(i.target_person_id), kind: "intro_target", label: `Introduce a · ${label}`, ...base });
    if (i.target_org_id) edges.push({ id: `i:${i.id}:o`, from, to: orgKey(i.target_org_id), kind: "intro_target", label: `Introduce a · ${label}`, ...base });
    if (!i.target_person_id && i.target_description) {
      const pid = `pending:${i.id}`;
      nodes.set(pid, { id: pid, kind: "pending", label: `Sin identificar: ${i.target_description}`, archived: !!i.archived_at });
      edges.push({ id: `i:${i.id}:x`, from, to: pid, kind: "intro_target", label: `Busca · ${label}`, ...base });
    }
  }
  // IVLP-sourced people hang from the root too when no team member path exists.
  for (const p of r.people) if (p.source_type === "ivlp" && !r.teamPersonIds.has(p.id)) edges.push({ id: `ivlp:${p.id}`, from: ROOT_ID, to: personKey(p.id), kind: "link", label: "Procedencia IVLP", refId: p.id, archived: false });
  return { nodes, edges };
}

export type EdgeFilter = { status?: string; owner?: string; includeArchived?: boolean };
export function edgePasses(e: GEdge, f: EdgeFilter) {
  if (!f.includeArchived && e.archived) return false;
  if (f.status && (e.kind === "intro" || e.kind === "intro_target") && e.status !== f.status) return false;
  if (f.owner && (e.kind === "intro" || e.kind === "intro_target") && e.ownerUserId !== f.owner) return false;
  return true;
}

/** Undirected neighbours of a node (relationships can be walked both ways). */
export function neighbors(g: Graph, id: string, f: EdgeFilter = {}) {
  const out: { edge: GEdge; other: string }[] = [];
  for (const e of g.edges) {
    if (!edgePasses(e, f)) continue;
    if (e.from === id) out.push({ edge: e, other: e.to });
    else if (e.to === id) out.push({ edge: e, other: e.from });
  }
  return out;
}

/**
 * All simple paths (no repeated node, so cycles never loop) from `start` to `target`, up to maxDepth hops.
 * Several routes to the same person are all returned; the person itself stays one node.
 */
export function findRoutes(g: Graph, start: string, target: string, maxDepth = 6, f: EdgeFilter = {}, limit = 20) {
  const routes: { nodes: string[]; edges: GEdge[] }[] = [];
  const walk = (cur: string, seen: Set<string>, nodes: string[], edges: GEdge[]) => {
    if (routes.length >= limit) return;
    if (cur === target) { routes.push({ nodes: [...nodes], edges: [...edges] }); return; }
    if (edges.length >= maxDepth) return;
    for (const { edge, other } of neighbors(g, cur, f)) {
      if (seen.has(other)) continue;
      // Do not route through organizations or pending targets: they are endpoints, not intermediaries.
      const n = g.nodes.get(other);
      if (other !== target && n && (n.kind === "org" || n.kind === "pending")) continue;
      seen.add(other); nodes.push(other); edges.push(edge);
      walk(other, seen, nodes, edges);
      seen.delete(other); nodes.pop(); edges.pop();
    }
  };
  walk(start, new Set([start]), [start], []);
  return routes;
}

/** Groups routes that visit the same people in the same order, shortest first. Several distinct paths stay separate. */
export function groupRoutes(routes: { nodes: string[]; edges: GEdge[] }[], max = 8) {
  const byKey = new Map<string, { nodes: string[]; steps: { labels: string[]; reversed: boolean }[] }>();
  for (const r of routes) {
    const key = r.nodes.join(">");
    const g = byKey.get(key) ?? { nodes: r.nodes, steps: r.edges.map(() => ({ labels: [] as string[], reversed: false })) };
    r.edges.forEach((e, i) => {
      const s = g.steps[i]!;
      const lbl = e.from === r.nodes[i] ? e.label : reverseLabel(e.label);
      if (!s.labels.includes(lbl)) s.labels.push(lbl);
      s.reversed = e.from !== r.nodes[i];
    });
    byKey.set(key, g);
  }
  return [...byKey.values()].sort((a, b) => a.nodes.length - b.nodes.length).slice(0, max);
}

function reverseLabel(l: string) {
  if (l.startsWith("Presenta · ")) return l.replace("Presenta · ", "Fue presentado por · ");
  if (l.startsWith("Introduce a · ")) return l.replace("Introduce a · ", "Llegó por introducción de · ");
  if (l.startsWith("Deriva")) return `Derivado por · ${l}`;
  return l;
}
