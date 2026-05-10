# Phase 4: Terraform Download — Research

**Researched:** 2026-05-10
**Domain:** FastAPI async endpoint + Terraform CLI subprocess + React state management + browser Blob download
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Approval UX — Two steps**
Approve and Download are two separate steps:
1. "Approve" button on each plan bubble → triggers full HCL generation, shows spinner in new status bubble
2. When generation completes → "Download .tf" button appears in the status bubble
Only one plan can be approved at a time. Approving a new plan replaces the previously approved one (visually re-locks old bubble, new bubble appears for new plan).

**D-02: Full .tf Generation — New LLM call**
On approval, make a new async LLM call prompting the model to produce a complete Terraform config from the already-generated plan (diagram, services, cost breakdown). This expands the short `iac_snippet` preview into a deployable full config.
- Use existing `OpenRouter` LLM from advisor (async, same pattern as `get_recommendation`)
- New prompt in `prompts.py`: `TERRAFORM_FULL_PROMPT` — instructs model to output complete HCL with all required blocks (provider, variables, resources, outputs)
- Strip code fences from response (reuse existing strip logic in `terraform.py` or inline)
- Do NOT use the existing `TerraformGenerator` class (it uses sync `.invoke()` and a different prompt)

**D-03: File Serving — In-memory cache + client-side Blob**
- Backend stores generated HCL in a module-level dict: `_terraform_cache: Dict[str, str]` keyed by `recommendation_id`
- New endpoint: `POST /api/v1/chat/{conversation_id}/approve` → body: `{recommendation_id}` → response: `{recommendation_id, hcl: str, valid: bool, validation_errors: list[str]}`
- Frontend receives HCL string in response, creates `Blob(['...hcl...'], {type: 'text/plain'})`, triggers browser download as `architecture-{recommendation_id[:8]}.tf`
- Cache survives container session (not restarts) — consistent with the Phase 3 conversation history pattern

**D-04: Terraform Validation — `terraform validate` subprocess**
- Install Terraform CLI in the backend Docker container (Dockerfile must include Terraform install step)
- After generating HCL: write to a temp file in `/tmp/{recommendation_id}.tf`, run `terraform init -backend=false` then `terraform validate -json`
- Parse JSON output for `valid` boolean and `diagnostics` array
- If invalid: return HTTP 200 with `valid: false` + `validation_errors` list — frontend shows warning toast but still offers download (user can fix manually)
- If subprocess fails (Terraform not installed in dev env): fall back gracefully with `valid: null` (unknown)

**D-05: Post-Approval Visual State — Badge + status bubble**
Two things happen simultaneously on clicking "Approve":
1. Approved badge added to the plan bubble: green `Tag` with "✓ Approved" label. The "Approve" button is replaced or hidden.
2. New status bubble appears below: "Generating Terraform config..." with a spinner
When generation completes:
- Spinner replaced with "Download .tf" button (`colorScheme="green"`)
- If validation failed: yellow warning below the button ("Config generated with warnings — review before deploying")
- Only one plan can be approved: any previously-approved plan bubble loses its badge (re-shows "Approve" button)

**D-06: Approval State Management (Frontend)**
- `approvedRecommendationId: string | null` state in `ChatBox`
- `approvedHcl: string | null` state — populated after generation completes
- `approvalStatus: 'idle' | 'pending' | 'done' | 'error'` state
- `handleApprove(recommendationId)` — sets pending, calls POST /approve, on success sets done + hcl

### the agent's Discretion

- **Filename format** for download: `architecture-{recommendationId.slice(0, 8)}.tf`
- **Terraform prompt location**: new `TERRAFORM_FULL_PROMPT` in `backend/src/core/prompts.py`
- **Terraform CLI install method** in Dockerfile: `apt-get` or HashiCorp apt repo — agent chooses
- **Status bubble appearance**: same `role: 'system'` or new `role: 'approval'` in ChatBox messages — agent decides

### Deferred Ideas (OUT OF SCOPE)

- Disk-persisted .tf files (in-memory cache chosen for simplicity)
- CloudFormation output (out of scope, code dormant)
- Streaming generation (like chat — possible future UX)
- Approval via typed "approve" message (button-only decided)
- Download history / re-download approved configs (would require persistence)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TERRAFORM-01 | User can approve a plan in the chat (via "Approve" button) | D-01/D-05/D-06: Button on plan bubble, two-step UX, ChatBox state management |
| TERRAFORM-02 | On approval, full Terraform HCL config is generated for the recommended architecture | D-02/D-03: New async LLM call with TERRAFORM_FULL_PROMPT, module-level cache |
| TERRAFORM-03 | Generated `.tf` file is downloadable from the chat UI | D-03/D-01: Blob URL download, "Download .tf" button in status bubble |
| TERRAFORM-04 | Terraform config is valid (passes `terraform validate` or equivalent structure check) | D-04: Terraform CLI in Dockerfile, subprocess validation, graceful fallback |
</phase_requirements>

---

## Summary

Phase 4 adds a Plan Approval → Terraform Download flow on top of the existing Phase 3 multi-turn chat. The backend work is a single new `POST /api/v1/chat/{conversation_id}/approve` endpoint that (a) calls the LLM for a full HCL config, (b) validates it with `terraform validate`, and (c) caches and returns it. The frontend work is approval state management in `ChatBox`, an Approve button on each plan bubble, and a status bubble that transitions to a Download button. The client triggers the download via a `Blob` URL — no server-side file serving is needed.

The implementation is additive: no existing endpoints, components, or data structures need to be broken. The new endpoint follows the exact same module-level patterns (singleton LLM, module-level dict) already used in `routes.py`. The frontend extends the `Message` interface with `recommendationId` and adds three state hooks to `ChatBox` as locked in D-06. 

The most operationally complex part is the Terraform CLI installation in the Docker image and the `terraform init` + `terraform validate` subprocess chain. Key insight: `terraform validate` cannot run without `terraform init` first (it needs provider schemas), and `init` downloads providers from the internet — this means the validation step takes 10–30 seconds and requires network access in the container. The plan must account for this latency and the graceful fallback path (`valid: null`) when Terraform is not installed (local dev).

**Primary recommendation:** Implement backend and frontend as two parallel work streams (backend endpoint + Dockerfile → frontend state + UI), with the validation subprocess as the most critical piece to get right.

---

## Standard Stack

### Core — No New Packages Required

| Component | What to Use | Source |
|-----------|-------------|--------|
| Async LLM call | `self.llm.ainvoke(messages)` — existing `ChatOpenAI` | `advisor.py` pattern |
| Subprocess | `asyncio.create_subprocess_exec` | Python stdlib |
| Temp dir for validate | `tempfile.mkdtemp()` + `pathlib.Path` | Python stdlib |
| Blob download | `URL.createObjectURL(new Blob([hcl], {type: 'text/plain'}))` | Browser API |
| Spinner | `<Spinner>` from `@chakra-ui/react` | Already imported in ChatBox.tsx |
| Tag (badge) | `<Tag>` from `@chakra-ui/react` | Already imported in ChatBox.tsx |

**No new npm or pip packages are needed for this phase.** All required libraries are already present in `requirements.txt` and `package.json`.

### Terraform CLI — Dockerfile Addition

Install Terraform CLI via direct binary download (simpler than HashiCorp apt repo for a slim Python container):

```dockerfile
ARG TERRAFORM_VERSION=1.9.5
RUN apt-get update && apt-get install -y \
    build-essential \
    unzip \
    curl \
    && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
       -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin/ \
    && rm /tmp/terraform.zip \
    && chmod +x /usr/local/bin/terraform \
    && rm -rf /var/lib/apt/lists/*
```

**Why direct binary over apt repo:** The HashiCorp apt repo requires `gnupg`, `apt-transport-https`, `ca-certificates`, and `lsb-release` — more layers and complexity. The direct zip download adds one step, no extra packages beyond `unzip` and `curl` (both small). Version pinning is explicit, which is better for reproducible builds.

**Version check:** Terraform 1.9.5 is the current stable release as of research date. Pin it in ARG for easy upgrades.

---

## Architecture Patterns

### Recommended File Changes

```
backend/
├── src/
│   ├── api/
│   │   └── routes.py           # ADD: _terraform_cache dict + POST /chat/{id}/approve
│   └── core/
│       └── prompts.py          # ADD: TERRAFORM_FULL_PROMPT string constant
├── Dockerfile                  # ADD: Terraform CLI install step
frontend/
└── src/
    └── components/
        └── Chat/
            └── ChatBox.tsx     # MODIFY: Message interface, state hooks, Approve button, status bubble, download handler
```

### Pattern 1: Backend — Module-level cache + new endpoint

Follows the exact same pattern as `_conversation_history` in `routes.py`:

```python
# At module level in routes.py (after existing _conversation_history dict)
_terraform_cache: Dict[str, str] = {}

class ApproveRequest(BaseModel):
    recommendation_id: str

class ApproveResponse(BaseModel):
    recommendation_id: str
    hcl: str
    valid: bool | None   # None = validation skipped (Terraform not installed)
    validation_errors: List[str]

@router.post("/chat/{conversation_id}/approve", response_model=ApproveResponse)
async def approve_plan(conversation_id: str, request: ApproveRequest):
    rec_id = request.recommendation_id

    # Check cache first (idempotent — re-approval returns same HCL)
    if rec_id in _terraform_cache:
        hcl = _terraform_cache[rec_id]
        valid, errors = await _validate_terraform(hcl, rec_id)
        return ApproveResponse(recommendation_id=rec_id, hcl=hcl, valid=valid, validation_errors=errors)

    # Generate full HCL via new LLM call
    history = _conversation_history.get(conversation_id, [])
    hcl = await _generate_full_terraform(history, rec_id)
    _terraform_cache[rec_id] = hcl

    # Validate
    valid, errors = await _validate_terraform(hcl, rec_id)
    return ApproveResponse(recommendation_id=rec_id, hcl=hcl, valid=valid, validation_errors=errors)
```

### Pattern 2: Async LLM call for full HCL

Follows `advisor.py`'s `compact_conversation` pattern (simpler than `get_recommendation` — no structured output needed, just raw text):

```python
async def _generate_full_terraform(history: List[BaseMessage], rec_id: str) -> str:
    """
    Generate full Terraform HCL from conversation context.
    Uses the same OpenRouter LLM as the advisor. No structured output — raw text.
    """
    llm = ChatOpenAI(
        model="openai/gpt-4o",
        openai_api_key=os.getenv("LLM_API_KEY"),
        openai_api_base="https://openrouter.ai/api/v1"
    )
    messages = [
        SystemMessage(content=TERRAFORM_FULL_PROMPT),
        *history[-10:],   # Last 10 turns for context
        HumanMessage(content="Generate the complete Terraform configuration now."),
    ]
    result = await llm.ainvoke(messages)
    raw = result.content or ""
    return _strip_code_fences(raw)

def _strip_code_fences(content: str) -> str:
    """Reuses the strip logic pattern from terraform.py."""
    if "```hcl" in content:
        content = content.split("```hcl")[1].split("```")[0]
    elif "```terraform" in content:
        content = content.split("```terraform")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    return content.strip()
```

**Key:** The LLM instance can be module-level (same as `advisor = ArchitectureAdvisor()` in routes.py) or created per-call. Creating per-call is safe (stateless HTTP client).

### Pattern 3: Terraform subprocess validation

```python
import asyncio
import tempfile
import json
import shutil
from pathlib import Path

async def _validate_terraform(hcl: str, rec_id: str) -> tuple[bool | None, list[str]]:
    """
    Validate HCL with `terraform init` + `terraform validate -json`.
    Returns (valid, errors). valid=None if Terraform CLI not installed.
    Graceful fallback — never raises.
    """
    if not shutil.which("terraform"):
        return None, []   # D-04: valid=null fallback for dev env

    tmpdir = tempfile.mkdtemp(prefix=f"tf_{rec_id[:8]}_")
    try:
        tf_file = Path(tmpdir) / "main.tf"
        tf_file.write_text(hcl)

        # Step 1: terraform init (downloads providers — needs network, takes 10-30s)
        init_proc = await asyncio.create_subprocess_exec(
            "terraform", "init", "-backend=false", "-input=false",
            cwd=tmpdir,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(init_proc.wait(), timeout=60.0)

        # Step 2: terraform validate -json
        val_proc = await asyncio.create_subprocess_exec(
            "terraform", "validate", "-json",
            cwd=tmpdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(val_proc.communicate(), timeout=30.0)
        result = json.loads(stdout.decode())
        valid = result.get("valid", False)
        errors = [
            d["summary"]
            for d in result.get("diagnostics", [])
            if d.get("severity") == "error"
        ]
        return valid, errors

    except Exception as e:
        print(f"[Approve] Terraform validation failed: {e}")
        return None, []
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
```

**Critical:** Use `tmpdir` (a directory), not a single `/tmp/{id}.tf` file. `terraform init` creates a `.terraform/` subdirectory and a lock file — they must live in the same directory as `main.tf`.

### Pattern 4: Frontend — Approval state and Blob download

Add to `ChatBox`:

```typescript
// Extend Message interface
interface Message {
  role: 'user' | 'assistant' | 'error' | 'approval'  // add 'approval'
  content: string
  diagram?: string
  iac?: IaC[]
  costs?: Costs
  services?: ServiceItem[]
  recommendationId?: string   // ADD: from chat response
}

// New state in ChatBox component
const [approvedRecommendationId, setApprovedRecommendationId] = useState<string | null>(null)
const [approvedHcl, setApprovedHcl] = useState<string | null>(null)
const [approvalStatus, setApprovalStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
const [validationWarning, setValidationWarning] = useState<boolean>(false)

// handleApprove
const handleApprove = async (recommendationId: string) => {
  setApprovedRecommendationId(recommendationId)
  setApprovalStatus('pending')
  setApprovedHcl(null)

  // Insert approval status bubble into messages
  setMessages(prev => [
    ...prev,
    { role: 'approval', content: 'Generating Terraform config…' }
  ])

  try {
    const res = await fetch(`/api/v1/chat/${conversationId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendation_id: recommendationId }),
    })
    const data = await res.json()
    setApprovedHcl(data.hcl)
    setApprovalStatus('done')
    setValidationWarning(data.valid === false)
  } catch {
    setApprovalStatus('error')
    toast({ title: 'Approval failed', status: 'error', duration: 4000, isClosable: true, position: 'bottom' })
  }
}

// handleDownload
const handleDownload = () => {
  if (!approvedHcl || !approvedRecommendationId) return
  const blob = new Blob([approvedHcl], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `architecture-${approvedRecommendationId.slice(0, 8)}.tf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

### Pattern 5: TERRAFORM_FULL_PROMPT

Add to `prompts.py` as a plain string (not PromptTemplate — no variables needed; context comes from message history):

```python
TERRAFORM_FULL_PROMPT = """You are a Terraform expert. Based on the AWS architecture conversation above, generate a COMPLETE, deployment-ready Terraform HCL configuration.

The configuration MUST include:
1. terraform block with required_providers (AWS provider, version ~> 5.0)
2. provider "aws" block with region variable
3. variable blocks for configurable values (region, environment, etc.)
4. All resource blocks for the recommended AWS services
5. output blocks exposing key resource ARNs and endpoints

Requirements:
- Use Terraform AWS provider version ~> 5.0
- Follow AWS tagging best practices (Name, Environment tags on all resources)
- Use least-privilege IAM policies
- Output ONLY valid HCL — no markdown, no explanations, no code fences
- The configuration must be syntactically valid and pass `terraform validate`"""
```

**Why plain string, not PromptTemplate:** PromptTemplate requires `.format()` before use as a `SystemMessage`. Since TERRAFORM_FULL_PROMPT has no template variables (context is in the message history), a plain string is correct and consistent with `COMPACT_PROMPT` in `prompts.py`.

### Pattern 6: Approval badge + status bubble rendering

The status bubble approach: **add `role: 'approval'` message to the `messages` array** (consistent with D-21: new bubble per action, stacks in thread). The approval bubble renders based on `approvalStatus` state.

```tsx
// In message renderer (inside the messages.map loop)
if (msg.role === 'approval') {
  return (
    <Flex key={i} gap={3} justify="flex-start">
      {/* Same bot avatar as assistant */}
      <Flex w={8} h={8} borderRadius="full" bg="aws.orange" align="center" justify="center" flexShrink={0} boxShadow="sm">
        <Icon as={MdBolt} color="aws.squid" boxSize={4} />
      </Flex>
      <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="2xl" borderTopLeftRadius="sm" px={4} py={3} boxShadow="sm">
        {approvalStatus === 'pending' && (
          <HStack>
            <Spinner size="xs" color="gray.400" />
            <Text fontSize="sm" color="gray.500">Generating Terraform config…</Text>
          </HStack>
        )}
        {approvalStatus === 'done' && (
          <VStack align="start" spacing={2}>
            <Button size="sm" colorScheme="green" onClick={handleDownload}>
              Download .tf
            </Button>
            {validationWarning && (
              <Text fontSize="xs" color="orange.500">
                Config generated with warnings — review before deploying
              </Text>
            )}
          </VStack>
        )}
        {approvalStatus === 'error' && (
          <Text fontSize="sm" color="red.500">Generation failed. Please try again.</Text>
        )}
      </Box>
    </Flex>
  )
}
```

For the Approve button on assistant bubbles (replaces existing `showDownloadToast` stub):

```tsx
{msg.role === 'assistant' && msg.recommendationId && (
  <HStack mt={2}>
    {approvedRecommendationId === msg.recommendationId ? (
      <Tag colorScheme="green" size="sm">✓ Approved</Tag>
    ) : (
      <Button
        size="xs"
        variant="outline"
        colorScheme="green"
        onClick={() => handleApprove(msg.recommendationId!)}
        isDisabled={approvalStatus === 'pending'}
      >
        Approve
      </Button>
    )}
  </HStack>
)}
```

### Anti-Patterns to Avoid

- **Using `TerraformGenerator.generate()`** (sync `.invoke()`) inside an async FastAPI handler — blocks the event loop. The CONTEXT explicitly forbids this (D-02).
- **Writing HCL to a single `/tmp/{id}.tf` file** without a directory — `terraform init` needs a directory to create `.terraform/` and `.terraform.lock.hcl`. Use `tempfile.mkdtemp()`.
- **Skipping `terraform init` before `terraform validate`** — validate requires provider schemas that init downloads. Without init, validate returns "Required plugins are not installed."
- **Using `valid: bool` (non-nullable) in the Pydantic response model** — when Terraform is not installed, we return `valid: None`. Use `Optional[bool]` / `bool | None`.
- **Placing the Approve button outside the message bubble** — it must be inside the per-message renderer so each bubble has its own Approve button, tied to that message's `recommendationId`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HCL code fence stripping | Custom regex | Pattern from `terraform.py` lines 20–27 | Already battle-tested in project, handles `hcl`, `terraform`, generic fences |
| File download | Server file endpoint | `URL.createObjectURL(Blob)` | No server-side file storage needed; browser API handles it cleanly |
| Async subprocess | `subprocess.run()` (blocking) | `asyncio.create_subprocess_exec` | Blocking subprocess in async handler stalls FastAPI event loop |
| Temp dir cleanup | Manual path management | `tempfile.mkdtemp()` + `shutil.rmtree()` in finally | Race conditions and leftover files otherwise |
| Terraform install | Building from source | Binary zip from releases.hashicorp.com | Authoritative, version-pinned, no compiler needed |

---

## Common Pitfalls

### Pitfall 1: `terraform validate` fails silently without `terraform init`
**What goes wrong:** `terraform validate -json` returns `{"valid": false, "diagnostics": [{"summary": "Required plugins are not installed..."}]}` — not a syntax error, but a missing init error masquerading as invalid HCL.
**Why it happens:** `validate` needs provider schema files that `init` downloads.
**How to avoid:** Always run `terraform init -backend=false -input=false` in the temp dir before `validate`. Check the init exit code; if non-zero, return `valid: None` rather than `valid: false`.
**Warning signs:** "Required plugins are not installed" in validation_errors when the HCL looks syntactically correct.

### Pitfall 2: `terraform init` downloads providers — slow + needs network
**What goes wrong:** The approve endpoint takes 15–45 seconds because `init` downloads the AWS provider (~60 MB). Users see a spinner for a long time.
**Why it happens:** `terraform init` pulls providers from registry.terraform.io on every call.
**How to avoid:** 
- The async subprocess pattern (`asyncio.create_subprocess_exec`) is non-blocking — FastAPI continues serving other requests while init runs.
- Set `timeout=60.0` on the `wait_for` to prevent hangs.
- The validation is informational (HTTP 200 regardless of result) — even if it times out, the HCL is still returned.

### Pitfall 3: LLM outputs code fences despite explicit instruction
**What goes wrong:** HCL has `terraform` or `hcl` code fences, causing syntax errors in `terraform validate`.
**Why it happens:** LLMs frequently add markdown code fences even when told not to.
**How to avoid:** Always run `_strip_code_fences()` before caching and before validation. TERRAFORM_FULL_PROMPT says "no code fences" but enforcement is in code.

### Pitfall 4: Frontend approval state lost on message re-render
**What goes wrong:** Clicking "Approve" triggers a re-render that resets the approval bubble to "idle" state.
**Why it happens:** If approval state is derived from messages array content rather than explicit `approvalStatus` state hook, re-renders clear it.
**How to avoid:** Keep `approvalStatus` as an explicit `useState` hook (D-06). The approval bubble renders based on that state, not on message content. Only one approval bubble exists at a time (matched by `role: 'approval'` in the messages array, showing current `approvalStatus`).

### Pitfall 5: `recommendationId` not stored on Message objects
**What goes wrong:** Approve button can't reference `recommendation_id` because it's not on the `Message` object — only in `data.recommendation_id` at response time.
**Why it happens:** The existing `Message` interface has no `recommendationId` field. The backend already returns `recommendation_id` in `ChatResponse`.
**How to avoid:** Add `recommendationId?: string` to the `Message` interface. Populate it when building `assistantMessage` in `handleSend`:
```typescript
const assistantMessage: Message = {
  role: 'assistant',
  content: data.text || '',
  recommendationId: data.recommendation_id,   // ADD THIS
  ...
}
```

### Pitfall 6: Multiple approval bubbles accumulate
**What goes wrong:** User clicks "Approve" on multiple plans — a new `role: 'approval'` message is added each time, resulting in multiple bubbles in the thread.
**Why it happens:** `handleApprove` appends to messages array each call without removing the previous approval bubble.
**How to avoid:** In `handleApprove`, filter out any existing `role: 'approval'` message before appending the new one:
```typescript
setMessages(prev => [
  ...prev.filter(m => m.role !== 'approval'),
  { role: 'approval', content: 'Generating Terraform config…' }
])
```

### Pitfall 7: Dockerfile apt-get layer order
**What goes wrong:** Adding Terraform install AFTER `COPY requirements.txt` + `pip install` invalidates the pip cache layer on every Terraform version change.
**Why it happens:** Docker layer caching — any change to a layer invalidates all subsequent layers.
**How to avoid:** Install system deps (including Terraform) in the first `RUN apt-get` block, before `COPY requirements.txt`. This is also correct because `build-essential` is already there.

---

## Code Examples

### Full backend endpoint (routes.py additions)

```python
# At module level — after _conversation_history
import shutil
import tempfile
from pathlib import Path
_terraform_cache: Dict[str, str] = {}

def _strip_code_fences(content: str) -> str:
    if "```hcl" in content:
        content = content.split("```hcl")[1].split("```")[0]
    elif "```terraform" in content:
        content = content.split("```terraform")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    return content.strip()

async def _generate_full_terraform(history: List[BaseMessage]) -> str:
    from src.core.prompts import TERRAFORM_FULL_PROMPT
    llm = ChatOpenAI(
        model="openai/gpt-4o",
        openai_api_key=os.getenv("LLM_API_KEY"),
        openai_api_base="https://openrouter.ai/api/v1"
    )
    messages: List[BaseMessage] = [SystemMessage(content=TERRAFORM_FULL_PROMPT)]
    messages.extend(history[-10:])
    messages.append(HumanMessage(content="Generate the complete Terraform configuration now."))
    result = await llm.ainvoke(messages)
    return _strip_code_fences(result.content or "")

async def _validate_terraform(hcl: str, rec_id: str) -> tuple[bool | None, list[str]]:
    if not shutil.which("terraform"):
        return None, []
    tmpdir = tempfile.mkdtemp(prefix=f"tf_{rec_id[:8]}_")
    try:
        (Path(tmpdir) / "main.tf").write_text(hcl)
        init = await asyncio.create_subprocess_exec(
            "terraform", "init", "-backend=false", "-input=false",
            cwd=tmpdir,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(init.wait(), timeout=60.0)
        val = await asyncio.create_subprocess_exec(
            "terraform", "validate", "-json",
            cwd=tmpdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(val.communicate(), timeout=30.0)
        data = json.loads(stdout.decode())
        return data.get("valid", False), [
            d["summary"] for d in data.get("diagnostics", []) if d.get("severity") == "error"
        ]
    except Exception as e:
        print(f"[Approve] Validation error: {e}")
        return None, []
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


class ApproveRequest(BaseModel):
    recommendation_id: str

class ApproveResponse(BaseModel):
    recommendation_id: str
    hcl: str
    valid: Optional[bool] = None
    validation_errors: List[str] = []

@router.post("/chat/{conversation_id}/approve", response_model=ApproveResponse)
async def approve_plan(conversation_id: str, request: ApproveRequest):
    rec_id = request.recommendation_id
    if rec_id in _terraform_cache:
        hcl = _terraform_cache[rec_id]
    else:
        history = _conversation_history.get(conversation_id, [])
        hcl = await _generate_full_terraform(history)
        _terraform_cache[rec_id] = hcl
    valid, errors = await _validate_terraform(hcl, rec_id)
    return ApproveResponse(recommendation_id=rec_id, hcl=hcl, valid=valid, validation_errors=errors)
```

### TERRAFORM_FULL_PROMPT (prompts.py addition)

```python
TERRAFORM_FULL_PROMPT = """You are a Terraform expert. Based on the AWS architecture conversation above, generate a COMPLETE, deployment-ready Terraform HCL configuration.

The configuration MUST include:
1. terraform block with required_providers (hashicorp/aws, version constraint ~> 5.0)
2. provider "aws" block with region variable
3. variable blocks for all configurable values (region, environment, project_name)
4. All resource blocks for the recommended AWS services with proper dependencies
5. output blocks exposing key resource ARNs and endpoints

Rules:
- Use AWS provider version ~> 5.0
- Apply tags: Name, Environment, ManagedBy = "terraform" on all resources
- Use least-privilege IAM inline policies
- Output ONLY valid HCL — no markdown, no explanations, no code fences
- The configuration must be syntactically valid and pass terraform validate"""
```

### Dockerfile changes

```dockerfile
FROM python:3.13-slim

WORKDIR /app

ARG TERRAFORM_VERSION=1.9.5

RUN apt-get update && apt-get install -y \
    build-essential \
    unzip \
    curl \
    && curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" \
       -o /tmp/terraform.zip \
    && unzip /tmp/terraform.zip -d /usr/local/bin/ \
    && rm /tmp/terraform.zip \
    && chmod +x /usr/local/bin/terraform \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Sync `subprocess.run()` in async handler | `asyncio.create_subprocess_exec` | Non-blocking — FastAPI event loop not stalled during terraform init/validate |
| Manual temp file `/tmp/{id}.tf` | `tempfile.mkdtemp()` directory | Required by terraform init; directory cleaned up safely in finally block |
| Server-side file serving (GET /download/{id}) | Client-side Blob URL | No storage needed; download happens in browser from response data |

---

## Open Questions

1. **Terraform `init` provider caching**
   - What we know: `init` downloads the AWS provider (~60 MB) to `.terraform/` in the temp dir, then we delete the temp dir
   - What's unclear: In a high-concurrency demo, many parallel `approve` calls would each download the provider independently
   - Recommendation: For a demo/coursework project, this is acceptable. If needed, set `TF_PLUGIN_CACHE_DIR=/tmp/tf-plugin-cache` env var in the container and create the dir — Terraform will reuse cached providers across runs. Low priority.

2. **LLM sometimes returns incomplete HCL**
   - What we know: GPT-4o can generate valid HCL, but context window constraints may truncate large configs
   - What's unclear: Whether the `iac_snippet` from the chat response should be passed explicitly in the TERRAFORM_FULL_PROMPT user message
   - Recommendation: Pass the last AI message from history (which contains `plan.model_dump_json()` including `iac_snippet`) — it's already in `history[-1]` as an AIMessage. No special handling needed beyond including history.

3. **`recommendation_id` stored on Message vs. looked up from response**
   - What we know: The chat response includes `recommendation_id` as a UUID; the frontend already receives it
   - What's unclear: Whether the `Message` interface should store it (requires interface change) or if it should be tracked separately
   - Recommendation: Store on `Message` (as `recommendationId?: string`) — simplest approach, each plan bubble knows its own ID without additional lookup.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|---------|
| Docker | Build backend image with Terraform | ✓ | 29.4.2 | — |
| Terraform CLI (local) | Local `terraform validate` (dev) | ✗ | — | `valid: null` graceful fallback (D-04) |
| `asyncio` (Python stdlib) | Async subprocess | ✓ | Python 3.13 stdlib | — |
| `tempfile` (Python stdlib) | Temp dir for validation | ✓ | Python 3.13 stdlib | — |
| `shutil` (Python stdlib) | Cleanup + `which()` check | ✓ | Python 3.13 stdlib | — |
| `URL.createObjectURL` | Browser Blob download | ✓ | All modern browsers | — |

**Missing dependencies with no fallback:**
- None — Terraform is only needed inside the Docker container (install via Dockerfile). Local dev gracefully falls back to `valid: null`.

**Missing dependencies with fallback:**
- Terraform CLI (local dev): Not installed. `shutil.which("terraform")` returns `None` → function returns `(None, [])` → frontend receives `valid: null` — no download blocked.

---

## Sources

### Primary (HIGH confidence)
- `backend/src/core/advisor.py` — Async LLM pattern, module-level singletons, `ainvoke` usage verified directly
- `backend/src/api/routes.py` — Module-level dict pattern, endpoint structure, Pydantic models verified directly
- `backend/src/core/iac/terraform.py` — Code fence stripping pattern verified directly
- `frontend/src/components/Chat/ChatBox.tsx` — Message interface, state hooks, existing stub locations verified directly
- `frontend/src/theme.ts` — Color tokens verified directly
- `.planning/phases/04-terraform-download/04-CONTEXT.md` — All locked decisions verified directly
- Python `asyncio` docs — `create_subprocess_exec`, `wait_for` patterns (stdlib, HIGH confidence)

### Secondary (MEDIUM confidence)
- Terraform CLI releases page (releases.hashicorp.com) — 1.9.5 is current stable; `terraform validate -json` output schema is documented
- `tempfile.mkdtemp()` + `shutil.rmtree()` pattern — standard Python practice for subprocess temp dirs

### Tertiary (LOW confidence — needs validation)
- `TF_PLUGIN_CACHE_DIR` for provider caching — documented in Terraform docs but not tested in this environment

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all patterns verified directly in codebase
- Architecture: HIGH — endpoint follows existing routes.py patterns exactly; frontend follows ChatBox.tsx patterns exactly
- Pitfalls: HIGH — subprocess + temp dir pitfalls are well-known; code fence pitfall verified from existing terraform.py

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (stable stack; Terraform 1.9.x stable for months)
