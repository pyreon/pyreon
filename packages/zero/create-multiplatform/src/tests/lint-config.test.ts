import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { allRules, groupOf, lint } from '@pyreon/lint'
import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

/**
 * The lint config a scaffolded multiplatform app gets.
 *
 * A multiplatform app's shared source has to survive three targets, and the
 * `portable` rule group is the only thing that says so before a build does.
 * That group is `optIn` — correctly, since it is pure noise in a web-only
 * project — so `preset: 'recommended'` alone leaves both of its rules OFF, and
 * this scaffolder shipped no lint config at all. Rules written for
 * multiplatform, a multiplatform scaffolder, and they never met: the same
 * never-wired shape as a lifecycle container whose `start()` nobody calls.
 *
 * The config is taken from `buildScaffold` and run through the REAL `lint()`,
 * rather than re-typed here as a literal. Two halves have to be right and they
 * enable different rules — the `groups` key turns on the platform-branch rule,
 * while the construct rule additionally needs `portablePaths`, without which
 * it fires on nothing and the config only LOOKS like it enabled something.
 * Asserting a copy of the JSON would prove neither.
 */

const OPTS = { name: 'demo-app' }

function findConfig(): string {
  const files = buildScaffold(OPTS)
  const spec = files.find((f) => f.path === '.pyreonlintrc.json')
  expect(spec, 'the scaffolder emits a .pyreonlintrc.json').toBeDefined()
  return spec?.content ?? ''
}

/** Write a project whose lint config is the SCAFFOLDER'S, verbatim. */
function project(config: string, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-mp-lint-'))
  writeFileSync(join(dir, '.pyreonlintrc.json'), config)
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return dir
}

const run = (dir: string) =>
  lint({ paths: [dir], config: join(dir, '.pyreonlintrc.json') }).files.flatMap(
    (f) => f.diagnostics,
  )

/** An out-of-subset construct — PMTC warns by name on `enum`. */
const OUT_OF_SUBSET = `export enum Mode {\n  On,\n  Off,\n}\n`
/** A platform branch with no native arm — the sibling portable rule. */
const PLATFORM_BRANCH = `export const A = () => <Web><div /></Web>\n`
/**
 * One shape per remaining portable rule: a web-only import, CSS-in-JS, a bare
 * DOM tag OUTSIDE a `<Web>` branch, and a setup call with no `nativeCompat`.
 *
 * The fixture has to cover the whole group because the assertion below is
 * totality over the registry — a new portable rule fails here until it is
 * given a shape, rather than being quietly absent from the scaffolded config.
 */
const REST = [
  `import { styled } from '@pyreon/styler'`,
  `import { renderChart } from '@pyreon/charts'`,
  `import { onMount } from '@pyreon/core'`,
  `export const Card = styled('div')\`color:red\``,
  `export function Panel() {`,
  `  onMount(() => {})`,
  `  return <div>{renderChart}</div>`,
  `}`,
  ``,
].join('\n')

const SOURCES = {
  'src/app.ts': OUT_OF_SUBSET,
  'src/view.tsx': PLATFORM_BRANCH,
  'src/panel.tsx': REST,
}

const portableIds = new Set(
  allRules.filter((r) => groupOf(r.meta) === 'portable').map((r) => r.meta.id),
)

describe('the scaffolded lint config', () => {
  it('is emitted at the project root and parses', () => {
    expect(() => JSON.parse(findConfig())).not.toThrow()
    const parsed = JSON.parse(findConfig()) as Record<string, unknown>
    expect(parsed.preset).toBe('recommended')
  })

  it('pairs the config with a runnable `lint` script', () => {
    // A config nobody can invoke is documentation, not a gate.
    const pkg = buildScaffold(OPTS).find((f) => f.path === 'package.json')
    const parsed = JSON.parse(pkg?.content ?? '{}') as {
      scripts?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(parsed.scripts?.lint).toContain('pyreon-lint')
    expect(parsed.devDependencies?.['@pyreon/lint']).toBeDefined()
  })

  it('names a group that exists — a typo protects nothing, silently', () => {
    // The scaffolder writes this key by hand, so it can drift from the group
    // registry with nothing failing: an unknown group key is ignored, which
    // is indistinguishable from a group that found nothing.
    expect(portableIds.size).toBeGreaterThan(0)
    const parsed = JSON.parse(findConfig()) as { groups?: Record<string, string> }
    for (const g of Object.keys(parsed.groups ?? {})) {
      expect(new Set(allRules.map((r) => groupOf(r.meta)))).toContain(g)
    }
  })

  it('turns EVERY portable rule on, where `recommended` alone leaves them off', () => {
    const scaffolded = project(findConfig(), SOURCES)
    const bare = project(JSON.stringify({ preset: 'recommended' }), SOURCES)
    try {
      const on = run(scaffolded).filter((d) => portableIds.has(d.ruleId))
      const off = run(bare).filter((d) => portableIds.has(d.ruleId))

      // The whole point: identical source, one config apart.
      expect(off).toHaveLength(0)
      // The WHOLE group, not a sample. The config's two halves enable
      // different rules — `groups` moves the tier, `settings.portablePaths`
      // is what five of the six need before they fire on anything — so
      // covering one rule would let the other half be dropped silently.
      expect(new Set(on.map((d) => d.ruleId))).toEqual(portableIds)
      expect(on.every((d) => d.severity === 'warn')).toBe(true)
    } finally {
      rmSync(scaffolded, { recursive: true, force: true })
      rmSync(bare, { recursive: true, force: true })
    }
  })

  it('changes NOTHING outside the portable tier', () => {
    // A group key that quietly widened the set would make every scaffolded
    // native app disagree with every other Pyreon project about severity.
    const scaffolded = project(findConfig(), SOURCES)
    const bare = project(JSON.stringify({ preset: 'recommended' }), SOURCES)
    try {
      const key = (d: { ruleId: string; message: string }) => `${d.ruleId}:${d.message}`
      const a = run(scaffolded).filter((d) => !portableIds.has(d.ruleId)).map(key).sort()
      const b = run(bare).filter((d) => !portableIds.has(d.ruleId)).map(key).sort()
      expect(a).toEqual(b)
    } finally {
      rmSync(scaffolded, { recursive: true, force: true })
      rmSync(bare, { recursive: true, force: true })
    }
  })
})
