import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * Two rules that were silent on real code, found by auditing every rule that
 * never fires across the repo.
 *
 * Running all 131 over 5,262 files, 72 fired and 59 did not. Most of the 59 are
 * explained — opt-in, dependency-gated, or monorepo-scoped — but 30 were
 * active, and each one's only evidence was a synthetic fixture. Probing those
 * 30 with realistic spellings found one genuinely broken rule and one with a
 * documented blind spot. The other 28 were fine; my probes had been wrong.
 *
 * That ratio is the argument for this file existing: a fires-fixture proves a
 * rule can fire on the shape someone found convenient to write, and nothing
 * more.
 */

const cfg = {
  rules: {
    'pyreon/promise-race-needs-cleartimeout': 'warn',
    'pyreon/prefer-request-context': 'warn',
  },
} as never

const fires = (id: string, file: string, src: string) =>
  lintFile(file, src, allRules, cfg).diagnostics.filter((d) => d.ruleId === id).length

describe('promise-race-needs-cleartimeout — the no-try leak', () => {
  const ID = 'pyreon/promise-race-needs-cleartimeout'

  it('fires when there is no try at all', () => {
    // The rule shipped with a single `TryStatement` visitor, so it could only
    // ever fire on a race someone had ALREADY wrapped. With no try/finally
    // anywhere the timer can never be cleared — the strictly worse version of
    // the defect, and it was reported by nothing.
    expect(
      fires(
        ID,
        'src/a.ts',
        `export async function w(p: any) { return Promise.race([p, new Promise((_r, rej) => setTimeout(rej, 5000))]) }`,
      ),
    ).toBe(1)
  })

  it('fires for the block-bodied executor too', () => {
    expect(
      fires(
        ID,
        'src/a.ts',
        `export async function w(p: any) { return Promise.race([p, new Promise((_r, rej) => { setTimeout(() => rej(new Error('t')), 100) })]) }`,
      ),
    ).toBe(1)
  })

  it('still fires inside a try with no finally — the original behaviour', () => {
    expect(
      fires(
        ID,
        'src/a.ts',
        `async function go(w: any) {\n  try {\n    return await Promise.race([w, new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 100))])\n  } catch (e) { throw e }\n}`,
      ),
    ).toBe(1)
  })

  it('stays silent when a finally clears the timer', () => {
    expect(
      fires(
        ID,
        'src/a.ts',
        `async function go(w: any) {\n  let t: any\n  try {\n    return await Promise.race([w, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('t')), 100) })])\n  } finally { clearTimeout(t) }\n}`,
      ),
    ).toBe(0)
  })

  it('stays silent when the clear happens without a try', () => {
    // The rule's job is to catch a timer nothing can cancel, not to insist the
    // cancel sits in a `finally`.
    expect(
      fires(
        ID,
        'src/a.ts',
        `export async function w(p: any) { let t: any\n  const r = await Promise.race([p, new Promise((_r, rej) => { t = setTimeout(rej, 100) })])\n  clearTimeout(t)\n  return r }`,
      ),
    ).toBe(0)
  })

  it('stays silent on a race with no timer in it', () => {
    expect(fires(ID, 'src/a.ts', `export const w = (a: any, b: any) => Promise.race([a, b])`)).toBe(0)
  })
})

describe('prefer-request-context — api routes are server files too', () => {
  const ID = 'pyreon/prefer-request-context'

  it('fires on a module-level signal in an fs-router api route', () => {
    // `isServerFile` is a PATH guess (`server` in the path, or `*.server.ts`)
    // and knows nothing about api routes — which the role-aware plan called
    // out directly as "its broken path guess". A module-level signal in
    // `src/routes/api/*` is the same per-request-state defect.
    expect(
      fires(ID, 'src/routes/api/posts.ts', `const store = signal(0)\nexport function GET() { return store() }`),
    ).toBeGreaterThan(0)
  })

  it('still fires on the paths it always covered', () => {
    expect(fires(ID, 'src/server/x.ts', `const store = signal(0)\nexport function h() { return store() }`)).toBeGreaterThan(0)
  })

  it('stays out of ordinary client code', () => {
    expect(fires(ID, 'src/W.tsx', `const store = signal(0)\nexport const W = () => store()`)).toBe(0)
  })
})
