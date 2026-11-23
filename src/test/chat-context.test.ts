import { describe, expect, it } from "vitest";
import { PROVISIONAL_PROFILE, carboContextView, localToday } from "@/lib/chat-agent";

describe("contexto de Carbo", () => {
  const cap = (o: Record<string, unknown> = {}) => ({ title: "LDES", applications: "respaldo", limits: "desde 10 MWh", evidence: "piloto", communicable: "Ofrecemos LDES", is_commercial_sensitive: false, status: "approved", ...o });
  it("sin perfil aprobado usa el provisional de grandes proyectos y muchas horas", () => {
    const v = carboContextView([], []);
    expect(v.commercial_profile[0]!.body).toBe(PROVISIONAL_PROFILE);
    expect(PROVISIONAL_PROFILE).toMatch(/muchas horas/);
  });
  it("lo no aprobado o sensible nunca es comunicable", () => {
    const v = carboContextView([cap(), cap({ title: "B", status: "draft" }), cap({ title: "C", is_commercial_sensitive: true })],
      [{ kind: "claim", title: "X", body: "dato", evidence: null, is_sensitive: false, status: "draft" }, { kind: "team_note", title: "N", body: "nota", evidence: null, is_sensitive: true, status: "draft" }]);
    expect(v.communicable_claims.map((c) => c.title)).toEqual(["LDES"]);
    expect(v.capabilities.find((c) => c.title === "B")!.status).toMatch(/sin aprobar/);
    expect(v.team_info_unverified.map((c) => c.title)).toEqual(["N"]);
    expect(v.capabilities[0]!.limits).toBe("desde 10 MWh");
  });
});

describe("fecha local", () => {
  it("usa la zona del espacio, no UTC", () => {
    const now = new Date("2026-11-24T01:30:00Z"); // 22:30 del 23 en Buenos Aires
    expect(localToday("America/Argentina/Buenos_Aires", now)).toBe("2026-11-23");
    expect(localToday("UTC", now)).toBe("2026-11-24");
  });
});
