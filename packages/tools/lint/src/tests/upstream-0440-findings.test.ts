/**
 * Regression locks for the upstream 0.43.1 → 0.44.0 lint findings.
 *
 * Detection-correctness fixes (each bisect-verified — reverting the rule change
 * flips the asserted case):
 *   - LT-2  no-props-destructure    — body-scope `const { a } = props`
 *   - LT-3  no-unbatched-updates    — (A) don't sum `.set()` across `await`;
 *                                     (B) don't count non-signal `.set()` (Map)
 *   - LT-4  no-window-in-ssr        — (2) same-expression `&&` typeof guard;
 *                                     (3) local `const` shadowing a browser global
 *   - LR-10 overlay-a11y           — `<Overlay type>` satisfies a11y
 *
 * Opt-in demotions (LR-1/2/4/9) are locked by best-practices-preset.test.ts
 * (they must be tagged `optIn`) + the detection specs in runner.test.ts /
 * more-rules.test.ts (which enable them explicitly).
 */
import { describe, expect, it } from 'vitest'
import { lintFile } from '../runner'
import { noPropsDestructure } from '../rules/jsx/no-props-destructure'
import { noUnbatchedUpdates } from '../rules/reactivity/no-unbatched-updates'
import { noWindowInSsr } from '../rules/ssr/no-window-in-ssr'
import { overlayA11y } from '../rules/accessibility/overlay-a11y'
import type { Rule } from '../types'

function count(rule: Rule, ruleId: string, code: string, filePath = 'src/App.tsx'): number {
  return lintFile(filePath, code, [rule], { rules: { [ruleId]: 'error' } }).diagnostics.filter(
    (d) => d.ruleId === ruleId,
  ).length
}

describe('LT-2 — no-props-destructure catches the body form', () => {
  const R = 'pyreon/no-props-destructure'
  const fire = (c: string) => count(noPropsDestructure, R, c)

  it('FIRES on `const { a } = props` in the component body', () => {
    expect(fire('function Body(props: any) { const { a } = props; return <div>{a}</div> }')).toBe(1)
  })
  it('FIRES on the arrow body form', () => {
    expect(fire('const C = (props: any) => { const { a } = props; return <div>{a}</div> }')).toBe(1)
  })
  it('FIRES through a TS cast (`props as P`)', () => {
    expect(fire('function C(props: any) { const { a } = props as P; return <div>{a}</div> }')).toBe(1)
  })
  it('still FIRES on the signature form', () => {
    expect(fire('function Sig({ a }: any) { return <div>{a}</div> }')).toBe(1)
  })
  it('does NOT fire on a destructure inside a nested handler (reactivity-correct)', () => {
    expect(
      fire('function C(props: any) { const f = () => { const { a } = props; return a }; return <div onClick={f}>x</div> }'),
    ).toBe(0)
  })
  it('does NOT fire on `= props.nested` (not the bare param)', () => {
    expect(fire('function C(props: any) { const { a } = props.data; return <div>{a}</div> }')).toBe(0)
  })
  it('does NOT fire without a JSX return', () => {
    expect(fire('function helper(props: any) { const { a } = props; return a }')).toBe(0)
  })
})

describe('LT-3 — no-unbatched-updates: await boundaries + non-signal receivers', () => {
  const R = 'pyreon/no-unbatched-updates'
  const fire = (c: string) => count(noUnbatchedUpdates, R, c)

  it('still FIRES on 3 synchronous signal sets', () => {
    expect(fire('function f(){ a.set(1); b.set(2); c.set(3) }')).toBe(1)
  })
  it('Bug A: does NOT fire on 3 sets split by two awaits (max sync run = 1)', () => {
    expect(fire('async function g(){ a.set(1); await tick(); b.set(2); await tick(); c.set(3) }')).toBe(0)
  })
  it('Bug A: does NOT fire on the load(true)/set(await)/load(false) shape (max run = 2)', () => {
    expect(fire('async function load(){ loading.set(true); value.set(await fetch("/x")); loading.set(false) }')).toBe(0)
  })
  it('Bug B: does NOT fire on a Map triple-set', () => {
    expect(fire('function f(){ const m = new Map(); m.set("a",1); m.set("b",2); m.set("c",3) }')).toBe(0)
  })
  it('Bug B: does NOT fire on a URLSearchParams triple-set', () => {
    expect(fire('function f(){ const p = new URLSearchParams(); p.set("a","1"); p.set("b","2"); p.set("c","3") }')).toBe(0)
  })
  it('still FIRES on 3 sync sets before an await', () => {
    expect(fire('async function f(){ a.set(1); b.set(2); c.set(3); await x() }')).toBe(1)
  })
})

describe('LT-4 — no-window-in-ssr: && guard + local-const shadow', () => {
  const R = 'pyreon/no-window-in-ssr'
  const fire = (c: string) => count(noWindowInSsr, R, c)

  it('4.2: does NOT fire on a same-expression `&&` typeof guard', () => {
    expect(fire(`const x = typeof window !== 'undefined' && window.location.href`)).toBe(0)
  })
  it('4.3: does NOT fire on a local `const history` shadow (function scope)', () => {
    expect(fire(`function f(){ const history = getHistory(); history.push('/') }`)).toBe(0)
  })
  it('4.3: does NOT fire on a module-level local shadow', () => {
    expect(fire(`const location = pickLocation(); export const h = location.href`)).toBe(0)
  })
  it('still FIRES on a raw unguarded `window.location`', () => {
    expect(fire(`const x = window.location.href`)).toBe(1)
  })
  it('still FIRES on reverse-order `window.x && typeof window` (left runs unguarded)', () => {
    expect(fire(`const x = window.location.href && typeof window !== 'undefined'`)).toBe(1)
  })
})

describe('LR-10 — overlay-a11y accepts the `type` prop', () => {
  const R = 'pyreon/overlay-a11y'
  const fire = (c: string) => count(overlayA11y, R, c)

  it('does NOT fire when `type` is set (Overlay derives ARIA from it)', () => {
    expect(fire(`const M = () => <Overlay type="dialog"><div>hi</div></Overlay>`)).toBe(0)
  })
  it('still FIRES when neither type nor role/aria-* is present', () => {
    expect(fire(`const M = () => <Overlay><div>hi</div></Overlay>`)).toBe(1)
  })
  it('does NOT fire with an explicit role', () => {
    expect(fire(`const M = () => <Overlay role="dialog"><div>hi</div></Overlay>`)).toBe(0)
  })
})
