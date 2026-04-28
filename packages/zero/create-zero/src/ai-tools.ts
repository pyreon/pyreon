import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AiToolId, ProjectConfig } from './templates'

/**
 * Pyreon-specific guidance shared across every AI-tool rule file. Each tool
 * wraps this in its own preamble (frontmatter, header, etc.) so the styling
 * matches the tool's conventions, but the substance is identical: this is
 * Pyreon, not React; here is how reactivity, JSX, and routing actually work.
 *
 * `doctorLine` is appended to the Commands section when the consumer is the
 * primary "knows about doctor" file (CLAUDE.md). Other tools omit it.
 */
function pyreonPrinciples(opts: { doctorLine: boolean }): string {
  return `## Reactivity (Pyreon, not React)

- \`signal()\` not \`useState\`; \`computed()\` not \`useMemo\`; \`effect()\` not \`useEffect\`.
- Write signals via \`signal.set(value)\` or \`signal.update(fn)\`. Calling \`signal(value)\` does NOT write — it reads.
- Components run **once** at mount. Reactivity comes from signals reading themselves at use sites; the framework subscribes the surrounding DOM node, not the whole component.
- In JSX, signals auto-call: \`{count}\` (compiler inserts \`()\`). Outside JSX, call explicitly: \`count()\`.
- Don't destructure props (\`const { x } = props\` captures getters once and loses reactivity). Read \`props.x\` directly, or use \`splitProps(props, ['x'])\`.

## JSX

- \`class=\` not \`className\`; \`for=\` not \`htmlFor\`; camelCase events (\`onClick\`, \`onMouseEnter\`).
- Lists: \`<For each={items} by={r => r.id}>{r => <li>...</li>}</For>\`. The prop is \`by\` (not \`key\`) — JSX extracts \`key\` for VNode reconciliation.
- Conditionals: \`<Show when={cond}>...</Show>\` or accessor form \`{() => cond() ? <A /> : null}\`.
- \`onChange\` → \`onInput\` for keypress-by-keypress text updates.

## File-Based Routing

- \`src/routes/index.tsx\` → \`/\`
- \`src/routes/about.tsx\` → \`/about\`
- \`src/routes/[id].tsx\` → \`/:id\`
- \`src/routes/_layout.tsx\` → layout wrapper
- \`(group)/\` → route group (no URL segment)

Per-route exports: \`default\` (component), \`loader\` (server data), \`guard\` (nav guard), \`middleware\`, \`meta\`, \`renderMode\`.

## Don't reach for raw DOM APIs

- Use \`useEventListener\` / \`useClickOutside\` / \`useScrollLock\` from \`@pyreon/hooks\` instead of \`addEventListener\` / \`removeEventListener\`. The hook handles cleanup on unmount.
- For controlled state in primitives, use \`useControllableState({ value, defaultValue, onChange })\`.

## Don't paste React patterns

- No \`useState\` / \`useEffect\` / \`useMemo\` / \`useCallback\` / \`useRef\`. None of those exist.
- No \`React.Fragment\` — just \`<></>\`.
- No "children as function" trick — Pyreon supports JSX children directly.

## Commands

- \`bun run dev\` — dev server with HMR (signals preserve across reload)
- \`bun run build\` — production build
- \`bun run preview\` — serve build${opts.doctorLine ? '\n- `bun run doctor` — checks for React patterns and other anti-patterns' : ''}
`
}

// ─── Generators ─────────────────────────────────────────────────────────────

interface AiToolGen {
  id: AiToolId
  /** Path relative to targetDir. */
  path: string
  /** Render the file body for the given config. */
  render(config: ProjectConfig): string
}

const claude: AiToolGen = {
  id: 'claude',
  path: 'CLAUDE.md',
  render: () => `# Project

This project uses Pyreon Zero, a signal-based full-stack meta-framework. Do NOT use React patterns.

${pyreonPrinciples({ doctorLine: true })}`,
}

const cursor: AiToolGen = {
  id: 'cursor',
  path: '.cursor/rules/pyreon.md',
  render: () => `---
description: Pyreon Zero project rules
globs:
  - "**/*.{ts,tsx}"
alwaysApply: true
---

# Pyreon Zero

This is a Pyreon Zero project — a signal-based full-stack meta-framework. **Do not use React patterns** (useState, useEffect, className, etc.).

${pyreonPrinciples({ doctorLine: false })}

## When in doubt

The MCP server at \`.mcp.json\` exposes a \`validate\` tool that statically catches React→Pyreon mistakes. Run it on suspicious snippets before committing.
`,
}

const copilot: AiToolGen = {
  id: 'copilot',
  path: '.github/copilot-instructions.md',
  render: () => `# Copilot Instructions

This repository uses **Pyreon Zero** — a signal-based meta-framework. Do not generate React code.

${pyreonPrinciples({ doctorLine: false })}

## Quick reference

| Need | Use |
|---|---|
| Reactive value | \`signal()\` |
| Derived value | \`computed()\` |
| Side effect | \`effect()\` or \`onMount(() => { … return cleanup })\` |
| Form state | \`useForm()\` from \`@pyreon/form\` |
| Server data | \`useQuery()\` from \`@pyreon/query\` |
| Global state | \`defineStore()\` from \`@pyreon/store\` |
`,
}

const agents: AiToolGen = {
  id: 'agents',
  path: 'AGENTS.md',
  render: () => `# AGENTS.md

A generic AI-agent instruction file picked up by Aider, Continue.dev, and various editor agents that read \`AGENTS.md\` at the project root.

This is a Pyreon Zero project. Do not use React patterns (no useState / useEffect / className).

${pyreonPrinciples({ doctorLine: false })}`,
}

// MCP isn't a markdown rule file — it's `.mcp.json`. The template ships one
// already; we just need to keep it (or remove it) based on user selection.
// Handled by the file-removal helper below, not via render().

const RULE_FILES: AiToolGen[] = [claude, cursor, copilot, agents]

// ─── Apply ──────────────────────────────────────────────────────────────────

export async function applyAiTools(config: ProjectConfig): Promise<void> {
  const selected = new Set<AiToolId>(config.aiTools)

  // Render every selected rule-file generator. CLAUDE.md is in the templates
  // already — if claude is selected we OVERWRITE it with the canonical body
  // so the principles list stays in sync across templates over time.
  for (const gen of RULE_FILES) {
    if (selected.has(gen.id)) {
      const target = join(config.targetDir, gen.path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, gen.render(config))
    }
  }

  // Remove files for unselected tools (each template ships claude+mcp by
  // default, so we have to unwind those if the user opted out).
  if (!selected.has('claude')) {
    await removeIfExists(join(config.targetDir, 'CLAUDE.md'))
  }
  if (!selected.has('mcp')) {
    await removeIfExists(join(config.targetDir, '.mcp.json'))
  }
}

async function removeIfExists(path: string): Promise<void> {
  if (!existsSync(path)) return
  await unlink(path)
}
