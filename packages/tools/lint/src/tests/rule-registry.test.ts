import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { LintConfig, Severity } from '../types'

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

  it('every rule id follows the pyreon/<kebab-case> shape', () => {
    const bad = allRules
      .map((r) => r.meta.id)
      .filter((id) => !/^pyreon\/[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
    // `no-querySelector-cast-in-test` carries camelCase inside a kebab id.
    // Locked as a known deviation rather than silently tolerated, so the
    // list can only shrink.
    expect(bad).toEqual(['pyreon/no-querySelector-cast-in-test'])
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

  it('missing `by` on <For> is an error, not a warning', () => {
    // The deleted duplicate was the `error` half of the pair. The survivor
    // keeps that severity so removing it does not silently weaken the gate.
    const rule = allRules.find((r) => r.meta.id === 'pyreon/no-missing-for-by')
    expect(rule?.meta.severity).toBe('error')
  })
})
