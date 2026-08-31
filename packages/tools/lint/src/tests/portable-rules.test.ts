import { describe, expect, it } from 'vitest'
import { groupOf } from '../rules/groups'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The `portable` group — will this source survive PMTC?
 *
 * These are the only rules whose subject is a COMPILER's accepted subset
 * rather than a runtime hazard, and that gives them an unusual failure mode:
 * if PMTC widens its subset and these rules do not, they start flagging code
 * that now compiles. So the specs below pin the construct list explicitly,
 * and any widening on the compiler side should fail them loudly rather than
 * silently leaving a stale rule in place.
 *
 * Both rules are `optIn` — correctly, since they are pure noise in a web-only
 * project — and `no-out-of-subset-construct` additionally fires on NOTHING
 * until `portablePaths` names the files that must travel. That second gate is
 * what makes the group's branch coverage (58%) worth closing: most of its
 * branches are the gating, not the detection.
 */

const OPTS = { portablePaths: ['src/shared/'] }
const cfg = {
  rules: {
    'pyreon/no-out-of-subset-construct': ['warn', OPTS],
    'pyreon/no-platform-branch-without-fallback': 'warn',
  },
} as never

const PORTABLE = 'src/shared/logic.ts'
const at = (src: string, file: string) => lintFile(file, src, allRules, cfg).diagnostics
const only = (src: string, id: string, file = PORTABLE) =>
  at(src, file).filter((d) => d.ruleId === id)

describe('portable group wiring', () => {
  it('holds exactly the six portability rules, and every one is opt-in', () => {
    const p = allRules.filter((r) => groupOf(r.meta) === 'portable')
    expect(p.map((r) => r.meta.id).sort()).toEqual([
      'pyreon/no-css-in-js-in-portable',
      'pyreon/no-out-of-subset-construct',
      'pyreon/no-platform-branch-without-fallback',
      'pyreon/no-web-only-import-in-portable',
      'pyreon/prefer-canonical-primitive',
      'pyreon/require-native-compat-marker',
    ])
    // Opt-in is load-bearing: a web-only project must not see these at all.
    for (const r of p) expect(r.meta.optIn, r.meta.id).toBe(true)
  })
})

describe('pyreon/no-out-of-subset-construct', () => {
  const ID = 'pyreon/no-out-of-subset-construct'

  it.each([
    ['enum', `export enum Color { Red, Blue }`],
    ['class', `export class Thing { x = 1 }`],
    ['throw', `export function f() { throw new Error('no') }`],
    ['regex literal', `export const re = /ab+c/`],
    ['JSON usage', `export const p = (s: string) => JSON.parse(s)`],
  ])('flags %s inside a portable path', (_name, src) => {
    expect(only(src, ID).length).toBeGreaterThan(0)
  })

  it('names a concrete alternative rather than just refusing', () => {
    const d = only(`export enum Color { Red }`, ID)
    expect(d[0]?.message).toContain('union of string literals')
  })

  it('fires on NOTHING when portablePaths is not configured', () => {
    // The single most important property of this rule. Unscoped it would
    // report thousands of findings in code entitled to the whole language,
    // and which files reach iOS cannot be inferred from their contents — so
    // the default is silence, and a scaffolder supplies the answer.
    const bare = { rules: { [ID]: 'warn' } } as never
    expect(
      lintFile(PORTABLE, `export enum Color { Red }`, allRules, bare).diagnostics.filter(
        (d) => d.ruleId === ID,
      ),
    ).toEqual([])
  })

  it('stays out of files OUTSIDE the configured portable paths', () => {
    expect(only(`export enum Color { Red }`, ID, 'src/web-only/admin.ts')).toEqual([])
  })

  it('leaves in-subset code alone', () => {
    expect(
      only(
        `export type Color = 'red' | 'blue'\nexport const pick = (c: Color) => (c === 'red' ? 1 : 2)`,
        ID,
      ),
    ).toEqual([])
  })
})

describe('pyreon/no-platform-branch-without-fallback', () => {
  const ID = 'pyreon/no-platform-branch-without-fallback'
  const TSX = 'src/shared/View.tsx'

  it('fires when only one platform branch exists', () => {
    const d = only(`export const V = () => <Web><b>hi</b></Web>`, ID, TSX)
    expect(d).toHaveLength(1)
    expect(d[0]?.message).toMatch(/NativeIOS|NativeAndroid/)
  })

  it('fires when two of three are present — the silent-blank-on-one-device case', () => {
    expect(
      only(
        `export const V = () => <><Web>w</Web><NativeIOS>i</NativeIOS></>`,
        ID,
        TSX,
      ),
    ).toHaveLength(1)
  })

  it('stays silent when all three targets are covered', () => {
    expect(
      only(
        `export const V = () => <><Web>w</Web><NativeIOS>i</NativeIOS><NativeAndroid>a</NativeAndroid></>`,
        ID,
        TSX,
      ),
    ).toEqual([])
  })

  it('counts a repeated tag once — two <Web> blocks are still one missing pair', () => {
    expect(
      only(`export const V = () => <><Web>a</Web><Web>b</Web></>`, ID, TSX),
    ).toHaveLength(1)
  })

  it('ignores a namespaced/member JSX tag it cannot resolve', () => {
    expect(only(`export const V = () => <Platform.Web>w</Platform.Web>`, ID, TSX)).toEqual([])
  })

  it('stays silent on a file with no platform branch at all', () => {
    expect(only(`export const V = () => <div>plain</div>`, ID, TSX)).toEqual([])
  })
})
