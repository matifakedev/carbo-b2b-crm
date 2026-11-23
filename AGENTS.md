<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- All CRM data is scoped by `workspace_id`; RLS uses `is_workspace_member` / `is_workspace_admin` security-definer functions. Why: permissions must hold in the backend, not just the UI.
- Public signup is disabled; accounts are created only via single-use hashed invitation tokens (`src/lib/invitations.functions.ts`) or the `admin_bootstrap` email trigger. Why: private workspace, no access by URL.
- People ↔ organizations is N:N through `affiliations`; never put an org FK on `people`. Why: future introductions/projects reference people across orgs.
- Records are archived (`archived_at`), never deleted; audit fields are set by the `set_audit_fields` trigger.
- Duplicates are only suggested (`find_person_duplicates`, `find_org_duplicates`), never merged automatically.
- Network edges come from `person_links`, `introductions` (each event kept separately) and `affiliations`; the graph is built client-side in `src/lib/network.ts` and traversed with simple paths (no repeated node). Why: multiple routes to one person without duplicating identities, cycles safe.
- Unidentified introduction targets are stored as `target_description`, never as placeholder people.
- Conversations are single rows linked through `conversation_links` (person/org/introduction). Why: one conversation, many participants, no duplicates.
