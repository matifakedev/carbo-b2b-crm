import { describe, it, expect } from "vitest";
import { candidateOptions, queryNamesPerson, researchForChat, TOOLS } from "@/lib/chat-agent";

describe("chat research rules", () => {
  it("lists homonym candidates as distinct concrete options", () => {
    const o = candidateOptions([
      { title: "AIM - Association A", url: "https://www.aim-a.org/x", description: "Trade association" },
      { title: "AIM again", url: "https://aim-a.org/y", description: "" },
      { title: "AIM Industries", url: "https://aimind.com", description: "Manufacturer" },
    ]);
    expect(o).toHaveLength(2);
    expect(o[0]).toContain("aim-a.org");
  });
  it("blocks web searches about named people", () => {
    expect(queryNamesPerson("Joaquin Prueba AIM gerente", ["Joaquín Prueba"])).toBe(true);
    expect(queryNamesPerson("AIM association USA", ["Joaquín Prueba"])).toBe(false);
  });
  it("never treats insufficient findings as evidence and marks access unconfirmed", () => {
    const r = researchForChat([
      { statement: "X es miembro", condition: "fact", url: "u", published_at: null, category: "member", quote: "q" },
      { statement: "Y", condition: "insufficient", url: "v", published_at: null, category: "need", quote: null },
    ]);
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0]!.personal_access).toBe("no confirmado");
    expect(r.insufficient).toHaveLength(1);
  });
  it("exposes research tools to the chat", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_context", "find_organization_candidates", "research_organization"]));
  });
});
