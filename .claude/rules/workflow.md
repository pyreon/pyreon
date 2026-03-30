# Workflow Rules

## Mindset

- Senior framework engineer building the fastest signal-based UI framework
- Optimize for: correctness > performance > DX > AI-friendliness
- "Do it properly, not quickly" — no shortcuts, no hacks
- "Understand before changing" — read code, understand the problem, form a hypothesis, verify, then fix
- "Be honest about quality" — 6/10 truthful > 9/10 inflated
- "Find root causes" — don't patch symptoms
- "When uncertain, say so" — better to ask than to guess wrong
- "Alignment before implementation" — propose approach before coding complex changes
- "One effort at a time" — focused batched progress, not scattered changes

## API Design Philosophy

1. **Question the need** — Don't build what isn't needed
2. **Write usage example first** — Before implementation
3. **Study prior art** — React, Solid, Vue, Svelte patterns
4. **One concept per API** — Each function does exactly one thing
5. **Zero-config defaults, full-control escape hatches**
6. **Familiarity as a feature** — API should feel natural to anyone who knows the web platform
7. **Types flow end-to-end** — Inferred, not annotated

## Before Writing Code

- Read existing source files in the area you're changing
- Check CLAUDE.md for documented patterns and conventions
- Check if the pattern exists in another package (don't reinvent)
- For complex changes, outline approach and get alignment first

## Code Changes

- Keep changes minimal — one feature per PR, one concern per file
- Follow naming: `signal()`, `computed()`, `effect()` for reactivity; `onMount`, `onUnmount` for lifecycle; `createX` for factories; `useX` for context hooks
- Export types separately from runtime values
- New APIs need JSDoc with `@example` blocks
- No unused imports, no dead code, no `// TODO` comments
- Error messages prefixed with `[Pyreon]` and include actionable guidance
- `__DEV__` guard all warnings — tree-shaken in production

## Git Practices — MANDATORY

- **NEVER push directly to main** — always use feature branches + PRs
- **NEVER commit without running validation**
- Don't commit unless explicitly asked
- No force push, no amending published commits
- Descriptive commit messages focused on "why"
- Stage specific files, not `git add .`

## Validation Checklist — Before EVERY Push

1. `bun run lint` — zero errors
2. `bun run typecheck` — zero errors (MCP pre-existing TS2589 is known)
3. `bun run test` — all tests pass
4. If API surface changed: update CLAUDE.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference

## Before Considering Work Complete — MANDATORY

1. All validation steps pass (lint, typecheck, test)
2. Exports updated in `src/index.ts`
3. **Every package MUST have** `LICENSE` (MIT) and `README.md` — no exceptions
4. **All documentation surfaces updated** (every PR, not just API changes):
   - `CLAUDE.md` — project knowledge base
   - `docs/` — VitePress documentation website
   - Package `README.md` files
   - `llms.txt` / `llms-full.txt` — AI reference files
   - `packages/tools/mcp/src/api-reference.ts` — MCP tool reference
5. No breaking changes without discussion
6. Honest quality assessment

## Debugging

- Check dependency versions + module resolution FIRST
- Use `registerErrorHandler` to surface silent errors
- Don't assume — verify with tests
- If workaround needed, document WHY and create follow-up
- Never blame upstream without reproducing in isolation

## Continuous Learning — MANDATORY

Every PR must include updates to rules and docs alongside the code changes. Don't submit code-only PRs when something was learned — update the rules in the SAME PR:

- **New anti-pattern discovered?** Add it to `anti-patterns.md` in the same commit.
- **New development pattern established?** Add it to `workflow.md` or `code-style.md` in the same PR.
- **API surface changed?** Update `CLAUDE.md`, `docs/`, `README`, `llms.txt`, `llms-full.txt`, MCP `api-reference.ts` as part of the same PR.
- **TypeScript/Bun/Biome quirk found?** Document it in the relevant rules file immediately.
- **Workaround added?** Document WHY in a code comment AND add to anti-patterns in the same commit.
- **Bug root cause identified?** Save to memory for future debugging AND document in anti-patterns if it's a recurring risk.

The rules files are your institutional memory. Update them as you work, not as a separate follow-up. A PR that changes behavior without updating docs is incomplete.

Also save learnings to persistent memory after each PR:

- **Patterns that worked** → feedback memory (validated approaches)
- **Patterns that failed** → feedback memory (what to avoid and why)
- **New project knowledge** → project memory (architecture decisions, API changes)
- **Bug root causes** → feedback memory (e.g. "compiler \_bindText detaches this on property access")

## Context Management

- Use `/compact` at ~50% context for long sessions
- Start complex tasks in plan mode
- Break work into steps that complete within context window
- Use subagents for parallel independent research
