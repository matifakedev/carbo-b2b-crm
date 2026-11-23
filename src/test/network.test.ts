import { describe, expect, it } from "vitest";
import { buildGraph, findRoutes, neighbors, personKey, ROOT_ID } from "@/lib/network";

const P = (id: string, source = "personal") => ({ id, full_name: id, archived_at: null, source_type: source });
const link = (id: string, a: string, b: string) => ({ id, from_person_id: a, to_person_id: b, kind: "knows", archived_at: null });

function scenario() {
  return buildGraph({
    people: [P("matias"), P("laura", "ivlp"), P("carla"), P("esteban"), P("diego")],
    orgs: [],
    links: [link("1", "matias", "laura"), link("2", "laura", "carla"), link("3", "laura", "esteban"), link("4", "carla", "diego"), link("5", "esteban", "diego"), link("6", "diego", "laura")],
    intros: [{ id: "i1", introducer_person_id: "laura", introduced_person_id: "matias", target_person_id: null, target_org_id: null, target_description: "Compras de Gamma", kind: "request", status: "requested", owner_user_id: null, archived_at: null }],
    affs: [],
    teamPersonIds: new Set(["matias"]),
  });
}

describe("network routes", () => {
  it("finds both routes to the same engineer while keeping a single node", () => {
    const g = scenario();
    const routes = findRoutes(g, personKey("matias"), personKey("diego"));
    const viaCarla = routes.some((r) => r.nodes.includes(personKey("carla")));
    const viaEsteban = routes.some((r) => r.nodes.includes(personKey("esteban")));
    expect(viaCarla && viaEsteban).toBe(true);
    expect([...g.nodes.keys()].filter((k) => k === personKey("diego"))).toHaveLength(1);
  });
  it("terminates on cycles and never repeats a node within a route", () => {
    const routes = findRoutes(scenario(), ROOT_ID, personKey("diego"), 10);
    for (const r of routes) expect(new Set(r.nodes).size).toBe(r.nodes.length);
  });
  it("represents an unidentified target without creating a person", () => {
    const g = scenario();
    expect([...g.nodes.values()].filter((n) => n.kind === "person")).toHaveLength(5);
    expect(neighbors(g, personKey("laura")).some((n) => n.other.startsWith("pending:"))).toBe(true);
  });
});
