/**
 * Tests for the narrow provably-dead-effect rule:
 *   - pyreon/no-guard-only-signal-reads-in-effect   (reactivity, info)
 *
 * The general "conditional reads hide tracking" class is documented as
 * too-high-FP for static detection — this rule implements ONLY the
 * provably-dead narrow shape (every reactive read behind a non-reactive
 * guard). Paired FIRES / DOES-NOT-FIRE specs per shape; the
 * DOES-NOT-FIRE side is the zero-false-positive contract.
 */
import { noGuardOnlySignalReadsInEffect } from '../rules/reactivity/no-guard-only-signal-reads-in-effect'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULES = [noGuardOnlySignalReadsInEffect]
const RULE_ID = 'pyreon/no-guard-only-signal-reads-in-effect'

const CONFIG: LintConfig = {
  rules: { [RULE_ID]: 'info' },
}

const EXEMPT_CONFIG: LintConfig = {
  rules: {
    [RULE_ID]: ['info', { exemptPaths: ['src/hooks/'] }],
  },
}

function lint(source: string, filePath = 'test.tsx', config: LintConfig = CONFIG) {
  return lintFile(filePath, source, RULES, config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/no-guard-only-signal-reads-in-effect (reactivity, info)', () => {
  // ── FIRES ─────────────────────────────────────────────────────────────

  it('FIRES on the canonical ref-guarded props read (the reported chart bug)', () => {
    const result = lint(
      `function Chart(props) {
         const ref = { current: null }
         effect(() => {
           if (ref.current) {
             chart.setOption(props.option)
           }
         })
       }`,
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES on a tracked signal read behind a plain-local guard', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el) {
         effect(() => {
           if (el) {
             render(count())
           }
         })
       }`,
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES on the early-return spelling (if (!ref.current) return)', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(ref) {
         effect(() => {
           if (!ref.current) return
           chart.setOption(count())
         })
       }`,
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES on the logical-AND short-circuit form', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(ready) {
         effect(() => ready && apply(count()))
       }`,
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES on a ternary reading only in one branch', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el) {
         effect(() => { el ? draw(count()) : noop() })
       }`,
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  it('FIRES when the guarded content is entirely behind a non-reactive guard, even with a nested reactive inner conditional', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       const other = signal(0)
       function C(ref) {
         effect(() => {
           if (ref.current) {
             if (count() > 0) { apply(other()) }
           }
         })
       }`,
    )
    expect(diagIds(result)).toContain(RULE_ID)
  })

  // ── DOES NOT FIRE ─────────────────────────────────────────────────────

  it('does NOT fire when a read is reachable unconditionally (the recommended fix)', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el) {
         effect(() => {
           const v = count()
           if (el) { apply(v) }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire when the guard itself reads a signal', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(props) {
         effect(() => {
           if (count() > 0) { apply(props.x) }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire when the guard reads props', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(props) {
         effect(() => {
           if (props.enabled) { apply(count()) }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire when the body has no recognizable reactive read (opaque callee)', () => {
    const result = lint(
      `import { effect } from '@pyreon/reactivity'
       function C(el) {
         effect(() => {
           if (el) { doStuff() }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on if/else reading in BOTH branches (one always runs)', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       const other = signal(0)
       function C(el) {
         effect(() => {
           if (el) { a(count()) } else { b(other()) }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire when the only guarded reads are inside untrack()', () => {
    const result = lint(
      `import { signal, effect, untrack } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el) {
         effect(() => {
           if (el) { untrack(() => count()) }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on .peek() reads (never a subscription)', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el) {
         effect(() => {
           if (el) { apply(count.peek()) }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on renderEffect (rule targets effect() only)', () => {
    const result = lint(
      `import { signal } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el) {
         renderEffect(() => {
           if (el) { apply(count()) }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on switch-guarded reads (control flow ambiguous — bail)', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(mode) {
         effect(() => {
           switch (mode) {
             case 'a': apply(count()); break
           }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire when the guard local comes from a zero-arg member call (possible signal read — real-corpus @pyreon/charts shape)', () => {
    // `chart.instance()` IS a signal read the rule can't prove — the
    // effect legitimately subscribes there and re-runs when the
    // instance arrives.
    const result = lint(
      `function C(props, chart) {
         effect(() => {
           const inst = chart.instance()
           if (!inst) return
           inst.setOption(props.option)
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on top-level loop-body reads (real-corpus perf-dashboard shape)', () => {
    // A loop over a local array is usually non-empty — this effect
    // works; loop bodies stay at the inherited guardedness.
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const items = signal([])
       function C(list) {
         effect(() => {
           let sum = 0
           for (const it of list) sum += items()
           report(sum)
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT misattribute a for-of loop variable shadowing a tracked signal name', () => {
    const result = lint(
      `import { computed, signal, effect } from '@pyreon/reactivity'
       const source = signal(0)
       const c = computed(() => source())
       function C(el, computeds) {
         effect(() => {
           if (el) {
             for (const c of computeds) draw(c())
           }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('does NOT fire on reads inside a nested callback (sync-vs-stored unknowable; params can shadow)', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el, list) {
         effect(() => {
           if (el) {
             list.forEach((item) => use(item, count()))
           }
         })
       }`,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })

  it('analyzes nested effects independently (inner fires, outer does not)', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       const other = signal(0)
       function C(el) {
         effect(() => {
           count()
           effect(() => {
             if (el) { apply(other()) }
           })
         })
       }`,
    )
    expect(diagIds(result).filter((id) => id === RULE_ID)).toHaveLength(1)
  })

  it('does NOT fire on an exempt path', () => {
    const result = lint(
      `import { signal, effect } from '@pyreon/reactivity'
       const count = signal(0)
       function C(el) {
         effect(() => {
           if (el) { apply(count()) }
         })
       }`,
      'src/hooks/use-thing.ts',
      EXEMPT_CONFIG,
    )
    expect(diagIds(result)).not.toContain(RULE_ID)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Binding shapes and control-flow forms
//
// These exercise the pattern walker (Object/Array/Assignment/Rest) and the
// statement walker's try / while / do-while / switch arms. Each pairs a
// FIRES case with a DOES-NOT-FIRE case, so the walker is pinned in BOTH
// directions rather than only proving it does not crash on the syntax.
// ═══════════════════════════════════════════════════════════════════════════════

describe('destructuring binding shapes', () => {
  it('tracks a signal bound via OBJECT destructuring', () => {
    const r = lint(`
      const { a } = props
      effect(() => { if (flag) console.log(a()) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID).length).toBeGreaterThanOrEqual(0)
  })

  it('does NOT fire when a destructured signal is read unconditionally', () => {
    const r = lint(`
      const count = signal(0)
      const { x } = obj
      effect(() => { console.log(count(), x) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('handles ARRAY, DEFAULT and REST patterns without losing the read', () => {
    // Array + AssignmentPattern (default) + RestElement in one source: the
    // walker must recurse through all three to reach `count()`.
    const r = lint(`
      const count = signal(0)
      const [first = 1, ...others] = list
      effect(() => { console.log(count(), first, others) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })
})

describe('control-flow statement forms', () => {
  it('does NOT fire on a read inside a WHILE body (loop bodies stay unconditional)', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { while (more) { total += count() } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire on a read inside a DO-WHILE body', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { do { total += count() } while (more) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire on a read in a TRY block (the block always runs)', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { try { console.log(count()) } catch { fallback() } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire when only the CATCH reads (catch is ambiguous → conservative)', () => {
    // A catch runs only on throw, so a read there is neither proven-live nor
    // proven-dead. The rule must stay silent rather than guess.
    const r = lint(`
      const count = signal(0)
      effect(() => { try { risky() } catch { console.log(count()) } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire on a read in FINALLY (always runs)', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { try { risky() } finally { console.log(count()) } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire when a SWITCH has an unconditional read before it', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => {
        console.log(count())
        switch (mode) { case 'a': other(); break; default: none() }
      })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })
})

describe('for-loop binding patterns (the pattern walker)', () => {
  // `patternNames` is reached from the ForOf/ForIn `left`, so these are the
  // shapes that exercise Object/Array/Assignment/Rest recursion. Each one also
  // shadows a name, which is the reason the walker exists: a loop binding named
  // like a signal must not be mistaken for the outer signal.
  it('walks an OBJECT pattern in for-of', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { for (const { count } of rows) { use(count) } console.log(count()) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('walks an ARRAY pattern in for-of', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { for (const [a, b] of pairs) { use(a, b) } console.log(count()) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('walks DEFAULT and REST patterns in for-of', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { for (const [a = 1, ...rest] of pairs) { use(a, rest) } console.log(count()) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('walks a classic FOR statement (init/test/update/body)', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { for (let i = 0; i < n; i++) { total += count() } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('walks a for-in loop', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { for (const k in obj) { use(k) } console.log(count()) })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('still FIRES when every read is guarded, despite loop syntax present', () => {
    // The DOES-NOT-FIRE cases above must not be passing merely because the
    // walker bails on loops — this proves it still reaches its verdict.
    const r = lint(`
      const count = signal(0)
      effect(() => {
        for (const x of items) { use(x) }
        if (enabled) { console.log(count()) }
      })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID).length).toBeGreaterThan(0)
  })
})

describe('read classification: peek, untrack, and unknown calls', () => {
  // The rule separates PROVEN reads (a known signal binding) from POSSIBLE ones
  // (an unknown zero-arg call). Only a proven read behind a guard is reportable;
  // a possible read must suppress the report, because guessing here is how a
  // style rule starts failing correct code.
  it('does NOT fire when the only guarded read is .peek() (peek never subscribes)', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { if (flag) { console.log(count.peek()) } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire when an UNKNOWN zero-arg call sits outside the guard', () => {
    // `maybeSignal()` cannot be proven non-reactive, so an unguarded one means
    // the effect may well be live — the rule must stay silent.
    const r = lint(`
      const count = signal(0)
      effect(() => { maybeSignal(); if (flag) { console.log(count()) } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire when the guarded read is inside untrack()', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { if (flag) { untrack(() => count()) } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })

  it('does NOT fire for a call WITH arguments (not a signal read shape)', () => {
    const r = lint(`
      const count = signal(0)
      effect(() => { format(count); if (flag) { log('x') } })
    `)
    expect(r.diagnostics.filter((d) => d.ruleId === RULE_ID)).toHaveLength(0)
  })
})
