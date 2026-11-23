type T = { status: string; due_date: string | null; review_at: string | null };
/** Agenda buckets. Waiting tasks go to "waiting" unless their due date already passed. Dates are ISO yyyy-mm-dd. */
export function groupAgenda<R extends T>(rows: R[], today: string) {
  const overdue: R[] = [], waiting: R[] = [], upcoming: R[] = [], undated: R[] = [];
  for (const t of rows) {
    if (t.status !== "open" && t.status !== "waiting") continue;
    if (t.due_date && t.due_date < today) overdue.push(t);
    else if (t.status === "waiting") waiting.push(t);
    else if (t.due_date) upcoming.push(t);
    else undated.push(t);
  }
  waiting.sort((a, b) => (a.review_at ?? "9999").localeCompare(b.review_at ?? "9999"));
  return { overdue, waiting, upcoming, undated };
}
