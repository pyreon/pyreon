/**
 * The guard-only-reads rule, and its zero-false-positive doctrine.
 *
 * This rule reports a specific, provably-dead shape: an `effect` whose ONLY
 * reactive reads sit behind a conditional that is itself non-reactive. On the
 * first run the guard short-circuits, the effect subscribes to nothing, and it
 * never runs again — the reported instance was a chart that simply never
 * rendered, with no error anywhere.
 *
 * Its docblock commits to a list of cases where it must NOT fire, and that
 * list is the rule: the general "conditional reads hide tracking" class is
 * documented as too false-positive-prone for static detection, so this rule is
 * only worth having while it stays inside the narrow provable subset. A single
 * false positive on a working effect is what gets it — and with it the real
 * detections — switched off.
 *
 * Each `quiet` case below names the specific reason from that doctrine, so a
 * change that widens the rule fails here with the reason it broke rather than
 * a count.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const SIG = `import { signal, computed, effect, batch, untrack } from '@pyreon/reactivity'\n`
let root = ''
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-shapes3-'))
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@pyreon/shape-fixture-3',
      dependencies: { '@pyreon/core': '*', '@pyreon/reactivity': '*', '@pyreon/store': '*' },
    }),
  )
})
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

const run = (ruleId: string, file: string, source: string): number => {
  const abs = join(root, file)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, source)
  const config: LintConfig = { rules: { [ruleId]: 'error' } }
  return lintFile(abs, source, allRules, config).diagnostics.filter(
    (d) => d.ruleId === ruleId,
  ).length
}

const ID = 'pyreon/no-guard-only-signal-reads-in-effect'
const F = 'src/a.ts'
const decl = `${SIG}const s = signal(0)\nconst t = signal(1)\nlet ready = false\n`

describe('no-guard-only-signal-reads-in-effect reports the dead shape', () => {
  it('reports an early-return guard over the only read — the control', () => {
    expect(
      run(ID, F, `${decl}effect(() => { if (!ready) return; console.log(s()) })`),
    ).toBeGreaterThan(0)
  })

  it('reports the IF-BLOCK form as readily as the early return', () => {
    expect(
      run(ID, F, `${decl}effect(() => { if (ready) { console.log(s()) } })`),
    ).toBeGreaterThan(0)
  })

  it('reports when EVERY read is behind the same guard', () => {
    expect(
      run(ID, F, `${decl}effect(() => { if (!ready) return; console.log(s(), t()) })`),
    ).toBeGreaterThan(0)
  })

  it('reports a `props.X` read behind a guard', () => {
    // Compiler-emitted reactive props are getter-backed, so `props.option`
    // subscribes exactly like a signal call — and dies behind a guard exactly
    // the same way. This is the shape the original bug report had: a chart
    // whose option never applied, with nothing in the console.
    //
    // The guard has to be a plain local. `if (props.el)` would be quiet and
    // correctly so — a `props.X` test is itself a reactive read, so the effect
    // subscribes there and is alive.
    expect(
      run(
        ID,
        F,
        `${SIG}export function C(props: any) { let el = null as any
  effect(() => { if (el) { render(props.option) } }) }`,
      ),
    ).toBeGreaterThan(0)
  })

  it('reports a guard nested TWO deep', () => {
    expect(
      run(ID, F, `${decl}effect(() => { if (ready) { if (ready) { console.log(s()) } } })`),
    ).toBeGreaterThan(0)
  })
})

describe('and stays silent everywhere its doctrine says it must', () => {
  it('is QUIET when a read is reachable unconditionally — the fix', () => {
    expect(
      run(ID, F, `${decl}effect(() => { const v = s(); if (!ready) return; console.log(v) })`),
    ).toBe(0)
  })

  it('is quiet when the GUARD ITSELF reads a signal', () => {
    // The test subscribes, so the effect is alive — reporting it would tell
    // the author to "fix" working code.
    expect(
      run(ID, F, `${decl}effect(() => { if (s() > 0) { console.log(t()) } })`),
    ).toBe(0)
  })

  it('is quiet when an if/else has reads in BOTH branches', () => {
    // One branch always runs, so a read always happens.
    expect(
      run(ID, F, `${decl}effect(() => { if (ready) { console.log(s()) } else { console.log(t()) } })`),
    ).toBe(0)
  })

  it('is quiet for a TERNARY with reads on both sides', () => {
    expect(run(ID, F, `${decl}effect(() => { console.log(ready ? s() : t()) })`)).toBe(0)
  })

  it('is quiet when an UNPROVABLE call sits unconditionally', () => {
    // `chart.instance()` might itself be a signal read the rule cannot prove.
    // The real corpus false positive was exactly this, and the doctrine is to
    // bail rather than guess.
    expect(
      run(ID, F, `${decl}effect(() => { const inst = chart.instance(); if (!inst) return; console.log(s()) })`),
    ).toBe(0)
  })

  it('is quiet when reads sit only in a SWITCH body', () => {
    // Control flow too ambiguous to prove dead — a `default` case may always
    // run, and the rule does not attempt to decide.
    expect(
      run(
        ID,
        F,
        `${decl}effect(() => { switch (mode) { case 'a': console.log(s()); break; default: break } })`,
      ),
    ).toBe(0)
  })

  it('is quiet when reads sit only in a CATCH block', () => {
    expect(
      run(ID, F, `${decl}effect(() => { try { go() } catch { console.log(s()) } })`),
    ).toBe(0)
  })

  it('is quiet when reads sit inside a NESTED function', () => {
    // Sync-invoked or stored for later is unknowable, and a callback param can
    // shadow a tracked name — so any read-like content in a nested function
    // bails the whole analysis.
    expect(
      run(ID, F, `${decl}effect(() => { const f = () => s(); if (ready) f() })`),
    ).toBe(0)
  })

  it('is quiet for reads in a LOOP body', () => {
    // A loop over a local array is usually non-empty; treating it as a guard
    // would report `for (const c of computeds) sum += c()`, which works.
    expect(
      run(ID, F, `${decl}effect(() => { for (const c of items) { console.log(s(), c) } })`),
    ).toBe(0)
  })

  it('is quiet when the read is inside `untrack`', () => {
    // An untracked read subscribes to nothing by design, so it is not evidence
    // either way — and reporting on it would be reporting the author's
    // explicit choice.
    expect(
      run(ID, F, `${decl}effect(() => { const v = untrack(() => s()); if (ready) console.log(v) })`),
    ).toBe(0)
  })

  it('is quiet for an effect with NO reactive reads at all', () => {
    // Nothing to lose. This effect has its own problem, and it is a different
    // rule's.
    expect(run(ID, F, `${decl}effect(() => { if (ready) console.log('hi') })`)).toBe(0)
  })

  it('is quiet OUTSIDE an effect', () => {
    // The whole defect is about subscription on the first run. A guarded read
    // in a plain function is just a guarded read.
    expect(
      run(ID, F, `${decl}export function go() { if (!ready) return; console.log(s()) }`),
    ).toBe(0)
  })

  it('is quiet when a shadowing LOOP VARIABLE has the tracked name', () => {
    // `for (const s of list) s()` is calling the loop variable, not the
    // signal — counting it as a proven read would report a working effect.
    expect(
      run(
        ID,
        F,
        `${decl}effect(() => { const v = t(); for (const s of list) { if (ready) console.log(s) } return v })`,
      ),
    ).toBe(0)
  })
})
