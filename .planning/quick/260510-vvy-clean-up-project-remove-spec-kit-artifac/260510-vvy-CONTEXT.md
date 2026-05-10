# Quick Task 260510-vvy: Clean up project — remove spec-kit and unused scaffolding - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Task Boundary

Remove spec-kit artifacts and all unused AI-tool scaffolding left by the previous developer. The project now uses GitHub Copilot + GSD. Keep only what's needed for Copilot/GSD and Claude Code.

</domain>

<decisions>
## Implementation Decisions

### AI tool config files to keep
- `.github/` — keep (Copilot + GSD)
- `.planning/` — keep (GSD)
- `.claude/` — keep (user uses Claude Code)
- `CLAUDE.md` — keep (Claude Code instructions)
- `.mcp.json` — keep (MCP server config, used with Claude Code)

### AI tool config files to REMOVE
- `.gemini/` directory
- `.kiro/` directory
- `.qoder/` directory
- `.agents/` directory (not GSD agents — leftover scaffolding)
- `.opencode.json`
- `AGENTS.md` (generic multi-agent file, not GSD)
- `GEMINI.md`
- `QODER.md`
- `.cursorrules`
- `.windsurfrules`

### spec-kit artifacts to REMOVE
- `specs/` directory (entire tree — spec.md, plan.md, tasks.md, etc.)
- `.specify/` directory (spec-kit memory + templates)

### Junk root-level files to REMOVE
- `B` (empty file)
- `Y` (empty file)
- `B in extracted…` (garbled filename, empty file)
- `Y    extracted…` (garbled filename, empty file)

### Agent's Discretion
- If any file inside removed dirs contains content that looks project-specific and non-redundant with .planning/, flag it before deleting (don't silently lose unique data).

</decisions>

<specifics>
## Specific Ideas

- The `.agents/` directory should be checked — it may be GSD agent definitions. Remove only if it's not GSD-related.
- Junk files at root have spaces/special chars in names — use `git rm` with quoting.

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.
</canonical_refs>
