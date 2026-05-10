---
phase: quick-260510-vvy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .agents/
  - .gemini/
  - .kiro/
  - .qoder/
  - .specify/
  - AGENTS.md
  - GEMINI.md
  - QODER.md
  - .cursorrules
  - .windsurfrules
  - .opencode.json
  - B
  - "Y"
autonomous: true
requirements: [CLEANUP-01]

must_haves:
  truths:
    - "No spec-kit directories exist at repo root (.agents/, .specify/)"
    - "No unused AI-tool configs exist (.gemini/, .kiro/, .qoder/, .opencode.json, AGENTS.md, GEMINI.md, QODER.md, .cursorrules, .windsurfrules)"
    - "No junk files (B, Y, and their garbled-filename variants) exist at repo root"
    - "All retained files (.github/, .planning/, .claude/, CLAUDE.md, .mcp.json, backend/, frontend/, etc.) are untouched"
  artifacts:
    - path: ".github/"
      provides: "Copilot + GSD config — MUST remain"
    - path: ".planning/"
      provides: "GSD planning state — MUST remain"
    - path: "CLAUDE.md"
      provides: "Claude Code instructions — MUST remain"
  key_links:
    - from: "git log --oneline -1"
      to: "cleanup commit"
      via: "git rm + git commit"
      pattern: "chore.*cleanup"
---

<objective>
Remove all spec-kit artifacts, unused AI-tool scaffolding, and junk files left by the previous developer. The project now runs on GitHub Copilot + GSD + Claude Code only.

Purpose: Clean repo root of noise — every file left should have a clear owner and purpose.
Output: Deleted tracked files staged + committed; untracked junk files removed from disk.
</objective>

<execution_context>
@~/.copilot/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260510-vvy-clean-up-project-remove-spec-kit-artifac/260510-vvy-CONTEXT.md

<!-- Investigation findings (do not re-investigate):
  - specs/ does NOT exist on disk — skip it
  - GEMINI.md and QODER.md are byte-for-byte identical to CLAUDE.md — safe to delete
  - .agents/ contains ONLY spec-kit skill definitions (speckit-analyze, speckit-clarify, etc.) — no project-specific content
  - Junk files B and Y have NEWLINES in their actual filenames (confirmed via git status output)
  - All other targets (.gemini/, .kiro/, .qoder/, .specify/, .cursorrules, .windsurfrules, .opencode.json, AGENTS.md, GEMINI.md, QODER.md) are git-tracked
  - .agents/ is git-tracked
  - Junk files (B, Y, and garbled variants) are UNTRACKED — use rm/find, NOT git rm
-->
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove git-tracked spec-kit and AI-tool artifacts</name>
  <files>
    .agents/, .gemini/, .kiro/, .qoder/, .specify/,
    AGENTS.md, GEMINI.md, QODER.md,
    .cursorrules, .windsurfrules, .opencode.json
  </files>
  <action>
Run the following commands in order from the repo root:

```bash
# Remove spec-kit directories
git rm -r .agents/
git rm -r .specify/

# Remove unused AI-tool config directories
git rm -r .gemini/
git rm -r .kiro/
git rm -r .qoder/

# Remove unused AI-tool root files
git rm AGENTS.md GEMINI.md QODER.md .cursorrules .windsurfrules .opencode.json
```

Do NOT remove: `.github/`, `.planning/`, `.claude/`, `CLAUDE.md`, `.mcp.json`

Note: `specs/` does not exist on disk — skip it.
Note: GEMINI.md and QODER.md are duplicates of CLAUDE.md (confirmed identical) — safe to delete.
  </action>
  <verify>
    <automated>git --no-pager diff --cached --name-only | sort</automated>
  </verify>
  <done>
All 11 targets appear in git's staged deletions. None of .github/, .planning/, CLAUDE.md, .mcp.json appear in the staged list.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove untracked junk files and commit everything</name>
  <files>B, Y (and garbled-name variants)</files>
  <action>
The junk files have newlines embedded in their filenames. Use `find` to match and delete them safely:

```bash
# Remove junk files — B, Y, and their garbled-filename variants (filenames contain newlines)
find . -maxdepth 1 -name 'B' -delete
find . -maxdepth 1 -name 'Y' -delete
find . -maxdepth 1 -name 'B in*' -delete
find . -maxdepth 1 -name 'Y*extracted*' -delete
```

Verify nothing unexpected was deleted:

```bash
git --no-pager status --short
```

Then commit all staged deletions:

```bash
git commit -m "chore: remove spec-kit artifacts and unused AI-tool scaffolding

Removed:
- .agents/ (spec-kit skill definitions)
- .specify/ (spec-kit memory and templates)
- .gemini/, .kiro/, .qoder/ (unused AI tool configs)
- AGENTS.md, GEMINI.md, QODER.md (unused AI tool instruction files)
- .cursorrules, .windsurfrules, .opencode.json (unused editor/tool configs)
- Junk files: B, Y and garbled-name variants

Kept: .github/, .planning/, .claude/, CLAUDE.md, .mcp.json"
```
  </action>
  <verify>
    <automated>ls B Y .agents .gemini .kiro .qoder .specify AGENTS.md GEMINI.md QODER.md .cursorrules .windsurfrules .opencode.json 2>&1 | grep -c "No such file" | xargs echo "Missing (should be 13):"</automated>
  </verify>
  <done>
All 13 items are confirmed absent. git log shows the cleanup commit. .github/, .planning/, .claude/, CLAUDE.md, .mcp.json, backend/, frontend/, docker-compose.yml all still present.
  </done>
</task>

</tasks>

<verification>
After both tasks:

```bash
# Confirm deleted items are gone
ls -d .agents .gemini .kiro .qoder .specify 2>&1
ls AGENTS.md GEMINI.md QODER.md .cursorrules .windsurfrules .opencode.json 2>&1

# Confirm keepers are intact
ls -d .github .planning .claude && ls CLAUDE.md .mcp.json

# Confirm source code intact
ls backend/ frontend/ docker-compose.yml

# Confirm commit landed
git --no-pager log --oneline -3
```
</verification>

<success_criteria>
- All spec-kit and unused AI-tool files/dirs are gone from the repo
- Junk files (B, Y, garbled variants) are gone from disk
- .github/, .planning/, .claude/, CLAUDE.md, .mcp.json are untouched
- All project source (backend/, frontend/, docker-compose.yml, data/, logs/) is untouched
- One clean git commit recorded with descriptive message
</success_criteria>

<output>
No SUMMARY.md needed for quick tasks. Task is complete when success criteria above are met.
</output>
