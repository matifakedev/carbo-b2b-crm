export const CARBO_WORKSPACE_ID = "00000000-0000-0000-0000-0000000ca7b0";
export const DEMO_WORKSPACE_ID = "00000000-0000-0000-0000-00000000de30";

export type SourceType = "personal" | "ivlp" | "public_research" | "hypothesis";
export type VerificationStatus = "unverified" | "verified" | "doubtful";
export type ContactKind = "email" | "phone" | "linkedin" | "other";

export const SOURCE_LABELS: Record<SourceType, string> = {
  personal: "Personal",
  ivlp: "IVLP",
  public_research: "Investigación pública",
  hypothesis: "Hipótesis",
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: "Sin verificar",
  verified: "Verificado",
  doubtful: "En duda",
};

export const CONTACT_LABELS: Record<ContactKind, string> = {
  email: "Email",
  phone: "Teléfono",
  linkedin: "LinkedIn",
  other: "Otro",
};

export const PERSON_ROLES: Record<string, string> = {
  connector: "Conector",
  technical_referent: "Referente técnico",
  commercial_collaborator: "Posible colaborador comercial",
};

export const ORG_ROLES: Record<string, string> = {
  institution: "Institución",
  potential_buyer: "Comprador potencial",
  partner: "Socio",
  validator: "Validador",
};

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

/** Describes the known tenure of an affiliation without inventing dates. */
export function describeTenure(a: {
  tenure_known: boolean;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean | null;
}) {
  const state = a.is_current === true ? "Actual" : a.is_current === false ? "Pasada" : "Estado desconocido";
  if (!a.tenure_known) return `${state} · vigencia desconocida`;
  const from = a.start_date ?? "?";
  const to = a.end_date ?? (a.is_current ? "hoy" : "?");
  return `${state} · ${from} → ${to}`;
}

export function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data).then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );
}
