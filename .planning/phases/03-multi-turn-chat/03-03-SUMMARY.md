---
phase: 03-multi-turn-chat
plan: "03"
subsystem: frontend
tags: [chatbox, conversation, localstorage, context-fill, diff-badges, error-bubble, forwardRef]
dependency_graph:
  requires:
    - 03-01  # async advisor with structured output
    - 03-02  # conversation history, compact/clear endpoints
  provides:
    - ChatBoxHandle (compact, clear, hasMessages) for App.tsx Plan 04
    - Full Phase 3 ChatBox with all 6 visual components
  affects:
    - frontend/src/App.tsx (Plan 04 will wire ChatBoxHandle ref)
tech_stack:
  added: []
  patterns:
    - forwardRef + useImperativeHandle for ref exposure
    - localStorage serialization/restore of StoredMessage[]
    - Character-based context fill estimation (chars/4 ≈ tokens)
    - Diff computation via Set difference on service name arrays
key_files:
  created: []
  modified:
    - frontend/src/components/Chat/ChatBox.tsx
decisions:
  - "Message role extended to 'user' | 'assistant' | 'error' for D-20 error bubble"
  - "computeDiff uses Set difference on ServiceItem.name arrays per D-22"
  - "localStorage keys: aws_advisor_conv_id (global) + aws_advisor_history_{convId} (per-conversation)"
  - "fillPercent resets to 0 after clear; warningDismissed resets when fill < WARN_THRESHOLD"
metrics:
  duration: ~15 minutes
  completed: 2026-05-09
  tasks_completed: 2
  files_modified: 1
---

# Phase 03 Plan 03: ChatBox Phase 3 UI Overhaul Summary

**One-liner:** Full Phase 3 ChatBox with conversation_id wiring, localStorage persistence, character-based context fill bar (green/orange/red), warning banner with Compact/Clear CTAs, per-turn service diff badges, error bubble for structured output failures, and forwardRef handle exposing compact/clear/hasMessages.

## What Was Built

Rewrote `ChatBox.tsx` from a stateless single-turn component (~310 lines) into a complete Phase 3 multi-turn conversation component (~620 lines) implementing all 6 UI specification components:

### Task 1 — State, Types, API Wiring, localStorage

- **forwardRef pattern**: Component changed from `React.FC` to `forwardRef<ChatBoxHandle, ChatBoxProps>` with `displayName`
- **Exported interfaces**: `ChatBoxHandle` (compact, clear, hasMessages), `ChatBoxProps` (conversationId, onSessionUpdate)
- **Extended types**: `Message` gains `role: 'error'` and `services?: ServiceItem[]`; `StoredMessage`, `ServiceItem` added
- **Helper functions**: `estimateFillPercent`, `computeDiff`, `serializeHistory`, `getRelativeTime`
- **Constants**: `MODEL_MAX_TOKENS = 128_000`, `WARN_THRESHOLD = 75`
- **State**: `conversationId`, `fillPercent`, `warningDismissed`, `isCompacting`, `clearConfirming`
- **localStorage restore**: `useEffect` on mount reads `aws_advisor_history_{convId}`, restores Message[] display
- **Live fill updates**: `useEffect` watching `[input, messages]`, resets dismissed at `< WARN_THRESHOLD`
- **handleSend**: Sends `{ message, conversation_id, history: serializedHistory }` — handles `data.error` (error bubble + toast), updates fill from `usage.prompt_tokens`, persists to localStorage, calls `onSessionUpdate`
- **handleCompact**: POST `/compact`, resets fill, clears localStorage, success/error toast
- **handleClear**: POST `/clear`, resets all state + localStorage, calls `onSessionUpdate`
- **useImperativeHandle**: Exposes `compact`, `clear`, `hasMessages` to parent ref

### Task 2 — Visual Components

- **Context Fill Bar** (UI-SPEC §1): `HStack` with `Box` track + fill bar (`green.400`/`aws.orange`/`red.500` by threshold), `{N}%` label, `"Context"` separator — shown only when `messages.length > 0`, positioned between textarea row and hint text
- **Warning Banner** (UI-SPEC §2): Chakra `Alert` with `bg="orange.50"`, `borderColor="orange.300"`, `AlertIcon`, heading `"Context window is {N}% full"`, body copy, Compact + Clear history CTAs, CloseButton with `aria-label="Dismiss context warning"`
- **Inline clear confirmation**: Replaces Clear history button when `clearConfirming === true` — shows "Clear all messages?" text + "Yes, clear" / "Cancel" buttons
- **Diff Badge Row** (UI-SPEC §5): Per assistant bubble (not first), `HStack` of `Tag` elements — added: `green.100`/`green.700` with `+ServiceName`, removed: `red.100`/`red.700` with `−ServiceName` (U+2212); `py={0}` per spec; `aria-label` with change summary
- **Error Bubble** (UI-SPEC §6): Rendered for `msg.role === 'error'` — left-aligned with bolt avatar, `red.50` bg, `red.200` border, `MdWarning` icon, heading `"Failed to generate plan"`, body copy per Copywriting contract

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `1e4c032` | feat(03-03): update ChatBox state, types, API wiring, and localStorage |
| Task 2 | `cdc72ce` | feat(03-03): add Phase 3 visual components to ChatBox |

## Deviations from Plan

None — plan executed exactly as written. All interfaces, copy, colors, and prop values match UI-SPEC and CONTEXT.md decisions.

## Known Stubs

None — all Phase 3 ChatBox features are fully wired. The `getRelativeTime` helper is defined but not yet called from the ChatBox render (it will be used by App.tsx Plan 04 conversation session list). This is intentional — Plan 04 consumes it.

## Self-Check

- [x] `frontend/src/components/Chat/ChatBox.tsx` modified and committed
- [x] `export interface ChatBoxHandle` — line 61
- [x] `export const ChatBox = forwardRef<ChatBoxHandle, ChatBoxProps>` — line 125
- [x] `useImperativeHandle` — line 315
- [x] `conversation_id` in fetch body — line 204
- [x] `localStorage.setItem/getItem` — lines 138, 153, 213, 253-255
- [x] `py={0}` on diff badge Tags — lines 474, 489
- [x] Unicode minus `\u2212` — line 491
- [x] Context fill bar `fillPercent >= 90 ? 'red.500' : fillPercent >= 75 ? 'aws.orange' : 'green.400'` — line 684
- [x] Warning banner `bg="orange.50"` + `borderColor="orange.300"` — lines 568, 571
- [x] Error bubble `bg="red.50"` + `borderColor="red.200"` — lines 400-401
- [x] TypeScript: `npx tsc --noEmit` → 0 errors ✅

## Self-Check: PASSED
