import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { LintConfig, PresetName, Severity } from '../types'

/**
 * Registry-level invariants over the whole rule set.
 *
 * These exist because `pyreon/no-large-for-without-by` shipped a
 * byte-identical implementation of `pyreon/no-missing-for-by` under a
 * second id in a different category at a different severity. A single
 * `<For>` without `by` therefore produced TWO diagnostics — same span,
 * same message — one `warn` and one `error`, contradicting each other.
 *
 * Deleting that one rule fixes the instance. These tests fix the CLASS:
 * a future duplicate cannot be added without failing here.
 */

/** Enable every rule at `error` so nothing is masked by preset severity. */
function allRulesConfig(): LintConfig {
  const rules: Record<string, Severity> = {}
  for (const rule of allRules) rules[rule.meta.id] = 'error'
  return { rules }
}

/**
 * Snippets chosen to trigger as many rules as possible at once. Each is a
 * plausible shape, not a synthetic grab-bag, so a duplicate pair that only
 * co-fires on realistic code is still caught.
 */
const CORPUS: Array<{ name: string; path: string; source: string }> = [
  {
    name: 'For without by',
    path: '/proj/src/List.tsx',
    source: `const App = () => <For each={items}>{(r) => <li />}</For>`,
  },
  {
    name: 'For with index as by',
    path: '/proj/src/Indexed.tsx',
    source: `const App = () => <For each={items} by={(_, i) => i}>{(r) => <li />}</For>`,
  },
  {
    name: 'react-flavoured attributes',
    path: '/proj/src/Attrs.tsx',
    source: `const App = () => <div className="x" htmlFor="y" tabIndex={3} autoFocus />`,
  },
  {
    name: 'browser globals at setup',
    path: '/proj/src/Ssr.tsx',
    source: `export function C() {\n  const w = window.innerWidth\n  const el = document.querySelector('#x')\n  return <div>{w}</div>\n}`,
  },
  {
    name: 'signal misuse',
    path: '/proj/src/Sig.tsx',
    source: `import { signal, effect } from '@pyreon/reactivity'\nconst c = signal(0)\nc(5)\neffect(() => { c.set(1) })`,
  },
  {
    name: 'destructured props',
    path: '/proj/src/Props.tsx',
    source: `export function C({ title }) {\n  return <span>{title}</span>\n}`,
  },
  {
    name: 'img without alt or dimensions',
    path: '/proj/src/Img.tsx',
    source: `const App = () => <img src="/a.png" />`,
  },
  {
    name: 'map in jsx',
    path: '/proj/src/Map.tsx',
    source: `const App = () => <ul>{items.map((i) => <li>{i}</li>)}</ul>`,
  },
]

describe('rule registry invariants', () => {
  it('every rule id is unique', () => {
    const seen = new Map<string, number>()
    for (const rule of allRules) {
      seen.set(rule.meta.id, (seen.get(rule.meta.id) ?? 0) + 1)
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
    expect(dupes, `rule ids registered more than once: ${dupes.join(', ')}`).toEqual([])
  })

  it('every rule object is registered exactly once', () => {
    // A rule listed twice in `allRules` would create two visitor callback
    // sets and report every finding twice under the same id.
    const seen = new Set<unknown>()
    const dupes: string[] = []
    for (const rule of allRules) {
      if (seen.has(rule)) dupes.push(rule.meta.id)
      seen.add(rule)
    }
    expect(dupes, `rule objects listed twice in allRules: ${dupes.join(', ')}`).toEqual([])
  })

  it('every rule id is strictly kebab-case — no exceptions', () => {
    // `no-querySelector-cast-in-test` used to carry camelCase inside a kebab
    // id. That is not a naming-convention preference, it is malformed, so it
    // was renamed rather than pinned. This assertion has no allowlist: a new
    // id that is not kebab-case fails outright.
    const bad = allRules
      .map((r) => r.meta.id)
      .filter((id) => !/^pyreon\/[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
    expect(bad, `malformed rule ids: ${bad.join(', ')}`).toEqual([])
  })

  it('ids that match an established ESLint rule name keep that name', () => {
    // `@pyreon/lint` is meant to be reachable for someone porting an ESLint
    // config, so where a rule covers the same defect as a well-known ESLint /
    // jsx-a11y rule it uses that rule's id verbatim. This is deliberately at
    // odds with a blanket `no-*` / `prefer-*` / `require-*` convention: name
    // compatibility beats internal tidiness, because it is what makes a
    // config port over unchanged.
    const ecosystemNames = ['pyreon/anchor-is-valid', 'pyreon/no-autofocus']
    for (const id of ecosystemNames) {
      expect(
        allRules.some((r) => r.meta.id === id),
        `${id} matches an upstream ESLint rule name and must not be renamed`,
      ).toBe(true)
    }
  })

  it('no two rules report the same message at the same span', () => {
    const config = allRulesConfig()
    const collisions: string[] = []

    for (const { name, path, source } of CORPUS) {
      const result = lintFile(path, source, allRules, config)
      const byKey = new Map<string, Set<string>>()
      for (const d of result.diagnostics) {
        const key = `${d.span.start}:${d.span.end}:${d.message}`
        const ids = byKey.get(key) ?? new Set<string>()
        ids.add(d.ruleId)
        byKey.set(key, ids)
      }
      for (const [key, ids] of byKey) {
        if (ids.size > 1) {
          collisions.push(`[${name}] ${[...ids].join(' + ')} → ${key.split(':').slice(2).join(':')}`)
        }
      }
    }

    expect(
      collisions,
      `two rules emitted an identical diagnostic — one defect must produce one diagnostic:\n  ${collisions.join('\n  ')}`,
    ).toEqual([])
  })

  it('the <For> without `by` defect produces exactly one diagnostic', () => {
    // Direct regression lock on the shipped bug: this reported twice
    // (warn from jsx/no-missing-for-by, error from
    // performance/no-large-for-without-by) before the duplicate was removed.
    const config = allRulesConfig()
    const result = lintFile(
      '/proj/src/List.tsx',
      `const App = () => <For each={items}>{(r) => <li />}</For>`,
      allRules,
      config,
    )
    const forBy = result.diagnostics.filter((d) =>
      d.message.includes('`<For>` without `by` prop'),
    )
    expect(forBy.map((d) => d.ruleId)).toEqual(['pyreon/no-missing-for-by'])
  })

  it('monorepo-scoped rules are OFF in every preset a consumer selects', () => {
    // These encode THIS repository — its layer order, its private internal
    // packages, its `[Pyreon]` error prefix. Shipping them on would fire
    // `@pyreon/*`-specific errors in a user's app. This repo re-enables them
    // by id in its own `.pyreonlintrc.json`, which keeps the dependency
    // visible in config rather than hidden inside a shared preset.
    const monorepo = allRules.filter((r) => r.meta.scope === 'monorepo')
    expect(monorepo.length).toBeGreaterThan(0)

    const shipped: PresetName[] = ['recommended', 'strict', 'app', 'lib', 'best-practices']
    const leaked: string[] = []
    for (const preset of shipped) {
      const config = getPreset(preset)
      for (const rule of monorepo) {
        const entry = config.rules[rule.meta.id]
        const severity = Array.isArray(entry) ? entry[0] : entry
        if (severity !== 'off') leaked.push(`${preset}: ${rule.meta.id} = ${severity}`)
      }
    }
    expect(leaked, `monorepo rules enabled in a shipped preset:\n  ${leaked.join('\n  ')}`).toEqual(
      [],
    )
  })

  it('the monorepo-scoped set is exactly the rules that hardcode this repo', () => {
    // Pinned rather than derived so widening the set is a deliberate edit.
    // The membership test is empirical: each of these hardcodes an
    // `@pyreon/*` specifier or a `packages/<layer>/` path in its source.
    // `dev-guard-warnings` hardcodes neither — it is a genuine
    // library-author rule and deliberately stays in the shipped presets.
    const ids = allRules
      .filter((r) => r.meta.scope === 'monorepo')
      .map((r) => r.meta.id)
      .sort()
    expect(ids).toEqual([
      'pyreon/no-circular-import',
      'pyreon/no-cross-layer-import',
      'pyreon/no-error-without-prefix',
      'pyreon/no-query-selector-cast-in-test',
      'pyreon/require-browser-smoke-test',
      'pyreon/vitest-config-uses-shared',
    ])
  })

  it('every monorepo-scoped rule lives in the architecture category', () => {
    // If a monorepo rule ever appears elsewhere, the category is probably the
    // thing that is wrong — these are all "this repo is laid out like so".
    for (const rule of allRules.filter((r) => r.meta.scope === 'monorepo')) {
      expect(rule.meta.category, rule.meta.id).toBe('architecture')
    }
  })

  it('missing `by` on <For> is an error, not a warning', () => {
    // The deleted duplicate was the `error` half of the pair. The survivor
    // keeps that severity so removing it does not silently weaken the gate.
    const rule = allRules.find((r) => r.meta.id === 'pyreon/no-missing-for-by')
    expect(rule?.meta.severity).toBe('error')
  })
})
