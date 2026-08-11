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
