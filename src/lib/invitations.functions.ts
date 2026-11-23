import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sha256Hex } from "@/lib/crm";

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Admin-only: create a single-use invitation link. The raw token is returned once and only its hash is stored. */
export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { workspaceId: string; email: string; role: "admin" | "collaborator" }) => {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Email inválido");
    if (input.role !== "admin" && input.role !== "collaborator") throw new Error("Rol inválido");
    return { workspaceId: input.workspaceId, email, role: input.role };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("is_workspace_admin", {
      _ws: data.workspaceId,
    });
    if (roleErr || !isAdmin) throw new Error("Solo un administrador puede invitar.");
    const token = randomToken();
    const token_hash = await sha256Hex(token);
    const { error } = await context.supabase.from("invitations").insert({
      workspace_id: data.workspaceId,
      email: data.email,
      role: data.role,
      token_hash,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { token };
  });

async function findValidInvitation(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const token_hash = await sha256Hex(token);
  const { data } = await supabaseAdmin
    .from("invitations")
    .select("id, email, role, workspace_id, expires_at, accepted_at, revoked_at, workspaces(name)")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (!data || data.accepted_at || data.revoked_at || new Date(data.expires_at) < new Date()) return null;
  return { inv: data, supabaseAdmin };
}

/** Public: shows the invitee which email/workspace the link is for. Reveals nothing without the token. */
export const getInvitation = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: String(input.token).slice(0, 128) }))
  .handler(async ({ data }) => {
    const found = await findValidInvitation(data.token);
    if (!found) return null;
    const ws = found.inv.workspaces as { name: string } | null;
    return { email: found.inv.email, role: found.inv.role, workspace: ws?.name ?? "" };
  });

/** Public: accepts an invitation, creating the account (signup is otherwise closed) and memberships. */
export const acceptInvitation = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; password: string; displayName: string }) => {
    if (!input.password || input.password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");
    return {
      token: String(input.token).slice(0, 128),
      password: input.password,
      displayName: String(input.displayName ?? "").trim().slice(0, 120),
    };
  })
  .handler(async ({ data }) => {
    const found = await findValidInvitation(data.token);
    if (!found) throw new Error("La invitación no es válida, ya se usó o venció.");
    const { inv, supabaseAdmin } = found;

    // Claim first so the link can't be used twice concurrently.
    const { data: claimed } = await supabaseAdmin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id)
      .is("accepted_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) throw new Error("La invitación ya fue utilizada.");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (error || !created.user) {
      await supabaseAdmin.from("invitations").update({ accepted_at: null }).eq("id", inv.id);
      throw new Error(
        error?.message?.includes("already") ? "Ya existe una cuenta con ese email. Iniciá sesión." : error?.message?.includes("weak") ? "Esa contraseña es demasiado común o filtrada. Elegí otra." : "No se pudo crear la cuenta.",
      );
    }
    const userId = created.user.id;
    // Membership in the invited workspace plus the demo workspace.
    const { data: demo } = await supabaseAdmin.from("workspaces").select("id").eq("is_demo", true);
    const rows = [inv.workspace_id, ...(demo ?? []).map((d) => d.id)]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((wsId) => ({
        workspace_id: wsId,
        user_id: userId,
        role: wsId === inv.workspace_id ? inv.role : ("collaborator" as const),
        email: inv.email,
        display_name: data.displayName || null,
      }));
    await supabaseAdmin.from("workspace_members").upsert(rows, { onConflict: "workspace_id,user_id" });
    return { email: inv.email };
  });
