import type { ProposalItem } from "@/lib/brain";

export type Action = "accept" | "correct" | "reject" | "pending";
export type Decision = { action: Action; edits: Record<string, string | null> };

/** Builds the confirm payload: only accepted/corrected/rejected proposals; pending ones are left untouched. */
export function buildDecisions(pending: { id: string; proposed: ProposalItem }[], dec: Record<string, Decision>) {
  return pending.flatMap((p) => {
    const d = dec[p.id];
    if (!d || d.action === "pending") return [];
    if (d.action === "reject") return [{ proposal_id: p.id, action: "reject" }];
    const edited = Object.keys(d.edits).length > 0;
    return [{ proposal_id: p.id, action: edited ? "correct" : "accept", final: { ...p.proposed, ...d.edits } }];
  });
}
