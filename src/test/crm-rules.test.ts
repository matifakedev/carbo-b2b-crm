import { describe, expect, it } from "vitest";
import { describeTenure } from "@/lib/crm";

describe("affiliation tenure", () => {
  it("never invents dates when tenure is unknown", () => {
    expect(describeTenure({ tenure_known: false, start_date: "2020-01-01", end_date: null, is_current: true })).toBe("Actual · vigencia desconocida");
  });
  it("shows unknown current state explicitly", () => {
    expect(describeTenure({ tenure_known: false, start_date: null, end_date: null, is_current: null })).toBe("Estado desconocido · vigencia desconocida");
  });
});
