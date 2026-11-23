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
- Brain (LLM) calls run only in server functions (`src/lib/brain.functions.ts`, `src/lib/chat.functions.ts`, `src/lib/research.functions.ts`) (server, `requireSupabaseAuth`, user RLS client). Context comes only from confirmed records linked to the focus; pure rules live in `src/lib/brain.ts`. Why: workspace isolation and drafts never treated as facts.
- Pasted text is kept verbatim in `source_documents`; Brain output becomes `brain_proposals` and reaches CRM tables only through the `confirm_extraction` SQL function, which skips already-decided proposals. Why: human review, provenance, no duplicates on retry.
- Projects ↔ organizations is N:N (`project_organizations`); buying roles live in `project_participants` (person, org, or `unidentified_description`, exactly one). Opportunities always belong to a project and require need + rationale; `in_pipeline` defaults off for institutional/hypothesis via trigger, and stage changes are logged in `opportunity_stage_events`. Why: pipeline only counts grounded commercial cases.
- MW, MWh and hours are stored separately and never derived; there is no probability field, and the Brain cannot propose opportunities, stages or amounts. Why: no invented values.
- Carbo capabilities (`carbo_capabilities`) are approved only by workspace admins (trigger `capability_review`); research fit uses approved ones only, outbound drafts only approved non-sensitive `communicable` text. Why: no unapproved commercial data presented as public.
- Web research runs in `src/lib/research.functions.ts` (Firecrawl direct API + AI gateway); findings without a verbatim quote in the fetched source are stored as `insufficient`; CRM changes go through `brain_proposals` on a `source_documents` row of kind `research`. Why: no LLM memory passed off as research.
- IVLP imports go through `apply_import_batch` (idempotent by file hash) and `revert_import_batch` (archives only untouched, unrelated batch records); meeting participants link to `meetings`, never to each other. Pure rules live in `src/lib/ivlp-import.ts`.
- The home is the Brain chat (`/chat`, threads private per user via `brain_threads.owner_user_id`). The chat agent writes to the CRM directly through server-validated tools in `src/lib/chat.functions.ts` (user RLS client); every write is logged in `brain_actions` and undone with `brain_undo_action` (archive or restore). Tool rules (numbers must appear in user text, duplicate check before create, no opportunities/stages/amounts) live in `src/lib/chat-agent.ts`. Why: conversational CRM with direct action but full traceability.
