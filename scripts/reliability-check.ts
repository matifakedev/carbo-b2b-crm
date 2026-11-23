// Integration check (Demostración workspace) for Brain writes and undo. Needs a session from `lovable auth-session` with demo membership; creates "ZZ" test rows to archive afterwards.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const s = JSON.parse(readFileSync(process.env.HOME + "/.cache/lovable-auth/session.json", "utf8"));
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
await sb.auth.setSession({ access_token: s.session.access_token, refresh_token: s.session.refresh_token });
const ws = "00000000-0000-0000-0000-00000000de30"; const other = "00000000-0000-0000-0000-0000000ca7b0";
const out: [string, boolean, string][] = [];
const k = () => "zz-" + crypto.randomUUID();
const ap = (key: string | null, steps: unknown) => sb.rpc("brain_apply", { _ws: ws, _thread: null, _op_key: key, _steps: steps as never });
// 1 idempotencia
const key = k(); const st = [{ ref: "p", table: "people", op: "insert", values: { full_name: "ZZ Idem " + key.slice(3, 9), source_type: "personal" }, summary: "t" }];
const r1 = await ap(key, st); const r2 = await ap(key, st);
const { count } = await sb.from("people").select("id", { count: "exact", head: true }).eq("full_name", st[0]!.values.full_name);
out.push(["doble envío sin duplicados", count === 1 && (r2.data as any)?.replayed === true, `${count} ${r1.error?.message ?? ""}`]);
const pid = (r1.data as any).refs.p;
// 2 fallo parcial
const fk = k(); const f = await ap(fk, [{ ref: "p", table: "people", op: "insert", values: { full_name: "ZZ Fallo " + fk.slice(3, 9), source_type: "personal" }, summary: "t" }, { table: "person_contacts", op: "insert", values: { person_id: "$ref:p", kind: "no_existe", value: "x" }, summary: "t" }]);
const { count: c2 } = await sb.from("people").select("id", { count: "exact", head: true }).eq("full_name", "ZZ Fallo " + fk.slice(3, 9));
out.push(["fallo parcial: nada aplicado", !!f.error && c2 === 0, f.error?.message ?? "no falló"]);
// 3 otro espacio (directo)
const { data: demoOrg } = await sb.from("organizations").select("id").eq("workspace_id", ws).limit(1).single();
const x = await sb.from("affiliations").insert({ workspace_id: other, person_id: pid, organization_id: demoOrg!.id, source_type: "personal" } as never);
out.push(["insert en espacio ajeno rechazado", !!x.error, x.error?.message ?? ""]);
const y = await ap(null, [{ table: "tasks", op: "insert", values: { title: "ZZ x", person_id: crypto.randomUUID() }, summary: "t" }]);
out.push(["referencia inexistente rechazada", !!y.error, y.error?.message ?? ""]);
// 4 persona usada después se conserva
await ap(k(), [{ table: "tasks", op: "insert", values: { title: "ZZ espera", waiting_on_person_id: pid }, summary: "t" }]);
const u1 = await sb.rpc("brain_undo_action", { _id: (r1.data as any).results[0].action_id });
const { data: still } = await sb.from("people").select("archived_at").eq("id", pid).single();
out.push(["deshacer conserva persona usada después", !still!.archived_at && (u1.data as any)?.kept?.length === 1, JSON.stringify(u1.data ?? u1.error)]);
// 5 A→B (Brain), B→C (otra edición), deshacer conserva C
const a = await ap(k(), [{ ref: "p", table: "people", op: "insert", values: { full_name: "ZZ ABC", location: "A", source_type: "personal" }, summary: "t" }]);
const p2 = (a.data as any).refs.p;
const ab = await ap(k(), [{ table: "people", op: "update", id: p2, values: { location: "B" }, summary: "A→B" }]);
await sb.from("people").update({ location: "C" }).eq("id", p2);
const u2 = await sb.rpc("brain_undo_action", { _id: (ab.data as any).results[0].action_id });
const { data: l } = await sb.from("people").select("location").eq("id", p2).single();
out.push(["A→B, B→C, deshacer conserva C", l!.location === "C" && (u2.data as any).kept.length === 1, JSON.stringify(u2.data)]);
// 6 sin conflicto restaura
const cd = await ap(k(), [{ table: "people", op: "update", id: p2, values: { location: "D" }, summary: "C→D" }]);
await sb.rpc("brain_undo_action", { _id: (cd.data as any).results[0].action_id });
const { data: l2 } = await sb.from("people").select("location").eq("id", p2).single();
out.push(["deshacer sin conflicto restaura", l2!.location === "C", l2!.location ?? ""]);
// 7 crear persona editada después: no se archiva
const e = await ap(k(), [{ ref: "p", table: "people", op: "insert", values: { full_name: "ZZ Editada", source_type: "personal" }, summary: "t" }, { table: "person_contacts", op: "insert", values: { person_id: "$ref:p", kind: "email", value: "zz@ej.com" }, summary: "t" }]);
const ep = (e.data as any).refs.p;
const { data: pc } = await sb.from("person_contacts").select("id").eq("person_id", ep).single();
await sb.from("person_contacts").update({ value: "zz2@ej.com" }).eq("id", pc!.id);
const u3 = await sb.rpc("brain_undo_action", { _id: (e.data as any).results[0].action_id });
const { data: pcs } = await sb.from("person_contacts").select("id").eq("person_id", ep);
out.push(["contacto editado no se borra al deshacer", pcs!.length === 1 && (u3.data as any).kept.length >= 1, JSON.stringify(u3.data)]);
// 8 ficha propia + asociación se deshacen juntas
const me = await ap(k(), [{ ref: "me", table: "people", op: "insert", values: { full_name: "ZZ Tester Agente", source_type: "personal" }, summary: "ficha" }, { op: "set_my_person", person_ref: "me", summary: "asociar" }]);
if (me.error) console.log("ME ERR", me.error.message);
const { data: m1 } = await sb.from("workspace_members").select("person_id").eq("workspace_id", ws).eq("user_id", "8497be00-1838-4034-abb9-bed14e2c81c3").single();
const u4 = await sb.rpc("brain_undo_action", { _id: (me.data as any).results[0].action_id });
const { data: m2 } = await sb.from("workspace_members").select("person_id").eq("workspace_id", ws).eq("user_id", "8497be00-1838-4034-abb9-bed14e2c81c3").single();
const { data: mp } = await sb.from("people").select("archived_at").eq("id", (me.data as any).refs.me).single();
out.push(["deshacer ficha propia revierte asociación y ficha", m1!.person_id === (me.data as any).refs.me && m2!.person_id === null && !!mp!.archived_at, JSON.stringify(u4.data ?? u4.error ?? me.error)]);
for (const [n, ok, d] of out) console.log(ok ? "PASS" : "FAIL", n, "—", d.slice(0, 200));
