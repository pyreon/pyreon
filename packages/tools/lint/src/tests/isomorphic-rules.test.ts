import { describe, expect, it } from 'vitest'
import { groupOf } from '../rules/groups'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The `isomorphic` group — the hydration contract.
 *
 * These rules describe the one bug class a full-stack framework produces that
 * neither a pure-server nor a pure-client linter can see: a file that renders
 * on BOTH sides, producing different output on each. The failure is silent —
 * the markup is structurally identical and only a value differs — which is
 * why they exist as static rules rather than as something a test would catch.
 *
 * The group shipped with only fires-invariant fixtures and no dedicated
 * specs, which is why its branch coverage was the lowest in the package
 * (`no-locale-dependent-format` at 45%). Every "does NOT fire" case below is
 * as load-bearing as the positive one: these run on `shared` files, which is
 * most of an app, so a false positive is expensive.
 */

const ALL: Record<string, string> = {
  'pyreon/no-locale-dependent-format': 'warn',
  'pyreon/no-timezone-dependent-date': 'warn',
  'pyreon/no-unstable-render-id': 'warn',
  'pyreon/no-node-builtin-in-component': 'warn',
}
const cfg = { rules: ALL } as never

/** Lint a SHARED file — the role every isomorphic rule targets. */
const at = (src: string, file = 'src/Widget.tsx') =>
  lintFile(file, src, allRules, cfg).diagnostics

const only = (src: string, id: string, file?: string) =>
  at(src, file).filter((d) => d.ruleId === id)

describe('isomorphic group wiring', () => {
  it('holds exactly the six hydration-contract rules', () => {
    const iso = allRules.filter((r) => groupOf(r.meta) === 'isomorphic')
    expect(iso.map((r) => r.meta.id).sort()).toEqual([
      'pyreon/no-env-branch-in-render',
      'pyreon/no-locale-dependent-format',
      'pyreon/no-node-builtin-in-component',
      'pyreon/no-timezone-dependent-date',
      'pyreon/no-unstable-render-id',
      'pyreon/require-stable-iteration-order',
    ])
  })

  it('every one reaches shared files — either ungated, or listing the role explicitly', () => {
    // An isomorphic rule that skipped `shared` would be pointless: shared IS
    // the role whose two renders can disagree. `appliesTo: undefined` means
    // ungated (every role), which satisfies this just as explicitly listing
    // it does — `no-node-builtin-in-component` is deliberately ungated.
    for (const r of allRules.filter((x) => groupOf(x.meta) === 'isomorphic')) {
      const reaches = r.meta.appliesTo === undefined || r.meta.appliesTo.includes('shared')
      expect(reaches, `${r.meta.id} appliesTo=${JSON.stringify(r.meta.appliesTo)}`).toBe(true)
    }
  })
})

describe('pyreon/no-locale-dependent-format', () => {
  const ID = 'pyreon/no-locale-dependent-format'

  it.each([
    ['toLocaleString', 'export const s = (n: number) => n.toLocaleString()'],
    ['toLocaleDateString', 'export const s = (d: Date) => d.toLocaleDateString()'],
    ['toLocaleTimeString', 'export const s = (d: Date) => d.toLocaleTimeString()'],
    ['toLocaleLowerCase', 'export const s = (t: string) => t.toLocaleLowerCase()'],
    ['toLocaleUpperCase', 'export const s = (t: string) => t.toLocaleUpperCase()'],
  ])('fires on bare %s', (_name, src) => {
    expect(only(src, ID)).toHaveLength(1)
  })

  it('names the method in the message, so the fix is obvious at the callsite', () => {
    const d = only('export const s = (n: number) => n.toLocaleString()', ID)
    expect(d[0]?.message).toContain('toLocaleString')
    expect(d[0]?.message).toContain('@pyreon/i18n')
  })

  it('stays silent once a locale is passed — that IS the fix', () => {
    expect(only(`export const s = (n: number) => n.toLocaleString('en-US')`, ID)).toEqual([])
  })

  it('stays silent on a locale passed through a variable', () => {
    // The rule keys on argument COUNT, not on the argument being a literal —
    // a resolved locale from @pyreon/i18n is a variable, and flagging it
    // would flag the recommended fix.
    expect(
      only(`export const s = (n: number, loc: string) => n.toLocaleString(loc)`, ID),
    ).toEqual([])
  })

  it.each(['NumberFormat', 'DateTimeFormat', 'RelativeTimeFormat', 'ListFormat', 'Collator'])(
    'fires on bare Intl.%s',
    (ctor) => {
      expect(only(`export const f = new Intl.${ctor}()`, ID)).toHaveLength(1)
    },
  )

  it('stays silent on Intl with an explicit locale', () => {
    expect(only(`export const f = new Intl.NumberFormat('de-DE')`, ID)).toEqual([])
  })

  it('does not fire on an unrelated method that merely starts with toLocale-ish text', () => {
    expect(only(`export const s = (o: any) => o.toLocalTime()`, ID)).toEqual([])
  })

  it('does not fire on a non-Intl namespace', () => {
    expect(only(`export const f = new MyLib.NumberFormat()`, ID)).toEqual([])
  })
})

describe('pyreon/no-timezone-dependent-date', () => {
  const ID = 'pyreon/no-timezone-dependent-date'

  it('fires on a local-timezone getter off a constructed Date', () => {
    expect(only(`export const h = () => new Date().getHours()`, ID)).toHaveLength(1)
  })

  it('fires when the receiver NAME marks it as a date', () => {
    expect(only(`export const h = (createdDate: Date) => createdDate.getDay()`, ID)).toHaveLength(1)
  })

  it('stays silent on the UTC-explicit counterpart — the documented fix', () => {
    expect(only(`export const h = () => new Date().getUTCHours()`, ID)).toEqual([])
  })

  it('stays silent on an ambiguous receiver, deliberately', () => {
    // `d.getHours()` where `d` could be anything is NOT flagged: the rule
    // requires the receiver to be provably a Date (constructed, or named
    // like one). Widening it would flag every `getDay()` on a domain object.
    expect(only(`export const h = (d: any) => d.getHours()`, ID)).toEqual([])
  })
})

describe('pyreon/no-unstable-render-id', () => {
  const ID = 'pyreon/no-unstable-render-id'

  it('fires when a random value lands in an id attribute', () => {
    expect(
      only(`export const C = () => <label id={'f' + Math.random()}>x</label>`, ID),
    ).toHaveLength(1)
  })

  it('fires for Date.now() and crypto.randomUUID() in the same position', () => {
    expect(only(`export const C = () => <div id={String(Date.now())} />`, ID)).toHaveLength(1)
    expect(only(`export const C = () => <div id={crypto.randomUUID()} />`, ID)).toHaveLength(1)
  })

  it('covers the aria pairings, which is where the breakage actually shows', () => {
    expect(
      only(`export const C = () => <div aria-labelledby={crypto.randomUUID()} />`, ID),
    ).toHaveLength(1)
  })

  it('stays silent on createUniqueId, which exists for exactly this', () => {
    expect(
      only(
        `import { createUniqueId } from '@pyreon/core'\nexport const C = () => { const id = createUniqueId(); return <label id={id}>x</label> }`,
        ID,
      ),
    ).toEqual([])
  })

  it('stays silent on a random value that is NOT used as an id', () => {
    // Documented scope: this rule is about id-like attributes. Widening it to
    // any rendered position is tracked separately, and needs handler-scope
    // exclusion first or it flags event handlers, which run on click.
    expect(only(`export const C = () => <div data-x={Math.random()} />`, ID)).toEqual([])
  })
})

describe('pyreon/no-node-builtin-in-component', () => {
  const ID = 'pyreon/no-node-builtin-in-component'

  it('fires on a node: import in a file that also renders', () => {
    const d = only(
      `import { readFileSync } from 'node:fs'\nexport const C = () => <div>{readFileSync('a','utf8')}</div>`,
      ID,
    )
    expect(d.length).toBeGreaterThan(0)
  })

  it('stays silent on an ordinary import', () => {
    expect(
      only(`import { thing } from './thing'\nexport const C = () => <div>{thing}</div>`, ID),
    ).toEqual([])
  })
})
