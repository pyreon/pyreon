/**
 * The pieces of the `pyreon-lint` CLI that tests reach directly: the `--list`
 * and `--init` renderers and the `--preset` / `--rule-options` value parsers.
 * They live here, off the `./cli` entry, and the tests import them through
 * `@pyreon/lint/internal`; `./cli` itself exports only `runCli`.
 */
import { createTerm, finding, header, plural, verdict, wrap } from '@pyreon/ansi'
import { isPresetName } from './config/presets'
import { listRules } from './lint'
import type { TermChoice } from './reporter'
import { groupOf } from './rules/groups'
import { termFor } from './term-for'
import type { PresetName, RuleGroup } from './types'

const GROUP_BLURB: Record<RuleGroup, string> = {
  pyreon: 'framework semantics — nothing outside Pyreon can know these',
  security: 'exploitable shapes — script URLs, referrer leakage',
  a11y: 'accessibility — standard markup plus Pyreon\u2019s own surfaces',
  pkg: 'per-library — each self-activates on a declared dependency',
  internal: 'encodes the Pyreon repo itself — never on in a shipped preset',
  js: 'language-level shapes oxlint cannot express on its own',
  backend: 'server-role files — handlers, loaders, adapters',
  style: 'how code reads — blank lines, sections, JSX depth (the `readable` presets)',
  isomorphic: 'runs on BOTH sides — the hydration contract',
  'web-perf': 'client-role files — main thread, teardown, network',
  portable: 'must survive iOS + Android through PMTC',
}

const GROUP_ORDER: RuleGroup[] = [
  'pyreon',
  'isomorphic',
  'backend',
  'web-perf',
  'portable',
  'security',
  'a11y',
  'pkg',
  'js',
  'style',
  'internal',
]

const SEVERITY_ROLE = { error: 'err', warn: 'warn', info: 'info', off: 'dim' } as const

/**
 * `--list`: one section per group (bold name, count, dim blurb), one row per
 * rule (id, category, default severity as a word in its colour, the
 * description wrapped under its own column, `fixable` when it is), then
 * the totals.
 *
 * @internal
 */
export function formatRuleList(opts: TermChoice = {}): string {
  const t = termFor(opts)
  const rules = listRules()
  const maxId = Math.max(...rules.map((r) => r.id.length))
  const maxCat = Math.max(...rules.map((r) => r.category.length))
  const lines = [header(t, 'pyreon-lint --list', `${plural(rules.length, 'rule')} in ${plural(GROUP_ORDER.length, 'group')}`)]
  // 4 indent, id, 2, category, 2, severity (5), 2: the description column.
  const descCol = 4 + maxId + 2 + maxCat + 2 + 5 + 2
  const descWidth = t.width - descCol
  // A window too narrow for a readable description column puts the
  // description on its own line under the id.
  const stacked = descWidth < 30

  for (const group of GROUP_ORDER) {
    const inGroup = rules.filter((r) => groupOf(r) === group)
    if (inGroup.length === 0) continue
    const title = `${t.bold(group.toUpperCase())} ${t.dim(`(${inGroup.length}) ${t.sym('dash')} ${GROUP_BLURB[group]}`)}`
    lines.push('', ...wrap(title, t.width, t.width - 2, '    ').map((l, i) => (i === 0 ? `  ${l}` : l)))
    for (const rule of inGroup) {
      const desc = `${rule.description}${rule.fixable ? ` ${t.ok('fixable')}` : ''}`
      const role = SEVERITY_ROLE[rule.severity as keyof typeof SEVERITY_ROLE] ?? 'dim'
      if (stacked) {
        lines.push(`    ${rule.id}  ${t.dim(rule.category)}  ${t.paint(role, rule.severity)}`)
        lines.push(...wrap(desc, t.width, t.width - 6, '      ').map((l, i) => (i === 0 ? `      ${l}` : l)))
        continue
      }
      const sev = t.paint(role, rule.severity.padEnd(5))
      const prefix = `    ${rule.id.padEnd(maxId)}  ${t.dim(rule.category.padEnd(maxCat))}  ${sev}  `
      const body = wrap(desc, t.width, descWidth, ' '.repeat(descCol))
      lines.push(`${prefix}${body[0] ?? ''}`, ...body.slice(1))
    }
  }

  const fixable = rules.filter((r) => r.fixable).length
  lines.push('', verdict(t, null, `${rules.length} rules total`, [`${fixable} fixable`]))

  return lines.join('\n')
}

/** A usage problem on stderr in the shared theme: `✗ pyreon-lint · problem`, then `fix:`. */
function usageProblem(message: string, fix: string): void {
  const t = createTerm({ isTTY: Boolean(process.stderr.isTTY) })
  // oxlint-disable-next-line no-console
  console.error(finding(t, { severity: 'error', source: 'pyreon-lint', message, fix }, { indent: 0, width: t.width }).join('\n'))
}

const INIT_STATUS = { written: 'ok', exists: 'warn', 'no-package-json': 'err' } as const

/**
 * `--init`: the outcome as the verdict (last line), any guidance above it.
 *
 * @internal
 */
export function formatInitResult(
  r: { status: 'written' | 'exists' | 'no-package-json'; message: string },
  opts: TermChoice = {},
): string {
  const t = termFor(opts)
  const [first = '', ...rest] = r.message.split('\n')
  const status = INIT_STATUS[r.status]
  const body = rest.filter((l, i) => !(i === 0 && l === ''))

  return [header(t, 'pyreon-lint --init'), ...(body.length > 0 ? ['', ...body] : []), '', verdict(t, status, first)].join('\n')
}

/**
 * `--preset recommended,readable` → `['recommended', 'readable']`. An unknown
 * name is reported and dropped rather than crashing the run.
 *
 * @internal
 */
export function parsePresetList(val: string | undefined): PresetName[] | undefined {
  if (!val) return undefined
  const names: PresetName[] = []
  for (const raw of val.split(',')) {
    const name = raw.trim()
    if (!name) continue
    if (isPresetName(name)) names.push(name)
    // oxlint-disable-next-line no-console
    else console.error(`[pyreon-lint] --preset: unknown preset "${name}" ignored`)
  }

  return names.length > 0 ? names : undefined
}

/**
 * `--rule-options id='{json}'` → `overrides[id] = {…}`; bad JSON or a
 * non-object is reported as a usage problem and skipped.
 *
 * @internal
 */
export function parseRuleOptionsOverride(
  val: string | undefined,
  overrides: Record<string, Record<string, unknown>>,
): void {
  if (!val) return
  const eqIdx = val.indexOf('=')
  if (eqIdx === -1) return
  const ruleId = val.slice(0, eqIdx)
  const json = val.slice(eqIdx + 1)
  try {
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      overrides[ruleId] = parsed as Record<string, unknown>
    } else {
      usageProblem(
        `--rule-options ${ruleId}: expected JSON object, got ${typeof parsed}`,
        `pass an object: --rule-options ${ruleId}='{"key":"value"}'`,
      )
    }
  } catch (err) {
    usageProblem(
      `--rule-options ${ruleId}: invalid JSON — ${(err as Error).message}`,
      `quote the JSON for your shell: --rule-options ${ruleId}='{"key":"value"}'`,
    )
  }
}
