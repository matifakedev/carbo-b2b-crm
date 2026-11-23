import { describe, expect, it } from "vitest";
import { groupAgenda } from "@/lib/agenda";

describe("agenda buckets", () => {
  const today = "2026-11-23";
  it("separates overdue, upcoming, undated and waiting, ignoring finished tasks", () => {
    const g = groupAgenda([
      { id: "a", status: "open", due_date: "2026-11-20", review_at: null },
      { id: "b", status: "open", due_date: "2026-11-30", review_at: null },
      { id: "c", status: "open", due_date: null, review_at: null },
      { id: "d", status: "waiting", due_date: null, review_at: "2026-11-25" },
      { id: "e", status: "done", due_date: "2026-11-01", review_at: null },
    ], today);
    expect(g.overdue.map((t) => t.id)).toEqual(["a"]);
    expect(g.upcoming.map((t) => t.id)).toEqual(["b"]);
    expect(g.undated.map((t) => t.id)).toEqual(["c"]);
    expect(g.waiting.map((t) => t.id)).toEqual(["d"]);
  });
});
