import type { CSSProperties } from "react";
import { ReactFlow, Background, Controls, MarkerType, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GEdge, GNode } from "@/lib/network";

const edgeStyle: Record<string, CSSProperties> = {
  link: { stroke: "var(--color-primary)", strokeWidth: 2 },
  intro: { stroke: "var(--color-foreground)", strokeWidth: 2, strokeDasharray: "6 4" },
  intro_target: { stroke: "var(--color-warning)", strokeWidth: 2, strokeDasharray: "6 4" },
  affiliation: { stroke: "var(--color-muted-foreground)", strokeWidth: 1.5, strokeDasharray: "2 4" },
};

export default function NetworkMap({ nodes, edges, positions, selected, expanded, onNodeClick }: {
  nodes: GNode[]; edges: GEdge[]; positions: Record<string, { x: number; y: number }>; selected: string | null; expanded: Set<string>;
  onNodeClick: (id: string) => void;
}) {
  const rfNodes: Node[] = nodes.map((n) => ({
    id: n.id,
    position: positions[n.id] ?? { x: 0, y: 0 },
    data: { label: (
      <div className="text-left">
        <div className="label-mono text-[9px] opacity-70">{n.kind === "person" ? "Persona" : n.kind === "org" ? "Organización" : n.kind === "pending" ? "Destino sin identificar" : "Origen"}{n.archived ? " · archivado" : ""}</div>
        <div className="text-xs font-semibold leading-tight">{n.label}</div>
        {n.kind !== "pending" && <div className="mt-1 font-mono text-[9px] opacity-70">{expanded.has(n.id) ? "expandido" : "clic para expandir"}</div>}
      </div>
    ) },
    className: [
      "!rounded-sm !px-3 !py-2 !w-52 !text-foreground",
      n.kind === "root" ? "!bg-sidebar !text-sidebar-foreground !border-sidebar" : n.kind === "org" ? "!bg-accent !border-2 !border-primary" : n.kind === "pending" ? "!bg-card !border-dashed !border-border-strong" : "!bg-card !border-border-strong",
      n.archived ? "opacity-60" : "",
      selected === n.id ? "!outline-3 !outline-mint" : "",
    ].join(" "),
  }));
  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id, source: e.from, target: e.to, label: e.label,
    style: { ...edgeStyle[e.kind], opacity: e.archived ? 0.4 : 1 },
    labelStyle: { fontFamily: "var(--font-mono)", fontSize: 9 },
    labelBgStyle: { fill: "var(--color-background)" },
    ...(e.kind === "affiliation" ? {} : { markerEnd: { type: MarkerType.ArrowClosed } }),
  }));
  return (
    <div className="h-[560px] w-full rounded-sm border border-border bg-panel-subtle">
      <ReactFlow nodes={rfNodes} edges={rfEdges} fitView nodesDraggable onNodeClick={(_, n) => onNodeClick(n.id)} proOptions={{ hideAttribution: true }}>
        <Background gap={24} color="var(--color-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
