import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lint } from '../lint'
import { allRules } from '../rules/index'
import { groupOf } from '../rules/groups'
import { diagnoseUnknownConfigKeys } from '../utils/unknown-config'

/**
 * `settings` — options shared by every rule that DECLARES them.
 *
 * Some options are a property of the project, not of one rule. `portablePaths`
 * says which directories must lower to SwiftUI and Compose, and FIVE rules
 * need that same answer. Before this, a config had to repeat the key per rule,
 * which made it a hand-maintained subset of the registry: the multiplatform
 * scaffolder listed exactly one, so the other four portable rules were
 * silently inert in every scaffolded app — the repo's most-repeated bug class,
 * arriving through the config this time.
 *
 * Driven through the REAL `lint()` against files on disk. Asserting that the
 * runner merged an object would prove the merge, not that a rule then fired.
 */

const SETTINGS_KEY = 'portablePaths'

function project(config: unknown, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-settings-'))
  writeFileSync(join(dir, '.pyreonlintrc.json'), JSON.stringify(config))
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return dir
}

const run = (dir: string) =>
  lint({ paths: [dir], config: join(dir, '.pyreonlintrc.json') })

/** One source that trips FIVE different portable rules at once. */
const SOURCES = {
  'src/app.tsx':
    "import { styled } from '@pyreon/styler'\n" +
    "import { renderChart } from '@pyreon/charts'\n" +
    "import { onMount } from '@pyreon/core'\n" +
    'export enum Mode {\n  On,\n  Off,\n}\n' +
    "export const Card = styled('div')`color:red`\n" +
    'export function Panel() {\n  onMount(() => {})\n  return <div>{renderChart}</div>\n}\n',
}

const portableIds = new Set(
  allRules.filter((r) => groupOf(r.meta) === 'portable').map((r) => r.meta.id),
)

/** Every portable rule that asks for `portablePaths` in its own schema. */
const wantsPortablePaths = allRules
  .filter((r) => groupOf(r.meta) === 'portable')
  .filter((r) => r.meta.schema !== undefined && SETTINGS_KEY in r.meta.schema)
  .map((r) => r.meta.id)

describe('shared `settings`', () => {
  it('is the key more than one portable rule needs — otherwise this is pointless', () => {
    // The whole mechanism exists because the answer is shared. If it ever
    // stops being shared, delete it rather than maintaining it.
    expect(wantsPortablePaths.length).toBeGreaterThan(1)
  })

  it('seeds the option into EVERY rule that declares it, from one line', () => {
    const dir = project(
      { preset: 'recommended', groups: { portable: 'warn' }, settings: { portablePaths: ['src/'] } },
      SOURCES,
    )
    try {
      const fired = new Set(
        run(dir).files.flatMap((f) => f.diagnostics).map((d) => d.ruleId),
      )
      for (const id of wantsPortablePaths) expect(fired, id).toContain(id)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('without it, the SAME source and the SAME group key fire nothing', () => {
    // The control: this is what a scaffolded multiplatform app used to get for
    // four of its five portable rules. `groups` alone looks like it enabled
    // something.
    const dir = project({ preset: 'recommended', groups: { portable: 'warn' } }, SOURCES)
    try {
      const fired = run(dir)
        .files.flatMap((f) => f.diagnostics)
        .filter((d) => wantsPortablePaths.includes(d.ruleId))
      expect(fired).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("a rule's OWN options still win over the shared value", () => {
    // Narrowing one rule must stay possible, or the shared key is a ceiling.
    const dir = project(
      {
        preset: 'recommended',
        groups: { portable: 'warn' },
        settings: { portablePaths: ['src/'] },
        rules: { 'pyreon/no-out-of-subset-construct': ['warn', { portablePaths: ['nowhere/'] }] },
      },
      SOURCES,
    )
    try {
      const fired = new Set(
        run(dir).files.flatMap((f) => f.diagnostics).map((d) => d.ruleId),
      )
      expect(fired).not.toContain('pyreon/no-out-of-subset-construct')
      // ...and its siblings are unaffected by that narrowing.
      expect(fired).toContain('pyreon/no-css-in-js-in-portable')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never reaches a rule that does not declare the key', () => {
    // A shared key sprayed onto every rule would be reported as an unknown
    // option by the ones that never asked, turning this into noise.
    const dir = project(
      { preset: 'recommended', settings: { portablePaths: ['src/'] } },
      { 'src/a.ts': 'export const x = 1\n' },
    )
    try {
      expect(run(dir).configDiagnostics ?? []).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports a settings key no rule declares — a typo is otherwise silent', () => {
    const keys = [...new Set(allRules.flatMap((r) => Object.keys(r.meta.schema ?? {})))]
    const [d] = diagnoseUnknownConfigKeys(
      { settings: { portablePath: ['src/'] } },
      allRules.map((r) => r.meta.id),
      keys,
    )
    expect(d?.severity).toBe('error')
    expect(d?.message).toContain('portablePaths')
  })

  it('is silent on a settings key that a rule does declare', () => {
    const keys = [...new Set(allRules.flatMap((r) => Object.keys(r.meta.schema ?? {})))]
    expect(
      diagnoseUnknownConfigKeys(
        { settings: { portablePaths: ['src/'] } },
        allRules.map((r) => r.meta.id),
        keys,
      ),
    ).toEqual([])
  })

  it('every portable rule is either path-scoped or deliberately unscoped', () => {
    // Totality over the group, so a NEW portable rule has to state which it
    // is instead of inheriting whichever the author happened to copy.
    const unscoped = [...portableIds].filter((id) => !wantsPortablePaths.includes(id))
    expect(unscoped).toEqual(['pyreon/no-platform-branch-without-fallback'])
  })
})
