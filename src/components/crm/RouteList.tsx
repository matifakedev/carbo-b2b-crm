import type { GEdge } from "@/lib/network";
import { groupRoutes } from "@/lib/network";

export function RouteList({ routes, label }: { routes: { nodes: string[]; edges: GEdge[] }[]; label: (id: string) => string }) {
  const grouped = groupRoutes(routes);
  if (grouped.length === 0) return <p className="text-sm text-muted-foreground">Sin rutas registradas con estos filtros.</p>;
  return (
    <ol className="space-y-3">
      {grouped.map((r, i) => (
        <li key={i} className="border-l-2 border-primary pl-3 text-sm">
          <div className="label-mono mb-1 text-muted-foreground">Ruta {i + 1} · {r.nodes.length - 1} pasos</div>
          {r.nodes.map((n, j) => (
            <span key={n}>
              {j > 0 && <span className="font-mono text-[10px] text-muted-foreground"> —{r.steps[j - 1]!.labels.join(" / ")}→ </span>}
              <span className="font-medium">{label(n)}</span>
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
