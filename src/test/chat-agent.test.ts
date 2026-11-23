import { describe, expect, it } from "vitest";
import { pickAllowed, stripInventedNumbers, validIsoDate } from "@/lib/chat-agent";

describe("chat agent rules", () => {
  it("keeps MW the user wrote and drops MWh/hours it did not", () => {
    const r = stripInventedNumbers({ power_mw: 3, energy_mwh: 12, duration_h: 4 }, "respaldo de 3 MW en Rosario");
    expect(r.fields).toEqual({ power_mw: 3 });
    expect(r.dropped).toEqual(["energy_mwh", "duration_h"]);
  });
  it("accepts comma decimals as written", () => {
    expect(stripInventedNumbers({ power_mw: 2.5 }, "unos 2,5 MW").fields).toEqual({ power_mw: 2.5 });
  });
  it("never lets the Brain edit stage, amount or probability", () => {
    expect(pickAllowed("project", { name: "x", stage: "won", amount: 10, probability: 0.9 })).toEqual({ name: "x" });
  });
  it("rejects impossible dates", () => {
    expect(validIsoDate("2026-02-30")).toBeNull();
    expect(validIsoDate("2026-11-27")).toBe("2026-11-27");
  });
});
