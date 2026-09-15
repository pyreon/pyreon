/**
 * Which validate-fast gates a GitHub workflow enforces on its own — shared by
 * `validate-fast --ci-complement` (which RUNS the rest) and
 * `check-gates-wired` (which asserts the complement step is itself wired).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The distinctive token a workflow would carry to invoke a gate: the script
 * path for `bun scripts/x.ts` / `bun docs/scripts/x.ts` / `bun packages/…`,
 * the bare command for `bun run x` — everything after the runner word.
 */
export function gateNeedle(cmd: string): string {
  return cmd
    .replace(/^bun run /, '')
    .replace(/^bun /, '')
    .trim()
}

/** Strip `#` comments from workflow YAML (a commented-out invocation is not wiring). */
export function stripYamlComments(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/(^|\s)#.*$/, ''))
    .join('\n')
}

/** Every workflow's text, comments stripped. */
export function workflowTexts(workflowDir: string): string[] {
  if (!existsSync(workflowDir)) return []
  return readdirSync(workflowDir)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => stripYamlComments(readFileSync(join(workflowDir, f), 'utf8')))
}

/**
 * Every root `package.json` script alias whose command carries a needle, so
 * a workflow's `bun run check-distribution` counts as running
 * `scripts/check-distribution.ts`. Returns needle → alias names.
 */
export function scriptAliases(rootPackageJsonPath: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (!existsSync(rootPackageJsonPath)) return out
  const scripts =
    (JSON.parse(readFileSync(rootPackageJsonPath, 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {}
  for (const [alias, cmd] of Object.entries(scripts)) {
    const needle = gateNeedle(cmd)
    out.set(needle, [...(out.get(needle) ?? []), alias])
  }
  return out
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `needle` as a whole COMMAND token: bounded by line start/end, whitespace, `&&`, `;` or `|`. */
function commandMatcher(needle: string): RegExp {
  return new RegExp(`(?:^|\\s|&&|;|\\|)${escapeRe(needle)}(?=\\s|$|&&|;|\\|)`, 'm')
}

/**
 * Does any workflow `run:` block invoke this gate — by its needle, or by a
 * root script alias whose command IS the needle? Both tests are whole-command
 * matches over RUN BLOCKS only: a bare substring test over the whole file read
 * `bun run lint:pyreon` (a different gate), a step NAME, a job id and
 * `bunx oxlint --version` all as running `lint`, so a gate whose needle is a
 * prefix of a sibling's fell out of the complement and was enforced by nobody
 * — the exact hole the complement exists to close.
 */
export function gateIsWiredInWorkflows(
  cmd: string,
  texts: readonly string[],
  aliases: Map<string, string[]>,
): boolean {
  const needle = gateNeedle(cmd)
  const direct = commandMatcher(needle)
  const runBlocks = texts.map(runBlockText)
  if (runBlocks.some((t) => direct.test(t))) return true
  const wrapping = aliases.get(needle) ?? []
  return wrapping.some((alias) => {
    const viaAlias = commandMatcher(`run ${alias}`)
    return runBlocks.some((t) => viaAlias.test(t))
  })
}

/**
 * Only the text of `run:` values (scalar or block) — what actually executes.
 * Indentation-driven, like `check-cache-key-sync`'s step reader.
 */
export function runBlockText(workflowText: string): string {
  const lines = workflowText.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i]!)
    if (!m) continue
    const rest = m[2]!.trim()
    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-' || rest === '') {
      const indent = m[1]!.length
      for (let k = i + 1; k < lines.length; k++) {
        const l = lines[k]!
        const ind = l.length - l.trimStart().length
        if (l.trim() !== '' && ind <= indent) break
        out.push(l.trim())
      }
    } else out.push(rest)
  }
  return out.join('\n')
}

/**
 * Gates no workflow file invokes outside comments, directly OR through a root
 * `package.json` alias — the set `validate-fast --ci-complement` runs.
 */
export function ciComplementGates<T extends { cmd: string }>(
  gates: readonly T[],
  workflowDir: string,
  rootPackageJsonPath: string = join(workflowDir, '..', '..', 'package.json'),
): T[] {
  const texts = workflowTexts(workflowDir)
  const aliases = scriptAliases(rootPackageJsonPath)
  return gates.filter((g) => !gateIsWiredInWorkflows(g.cmd, texts, aliases))
}

/** The invocation the Fast Gates job must carry for the complement to be enforced. */
export const CI_COMPLEMENT_INVOCATION = 'scripts/validate-fast.ts --ci-complement'

/** True when some workflow runs the complement step (outside comments). */
export function ciComplementIsWired(workflowDir: string): boolean {
  return workflowTexts(workflowDir).some((t) => t.includes(CI_COMPLEMENT_INVOCATION))
}
