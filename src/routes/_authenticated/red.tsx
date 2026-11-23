import { createFileRoute, Link } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, selectClass } from "@/components/crm/fields";
import { useMembers } from "@/lib/options";
import { RouteList } from "@/components/crm/RouteList";
import { INTRO_STATUS_LABELS, ROOT_ID, edgePasses, findRoutes, loadGraph, neighbors, type EdgeFilter, type GEdge } from "@/lib/network";

const NetworkMap = lazy(() => import("@/components/crm/NetworkMap"));

type Search = { origen?: string };
export const Route = createFileRoute("/_authenticated/red")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s["origen"] === "string" ? { origen: s["origen"] } : {}),
  head: () => ({ meta: [{ title: "Red · CRM - CARBO" }, { name: "description", content: "Mapa navegable de la red de relaciones de Carbo." }, { property: "og:title", content: "Red · CRM - CARBO" }, { property: "og:description", content: "Mapa navegable de la red de relaciones de Carbo." }] }),
  component: NetworkPage,
});

function NetworkPage() {
  const { current } = useWorkspace();
  const { origen } = Route.useSearch();
  const { data: members = [] } = useMembers(current?.id);
  const { data: graph } = useQuery({ queryKey: ["graph", current?.id], enabled: !!current, queryFn: () => loadGraph(current!.id) });
  const origin = origen ?? ROOT_ID;
  const [view, setView] = useState<"map" | "list">("map");
  const [status, setStatus] = useState(""); const [owner, setOwner] = useState(""); const [archived, setArchived] = useState(false);
  const [q, setQ] = useState("");
  const filter: EdgeFilter = { ...(status ? { status } : {}), ...(owner ? { owner } : {}), includeArchived: archived };
  // Expansion state: which nodes the user opened, in order (the trail).
  const [trail, setTrail] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [originKey, setOriginKey] = useState(origin);
  if (originKey !== origin) { setOriginKey(origin); setTrail([]); setSelected(null); }
  const expanded = useMemo(() => new Set([origin, ...trail]), [origin, trail]);

  const view_ = useMemo(() => {
    if (!graph || !graph.nodes.has(origin)) return null;
    const depth = new Map<string, number>([[origin, 0]]);
    const order = [origin];
    const edges = new Map<string, GEdge>();
    // Expand in the order the user opened nodes; each node is added once, so cycles can't expand forever.
    for (const id of [origin, ...trail]) {
      if (!depth.has(id)) continue;
      for (const { edge, other } of neighbors(graph, id, filter)) {
        if (!depth.has(other)) { depth.set(other, (depth.get(id) ?? 0) + 1); order.push(other); }
        edges.set(edge.id, edge);
      }
    }
    // Also show edges between visible nodes (second routes to the same person).
    for (const e of graph.edges) if (edgePasses(e, filter) && depth.has(e.from) && depth.has(e.to)) edges.set(e.id, e);
    const cols = new Map<number, number>();
    const positions: Record<string, { x: number; y: number }> = {};
    for (const id of order) { const d = depth.get(id)!; const i = cols.get(d) ?? 0; cols.set(d, i + 1); positions[id] = { x: d * 320, y: i * 110 }; }
    return { nodes: order.map((id) => graph.nodes.get(id)!), edges: [...edges.values()], positions, depth };
  }, [graph, origin, trail, status, owner, archived]); // eslint-disable-line react-hooks/exhaustive-deps

  const routes = useMemo(() => (graph && selected && selected !== origin ? findRoutes(graph, origin, selected, 6, filter) : []), [graph, selected, origin, status, owner, archived]); // eslint-disable-line react-hooks/exhaustive-deps

  function clickNode(id: string) {
    setSelected(id);
    const n = graph?.nodes.get(id);
    if (n && n.kind !== "pending" && !expanded.has(id)) setTrail((t) => [...t, id]);
  }

  const searchResults = graph && q.trim().length > 1
    ? [...graph.nodes.values()].filter((n) => n.kind !== "pending" && n.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const label = (id: string) => graph?.nodes.get(id)?.label ?? "?";
  const detailLink = (id: string) => id.startsWith("p:") ? <Link to="/personas/$id" params={{ id: id.slice(2) }} className="text-sm font-semibold text-primary hover:underline">Abrir ficha</Link>
    : id.startsWith("o:") ? <Link to="/organizaciones/$id" params={{ id: id.slice(2) }} className="text-sm font-semibold text-primary hover:underline">Abrir ficha</Link> : null;

  return (
    <>
      <PageHeader crumb={`Red / ${current?.name ?? ""}`} title="Mapa de la red"
        action={<div className="flex gap-2"><Button variant={view === "map" ? "default" : "outline"} onClick={() => setView("map")}>Mapa</Button><Button variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>Lista</Button></div>} />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_200px_200px_auto]">
        <div className="relative">
          <Input aria-label="Buscar en la red" placeholder="Buscar persona u organización para empezar desde ahí" value={q} onChange={(e) => setQ(e.target.value)} />
          {searchResults.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full border border-border bg-card">
              {searchResults.map((n) => <li key={n.id}><Link to="/red" search={{ origen: n.id }} onClick={() => setQ("")} className="block px-3 py-2 text-sm hover:bg-accent">{n.label} <span className="label-mono text-muted-foreground">{n.kind === "org" ? "Org" : n.kind === "root" ? "" : "Persona"}</span></Link></li>)}
            </ul>
          )}
        </div>
        <select aria-label="Estado de introducción" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todo estado</option>{Object.entries(INTRO_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="Responsable" className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Todo responsable</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}</select>
        <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Incluir archivados</label>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-xs">
        <span className="label-mono text-muted-foreground">Recorrido:</span>
        <button className="font-semibold text-primary hover:underline" onClick={() => { setTrail([]); setSelected(null); }}>{label(origin)}</button>
        {trail.map((id, i) => <span key={id}>› <button className="hover:underline" onClick={() => { setTrail(trail.slice(0, i + 1)); setSelected(id); }}>{label(id)}</button></span>)}
        {origin !== ROOT_ID && <Link to="/red" search={{}} className="ml-4 font-semibold text-primary hover:underline">Volver al origen IVLP</Link>}
      </div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>━ vínculo</span><span>┅ presentación</span><span className="text-warning">┅ destino buscado</span><span>··· afiliación</span><span>▭ persona</span><span className="font-semibold text-primary">▣ organización</span><span>⬚ sin identificar</span>
      </div>
      {!view_ ? <p className="text-muted-foreground">Cargando red…</p> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          {view === "map" ? (
            <ClientOnly fallback={<div className="h-[560px] panel" />}>
              <Suspense fallback={<div className="h-[560px] panel" />}>
                <NetworkMap nodes={view_.nodes} edges={view_.edges} positions={view_.positions} selected={selected} expanded={expanded} onNodeClick={clickNode} />
              </Suspense>
            </ClientOnly>
          ) : (
            <div className="panel divide-y divide-border">
              {view_.nodes.map((n) => (
                <div key={n.id} className="flex items-center justify-between gap-3 px-4 py-2" style={{ paddingLeft: 16 + (view_.depth.get(n.id) ?? 0) * 24 }}>
                  <button onClick={() => clickNode(n.id)} className={`text-left text-sm ${selected === n.id ? "font-bold text-primary" : "font-medium"} ${n.archived ? "opacity-60" : ""}`}>
                    <span className="label-mono mr-2 text-muted-foreground">{n.kind === "org" ? "Org" : n.kind === "pending" ? "Sin id." : n.kind === "root" ? "Origen" : "Pers."}</span>{n.label}{n.archived ? " (archivado)" : ""}
                  </button>
                  <span className="font-mono text-[10px] text-muted-foreground">{n.kind === "pending" ? "" : expanded.has(n.id) ? "expandido" : "+ expandir"}</span>
                </div>
              ))}
            </div>
          )}
          <aside className="panel space-y-4 p-6">
            {!selected ? <p className="text-sm text-muted-foreground">Elegí un nodo para expandirlo y ver las rutas desde el origen.</p> : (
              <>
                <div><div className="label-mono text-muted-foreground">Seleccionado</div><div className="text-lg font-semibold">{label(selected)}</div>{detailLink(selected)}</div>
                <div>
                  <div className="label-mono mb-2 text-muted-foreground">Rutas desde {label(origin)}</div>
                  <RouteList routes={routes} label={label} />
                </div>
                {graph && <div className="flex flex-wrap gap-1">{neighbors(graph, selected, filter).filter((x) => x.edge.status).map((x) => <Tag key={x.edge.id}>{INTRO_STATUS_LABELS[x.edge.status!]}</Tag>)}</div>}
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
