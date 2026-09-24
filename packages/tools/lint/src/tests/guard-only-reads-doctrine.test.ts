/**
 * The zero-false-positive doctrine of
 * `pyreon/no-guard-only-signal-reads-in-effect`, shape by shape.
 *
 * This rule's docstring is a SPECIFICATION: it enumerates ten cases where
 * the rule must NOT fire, each one a false-positive class found on a real
 * corpus. The existing suite covers the firing shapes and a few of those;
 * this covers the rest, because for a lint rule the non-firing side is the
 * side that decides whether anyone keeps it enabled.
 *
 * A rule that fires on correct code is worse than no rule. People do not
 * fix the finding — they disable the rule, and then the defect it exists
 * to catch ships too. So every "does NOT fire" bullet is a contract with
 * real consequences, and an untested one is a contract that quietly stops
 * holding the next time the AST walk is touched.
 *
 * Each spec below pairs with the doctrine bullet it pins, and the FIRING
 * control at the top is what stops the whole file passing against a rule
 * that has been neutered into silence.
 */
import { noGuardOnlySignalReadsInEffect } from '../rules/reactivity/no-guard-only-signal-reads-in-effect'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULE_ID = 'pyreon/no-guard-only-signal-reads-in-effect'
const CONFIG: LintConfig = { rules: { [RULE_ID]: 'info' } }

// `lintFile` returns `{ filePath, diagnostics }`, not a bare array.
const lint = (source: string): { ruleId: string }[] =>
  lintFile('test.tsx', source, [noGuardOnlySignalReadsInEffect], CONFIG).diagnostics.filter(
    (d) => d.ruleId === RULE_ID,
  )

const fires = (source: string): boolean => lint(source).length > 0

const PRELUDE = `import { signal, effect, untrack } from '@pyreon/reactivity'
const count = signal(0)
const ref = { current: null }
`

describe('the rule fires on the shape it exists for', () => {
  it('reports an effect whose only reactive read sits behind a non-reactive guard', () => {
    // The control. Every "does not fire" spec below is worthless against a
    // rule that has been neutered into silence, so this runs first.
    expect(
      fires(`${PRELUDE}
effect(() => {
  if (ref.current) {
    doThing(count())
  }
})`),
    ).toBe(true)
  })

  it('reports the EARLY-RETURN spelling of the same bug', () => {
    // "Enumerate the spellings" — the statements after a terminating
    // non-reactive `if` are conditionally executed just as surely.
    expect(
      fires(`${PRELUDE}
effect(() => {
  if (!ref.current) return
  doThing(count())
})`),
    ).toBe(true)
  })
})

describe('it stays silent when the effect provably DOES subscribe', () => {
  it('an unconditional proven read', () => {
    expect(
      fires(`${PRELUDE}
effect(() => {
  const n = count()
  if (ref.current) doThing(n)
})`),
    ).toBe(false)
  })

  it('a read inside the GUARD ITSELF — the test subscribes', () => {
    // `if (count() > 0)` reads the signal to evaluate the condition, so
    // the effect subscribes before it can short-circuit.
    expect(
      fires(`${PRELUDE}
effect(() => {
  if (count() > 0) {
    doThing(count())
  }
})`),
    ).toBe(false)
  })

  it('proven reads in BOTH branches of an if/else — one always runs', () => {
    expect(
      fires(`${PRELUDE}
effect(() => {
  if (ref.current) { doThing(count()) } else { doOther(count()) }
})`),
    ).toBe(false)
  })

  it('proven reads in both arms of a TERNARY', () => {
    expect(
      fires(`${PRELUDE}
effect(() => {
  const v = ref.current ? count() : count() + 1
  doThing(v)
})`),
    ).toBe(false)
  })
})

describe('it bails when it cannot PROVE what a call does', () => {
  it('a possible read at an unconditional position', () => {
    // The documented real-corpus FP: `const inst = chart.instance()` —
    // the guard local IS a signal read the rule cannot see through.
    expect(
      fires(`${PRELUDE}
effect(() => {
  const inst = chart.instance()
  if (!inst) return
  doThing(count())
})`),
    ).toBe(false)
  })

  it('a bare identifier call at an unconditional position', () => {
    expect(
      fires(`${PRELUDE}
effect(() => {
  getThing()
  if (ref.current) doThing(count())
})`),
    ).toBe(false)
  })
})

describe('control flow the rule declines to reason about', () => {
  it('reads inside a SWITCH body', () => {
    // "When unsure, do not fire" — fallthrough and default make the
    // reachability of any one case ambiguous.
    expect(
      fires(`${PRELUDE}
effect(() => {
  switch (ref.current) {
    case 'a': doThing(count()); break
    default: break
  }
})`),
    ).toBe(false)
  })

  it('reads inside a CATCH block', () => {
    expect(
      fires(`${PRELUDE}
effect(() => {
  try { risky() } catch { doThing(count()) }
})`),
    ).toBe(false)
  })

  it('reads inside a NESTED function', () => {
    // Sync-invoked vs stored-for-later is unknowable, and a callback
    // param can shadow a tracked name.
    expect(
      fires(`${PRELUDE}
effect(() => {
  const render = () => { doThing(count()) }
  if (ref.current) render()
})`),
    ).toBe(false)
  })

  it('a read in a LOOP body is treated at the inherited guardedness', () => {
    // `for (const c of computeds) sum += c()` is a working effect, not a
    // dead one — a loop over a local array is usually non-empty.
    expect(
      fires(`${PRELUDE}
effect(() => {
  for (const x of [1, 2, 3]) doThing(count() + x)
})`),
    ).toBe(false)
  })
})

describe('reads that do not subscribe are excluded entirely', () => {
  it('a .peek() behind a guard is not a subscription', () => {
    // `.peek()` deliberately bypasses tracking, so an effect whose only
    // "read" is a peek was never going to subscribe — reporting it as a
    // dead effect would be advice to break working loop-prevention code.
    expect(
      fires(`${PRELUDE}
effect(() => {
  if (ref.current) doThing(count.peek())
})`),
    ).toBe(false)
  })

  it('a read inside untrack() does not count', () => {
    expect(
      fires(`${PRELUDE}
effect(() => {
  if (ref.current) untrack(() => doThing(count()))
})`),
    ).toBe(false)
  })

  it('an untrack() with a NON-function argument is still scanned', () => {
    // `untrack` skips its function arguments, not everything it is given
    // — a proven read passed as a plain value still subscribes.
    expect(
      fires(`${PRELUDE}
effect(() => {
  untrack(count())
  if (ref.current) doThing(count())
})`),
    ).toBe(false)
  })
})

describe('destructuring in the effect body', () => {
  it('an object destructure of props counts as a proven read', () => {
    // `const { option } = props` is a getter-backed read, so an effect
    // doing it unconditionally does subscribe.
    expect(
      fires(`${PRELUDE}
effect(() => {
  const { option } = props
  if (ref.current) doThing(option)
})`),
    ).toBe(false)
  })

  it('an ARRAY destructure does not confuse the walk', () => {
    expect(() =>
      lint(`${PRELUDE}
effect(() => {
  const [a, b] = getPair()
  if (ref.current) doThing(count(), a, b)
})`),
    ).not.toThrow()
  })

  it('a NESTED destructure with a rest element does not confuse it either', () => {
    // Pattern walking is recursive over object, array and rest forms; a
    // shape it cannot walk would either crash the rule or silently drop
    // the binding names it uses to avoid shadowed-name false positives.
    expect(() =>
      lint(`${PRELUDE}
effect(() => {
  const { a: { b }, ...rest } = getObj()
  const [, second, ...tail] = getArr()
  if (ref.current) doThing(count(), b, rest, second, tail)
})`),
    ).not.toThrow()
  })

  it('a destructured LOOP variable does not shadow a tracked signal name', () => {
    // `for (const { count } of rows)` binds a local `count`. Treating its
    // call as the module signal would fire on correct code.
    expect(
      fires(`${PRELUDE}
effect(() => {
  for (const { count } of rows) {
    doThing(count)
  }
})`),
    ).toBe(false)
  })
})

describe('effects with nothing to say', () => {
  it('no proven reactive read at all', () => {
    // `effect(() => doStuff())` may read signals inside the callee — the
    // rule cannot see in, so it does not guess.
    expect(fires(`${PRELUDE}\neffect(() => doStuff())`)).toBe(false)
  })

  it('an empty effect body', () => {
    expect(fires(`${PRELUDE}\neffect(() => {})`)).toBe(false)
  })

  it('a nested effect/computed callback is excluded from the outer analysis', () => {
    expect(
      fires(`${PRELUDE}
effect(() => {
  if (ref.current) effect(() => doThing(count()))
})`),
    ).toBe(false)
  })
})
