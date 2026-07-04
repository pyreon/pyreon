import { describe, expect, it } from 'vitest'
import { detectPyreonPatterns } from '../pyreon-intercept'

// Detector: `signal-in-conditional-uncalled`.
//
// A signal/computed used UNCALLED in a truthiness-test position (`sig ? a : b`,
// `sig && x`, `sig ?? x`, `!sig`, `if (sig)`) is always truthy / never nullish
// — the branch is chosen once by the function's identity, the reactive read
// never subscribes, and the value is never tested. This is the exact class as
// the create-zero `counter.tsx` bug (`{isEven ? "true" : "false"}`).
//
// The scope-resolver (`resolvesToSignalBinding`) is the zero-false-positive
// heart: a boolean parameter or local that merely SHARES a signal's name must
// never be flagged — the DOES-NOT-FIRE block below is where that lives or dies.

const CODE = 'signal-in-conditional-uncalled'
const hits = (src: string) => detectPyreonPatterns(src).filter((d) => d.code === CODE)

describe('signal-in-conditional-uncalled — FIRES', () => {
  it('ternary condition (the counter.tsx class) — computed', () => {
    const src = `
      const count = signal(0)
      const isEven = computed(() => count() % 2 === 0)
      function C() { return <span>{isEven ? "yes" : "no"}</span> }
    `
    const found = hits(src)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ current: 'isEven', suggested: 'isEven()', fixable: false })
  })

  it('&& left operand — the common `{sig && <X/>}` JSX shape', () => {
    const src = `
      const show = signal(false)
      function C() { return <div>{show && <p>hi</p>}</div> }
    `
    expect(hits(src)).toHaveLength(1)
    expect(hits(src)[0]!.suggested).toBe('show()')
  })

  it('|| left operand', () => {
    const src = `const name = signal("")\nconst display = name || "anon"`
    expect(hits(src)).toHaveLength(1)
  })

  it('?? left operand', () => {
    const src = `const val = signal(null)\nconst v = val ?? 5`
    expect(hits(src)).toHaveLength(1)
  })

  it('`!` negation', () => {
    const src = `const open = signal(false)\nconst closed = !open`
    expect(hits(src)).toHaveLength(1)
    expect(hits(src)[0]!.suggested).toBe('open()')
  })

  it('`if` condition (imperative handler)', () => {
    const src = `
      const loading = signal(true)
      function handler() { if (loading) { doThing() } }
    `
    expect(hits(src)).toHaveLength(1)
  })

  it('`while` condition', () => {
    const src = `const more = signal(true)\nfunction f() { while (more) { step() } }`
    expect(hits(src)).toHaveLength(1)
  })

  it('parenthesized identifier is still bare', () => {
    const src = `const a = signal(0)\nconst r = (a) ? 1 : 2`
    expect(hits(src)).toHaveLength(1)
  })

  it('fires even when wrapped in `() =>` but the signal is uncalled', () => {
    // The subtle "I wrapped it in an accessor but forgot the ()" case.
    const src = `
      const isEven = computed(() => true)
      function C() { return <span>{() => (isEven ? "a" : "b")}</span> }
    `
    expect(hits(src)).toHaveLength(1)
  })
})

describe('signal-in-conditional-uncalled — DOES NOT FIRE (zero false positives)', () => {
  it('the CORRECT called form `sig() ? a : b`', () => {
    const src = `
      const isEven = computed(() => true)
      function C() { return <span>{isEven() ? "a" : "b"}</span> }
    `
    expect(hits(src)).toHaveLength(0)
  })

  it('boolean PARAMETER shadowing a signal of the same name', () => {
    const src = `
      const active = computed(() => true)
      function Tab({ active }: { active: boolean }) { return active ? <a/> : <b/> }
    `
    expect(hits(src)).toHaveLength(0)
  })

  it('non-signal LOCAL shadowing a signal of the same name', () => {
    const src = `
      const ok = signal(true)
      function f() { const ok = getBool(); return ok ? 1 : 2 }
    `
    expect(hits(src)).toHaveLength(0)
  })

  it('a value read via `.peek()` is not a signal callable', () => {
    const src = `const s = signal(0)\nconst n = s.peek()\nconst r = n ? 1 : 2`
    expect(hits(src)).toHaveLength(0)
  })

  it('a plain (non-signal) boolean in the condition', () => {
    const src = `const other = signal(0)\nconst cond = flag\nconst r = cond ? 1 : 2`
    expect(hits(src)).toHaveLength(0)
  })

  it('member access `sig.length ? …` is not a bare identifier', () => {
    const src = `const list = signal([])\nconst r = list.length ? 1 : 2`
    expect(hits(src)).toHaveLength(0)
  })

  it('signal in the VALUE (right) operand of && is not a truthiness test', () => {
    const src = `const sig = signal(0)\nconst r = flag && sig`
    expect(hits(src)).toHaveLength(0)
  })

  it('called signal in && left operand', () => {
    const src = `const show = signal(false)\nfunction C() { return <div>{show() && <p/>}</div> }`
    expect(hits(src)).toHaveLength(0)
  })

  it('imported/cross-module signal (no local binding) stays silent', () => {
    // No `const X = signal()` in this file → not confirmable without a type
    // checker → conservative no-flag.
    const src = `import { flag } from './store'\nconst other = signal(0)\nconst r = flag ? 1 : 2`
    expect(hits(src)).toHaveLength(0)
  })
})
