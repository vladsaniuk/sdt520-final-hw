# Phase 4: Terraform Download — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Source:** discuss-phase interactive session

<domain>
## Phase Boundary

Users approve a plan in the chat UI and download a full, valid Terraform HCL configuration — the core deliverable of the project.

**In scope:**
- "Approve" button on each plan bubble → locks that plan, triggers async full .tf generation
- Full HCL generation via a new LLM call (expand iac_snippet to complete Terraform config)
- Backend in-memory cache of generated HCL keyed by `recommendation_id`
- Terraform validation via `terraform validate` subprocess (Terraform CLI installed in backend container)
- Download .tf via client-side Blob URL (frontend fetches HCL from backend response/cache, creates blob)
- Visual: approved badge on plan bubble + new status bubble with spinner → Download .tf button
- Only one plan approved at a time per conversation (approving a new one replaces the previous)

**Out of scope (deferred):**
- Disk-persisted .tf files (in-memory cache sufficient for demo; Phase 5 Docker Polish can revisit)
- CloudFormation output (dormant, untouched)
- Approval via typed message (button-only per ROADMAP)

</domain>

<decisions>
## Implementation Decisions

### D-01: Approval UX — Two steps
Approve and Download are **two separate steps**:
1. "Approve" button on each plan bubble → triggers full HCL generation, shows spinner in new status bubble
2. When generation completes → "Download .tf" button appears in the status bubble
Only one plan can be approved at a time. Approving a new plan replaces the previously approved one (visually re-locks old bubble, new bubble appears for new plan).

### D-02: Full .tf Generation — New LLM call
On approval, make a **new async LLM call** prompting the model to produce a **complete** Terraform config from the already-generated plan (diagram, services, cost breakdown). This expands the short `iac_snippet` preview into a deployable full config.
- Use existing `OpenRouter` LLM from advisor (async, same pattern as `get_recommendation`)
- New prompt in `prompts.py`: `TERRAFORM_FULL_PROMPT` — instructs model to output complete HCL with all required blocks (provider, variables, resources, outputs)
- Strip code fences from response (reuse existing strip logic in `terraform.py` or inline)
- Do NOT use the existing `TerraformGenerator` class (it uses sync `.invoke()` and a different prompt)

### D-03: File Serving — In-memory cache + client-side Blob
- Backend stores generated HCL in a module-level dict: `_terraform_cache: Dict[str, str]` keyed by `recommendation_id`
- New endpoint: `POST /api/v1/chat/{conversation_id}/approve` → body: `{recommendation_id}` → response: `{recommendation_id, hcl: str, valid: bool, validation_errors: list[str]}`
- Frontend receives HCL string in response, creates `Blob(['...hcl...'], {type: 'text/plain'})`, triggers browser download as `architecture-{recommendation_id[:8]}.tf`
- Cache survives container session (not restarts) — consistent with the Phase 3 conversation history pattern

### D-04: Terraform Validation — `terraform validate` subprocess
- Install Terraform CLI in the backend Docker container (`Dockerfile` must include Terraform install step)
- After generating HCL: write to a temp file in `/tmp/{recommendation_id}.tf`, run `terraform init -backend=false` then `terraform validate -json`
- Parse JSON output for `valid` boolean and `diagnostics` array
- If invalid: return HTTP 200 with `valid: false` + `validation_errors` list — frontend shows warning toast but still offers download (user can fix manually)
- If subprocess fails (Terraform not installed in dev env): fall back gracefully with `valid: null` (unknown)

### D-05: Post-Approval Visual State — Badge + status bubble
Two things happen simultaneously on clicking "Approve":
1. **Approved badge** added to the plan bubble: green `Tag` with "✓ Approved" label. The "Approve" button is replaced or hidden.
2. **New status bubble** appears below: "Generating Terraform config..." with a spinner
When generation completes:
- Spinner replaced with "Download .tf" button (`colorScheme="green"`)
- If validation failed: yellow warning below the button ("Config generated with warnings — review before deploying")
- If only one plan can be approved: any previously-approved plan bubble loses its badge (re-shows "Approve" button)

### D-06: Approval State Management (Frontend)
- `approvedRecommendationId: string | null` state in `ChatBox`
- `approvedHcl: string | null` state — populated after generation completes
- `approvalStatus: 'idle' | 'pending' | 'done' | 'error'` state
- `handleApprove(recommendationId)` — sets pending, calls POST /approve, on success sets done + hcl

### D-07: the agent's Discretion
- Filename format for download: `architecture-{recommendationId.slice(0, 8)}.tf`
- Terraform prompt location: new `TERRAFORM_FULL_PROMPT` in `backend/src/core/prompts.py`
- Terraform CLI install method in Dockerfile: `apt-get` or HashiCorp apt repo — agent chooses
- Status bubble appearance: same `role: 'system'` or new `role: 'approval'` in ChatBox messages — agent decides

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project
- `CLAUDE.md` — Critical rules: async only, imports at top, no new packages without approval
- `.planning/REQUIREMENTS.md` — TERRAFORM-01 through TERRAFORM-04 acceptance criteria
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, depends on Phase 3

### Backend (existing code to extend)
- `backend/src/core/iac/terraform.py` — Existing TerraformGenerator (sync — do NOT use directly; adapt prompt pattern)
- `backend/src/core/prompts.py` — Add TERRAFORM_FULL_PROMPT here
- `backend/src/core/advisor.py` — Async LLM pattern to follow for approval endpoint
- `backend/src/api/routes.py` — Add POST /chat/{id}/approve endpoint following existing patterns
- `backend/Dockerfile` — Must add Terraform CLI installation

### Frontend (existing code to extend)
- `frontend/src/components/Chat/ChatBox.tsx` — ChatBoxHandle, message types, existing Download .tf stub (line 321, 517)
- `frontend/src/theme.ts` — Color tokens: `aws.orange`, `aws.squid`, `aws.squidLight`

### Phase 3 context (locked decisions that apply)
- `.planning/phases/03-multi-turn-chat/03-CONTEXT.md` — D-19/D-20: error handling patterns; D-21: new bubble per action
- `.planning/phases/03-multi-turn-chat/03-UI-SPEC.md` — UI component patterns (Tag, size constraints, icon sources)

</canonical_refs>

<specifics>
## Specific References

- The `iac_snippet` field from Phase 3 responses contains a short HCL preview — the full generation must be a **separate** LLM call on approval, not just serving this field
- `terraform validate -json` outputs: `{"valid": bool, "diagnostics": [{"severity": "error"|"warning", "summary": str}]}`
- Blob download pattern: `URL.createObjectURL(new Blob([hcl], {type: 'text/plain'}))` + `<a>` click trick
- `recommendation_id` comes from `ChatResponse.recommendation_id` (UUID4, already in Phase 3 response)
- Existing `Download .tf` button stub is in ChatBox at lines 517-519 — this becomes the real handler
</specifics>

<deferred>
## Deferred Ideas

- Disk-persisted .tf files (in-memory cache chosen for simplicity)
- CloudFormation output (out of scope, code dormant)
- Streaming generation (like chat — possible future UX)
- Approval via typed "approve" message (button-only decided)
- Download history / re-download approved configs (would require persistence)
</deferred>

---

*Phase: 04-terraform-download*
*Context gathered: 2026-05-10 via discuss-phase interactive session*
