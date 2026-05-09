# Phase 3: Multi-Turn Chat — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 03-multi-turn-chat
**Areas discussed:** History window, Refinement UX, Structured output fallback, History injection strategy

---

## History Window

| Option | Description | Selected |
|--------|-------------|----------|
| Last 10 turns | STATE.md recommendation; manageable token budget | |
| Last 5 turns | Smaller window, cheaper per request | |
| Unlimited | Keep every turn; simpler code | |
| Unlimited + user controls | Warn about context bloat; user can compact or clear | ✓ |

**User's choice:** Unlimited history, but show context fill stats in the UI and provide Compact + Clear controls. Warning threshold is model-aware (% of context window used, not a fixed turn count).

**Notes:** User wants live pre-send estimate AND actual usage from API response. Both shown as a progress bar.

---

## Compaction & Clear

| Option | Description | Selected |
|--------|-------------|----------|
| UI controls only | Persistent buttons, no auto-warning | |
| Token threshold warning | Warning banner at turn threshold | |
| Both | Persistent controls + warning banner at model-aware threshold | ✓ |

**Compact behavior:** LLM summarizes conversation into shorter system-message block, replaces raw history.
**Clear behavior:** Wipes history entirely, starts fresh.

---

## Refinement UX

| Option | Description | Selected |
|--------|-------------|----------|
| Stack responses | New plan appears as new bubble below previous | ✓ |
| Replace in-place | Previous plan bubble updated with animation | |
| Side-by-side diff | New plan shown next to old one | |

**User's choice:** Stack responses (consistent with Phase 02.1 mock UX).

### Diff badge

| Option | Description | Selected |
|--------|-------------|----------|
| Diff badge | Each bubble shows "+ECS −EKS" tag comparing to previous | ✓ |
| No diff | Responses stand alone; context fill stats show depth | |

**User's choice:** Diff badge on each response bubble.

---

## Structured Output Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Degraded response | Return raw text in text field, empty defaults for rest | |
| Retry once | Re-call LLM with corrective prompt; error if retry fails | ✓ |
| Hard fail | HTTP 500 immediately | |

**User's choice:** Retry once with corrective prompt.

### Error display (on retry failure)

| Option | Description | Selected |
|--------|-------------|----------|
| Toast only | Dismissible notification | |
| Error bubble only | Stays in conversation history | |
| Both | Toast for immediate attention + error bubble in history | ✓ |

**User's choice:** Both.

---

## History Injection Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| LangChain message list | [SystemMessage, HumanMessage, AIMessage, ...] via ainvoke() | ✓ |
| Text summary in system prompt | "Conversation so far:" text block | |
| LCEL with MessagesPlaceholder | Declarative chain, more composable | |

**User's choice:** Option A — LangChain message list (least refactoring, idiomatic).

### History Storage

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory dict (backend only) | keyed by conversation_id | |
| Browser localStorage (client only) | Sent with each request | |
| Both — backend source of truth + localStorage cache | Survives page refresh | ✓ |

**User's choice:** Backend in-memory dict is source of truth; client caches in localStorage to survive page refreshes.

---

## the Agent's Discretion

- Diff badge visual design (color, placement)
- Compaction prompt wording
- tiktoken vs character approximation for pre-send estimate

## Deferred Ideas

None.
