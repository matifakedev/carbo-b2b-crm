/** Project / opportunity rules shared by UI and tests. */
export const ROLE_LABELS: Record<string, string> = {
  buyer: "Comprador contractual posible",
  end_user: "Usuario final",
  economic_decider: "Decisor económico",
  technical_evaluator: "Evaluador técnico",
  internal_champion: "Promotor interno",
  other: "Otro participante",
};
export const ROLES = Object.keys(ROLE_LABELS);
export const STAGE_LABELS: Record<string, string> = {
  discovery: "Descubrimiento", validation: "Validación", proposal: "Propuesta", negotiation: "Negociación", won: "Ganada", lost: "Perdida",
};
export const STAGES = Object.keys(STAGE_LABELS);

/** Shows a magnitude exactly as recorded; unknown stays unknown (never derived from other fields). */
export function formatQuantity(v: number | null | undefined, unit: string) {
  return v == null ? `${unit}: desconocido` : `${v.toLocaleString("es-AR")} ${unit}`;
}

export type OppDraft = { project_id: string | null; title: string; need: string; rationale: string };
/** A commercial opportunity needs a concrete project, an identified need and a recorded rationale. */
export function validateOpportunity(d: OppDraft): string | null {
  if (!d.project_id) return "La oportunidad tiene que pertenecer a un proyecto o caso de uso concreto.";
  if (!d.title.trim()) return "Poné un título.";
  if (!d.need.trim()) return "Falta la necesidad identificada.";
  if (!d.rationale.trim()) return "Falta el fundamento registrado.";
  return null;
}

/** Mirrors the DB default: institutional relations and research hypotheses stay out of the pipeline unless someone opts in. */
export function defaultInPipeline(kind: "commercial" | "institutional", source: string) {
  return !(kind === "institutional" || source === "hypothesis");
}
