/**
 * Tests for `pyreon/storage-signal-v-forwarding`.
 *
 * The rule catches the bug class fixed in PR #546: a wrapper callable
 * that delegates `.direct` to a base signal but forgets to forward `_v`,
 * causing the compiler-emitted `_bindText` fast path to read `undefined`
 * and render empty text post-hydration.
 */
import { getPreset } from '../config/presets'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

function lint(source: string, filePath = 'src/foo.ts') {
  return lintFile(filePath, source, allRules, getPreset('recommended'))
}

function ids(result: ReturnType<typeof lint>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

const RULE = 'pyreon/storage-signal-v-forwarding'

describe('pyreon/storage-signal-v-forwarding', () => {
  // ─── FIRES (bug shape) ─────────────────────────────────────────────────────

  it('FIRES on `wrapper.direct = sig.direct` without _v forwarding', () => {
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  wrapper.direct = sig.direct
  wrapper.peek = () => sig.peek()
  return wrapper
}
`
    expect(ids(lint(source))).toContain(RULE)
  })

  it('FIRES on `wrapper.direct = (cb) => sig.direct(cb)` arrow delegate without _v', () => {
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  wrapper.direct = (cb) => sig.direct(cb)
  return wrapper
}
`
    expect(ids(lint(source))).toContain(RULE)
  })

  it('FIRES on arrow with block body `(cb) => { return sig.direct(cb) }`', () => {
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  wrapper.direct = (cb) => {
    return sig.direct(cb)
  }
  return wrapper
}
`
    expect(ids(lint(source))).toContain(RULE)
  })

  it('FIRES at the module-level (no enclosing function)', () => {
    const source = `
const sig = signal(0)
const wrapper = (() => sig())
wrapper.direct = (cb) => sig.direct(cb)
`
    expect(ids(lint(source))).toContain(RULE)
  })

  // ─── DOES NOT FIRE (acceptable patterns) ───────────────────────────────────

  it('does NOT fire when _v is forwarded via Object.defineProperty', () => {
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  wrapper.direct = (cb) => sig.direct(cb)
  Object.defineProperty(wrapper, '_v', {
    get: () => sig._v,
    configurable: true,
  })
  return wrapper
}
`
    expect(ids(lint(source))).not.toContain(RULE)
  })

  it('does NOT fire when _v is assigned directly (rare but valid)', () => {
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  wrapper.direct = (cb) => sig.direct(cb)
  wrapper._v = sig._v
  return wrapper
}
`
    expect(ids(lint(source))).not.toContain(RULE)
  })

  it('does NOT fire when Object.defineProperty appears BEFORE .direct assignment (order-independent)', () => {
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  Object.defineProperty(wrapper, '_v', { get: () => sig._v })
  wrapper.direct = (cb) => sig.direct(cb)
  return wrapper
}
`
    expect(ids(lint(source))).not.toContain(RULE)
  })

  it('does NOT fire on signal implementations themselves (`.direct = _direct` plain identifier, not a delegate)', () => {
    // The base `signal()` factory assigns a shared `_direct` function
    // to `signalFn.direct`. The RHS is a bare Identifier, NOT a
    // MemberExpression — so the rule correctly skips it.
    const source = `
function signal(initial) {
  const fn = () => fn._v
  fn._v = initial
  fn.direct = _direct
  return fn
}
`
    expect(ids(lint(source))).not.toContain(RULE)
  })

  it('does NOT fire when only .direct method is read (not assigned)', () => {
    const source = `
function foo(sig) {
  const fn = () => sig.direct
  return fn()
}
`
    expect(ids(lint(source))).not.toContain(RULE)
  })

  it('does NOT fire on unrelated property assignments', () => {
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  wrapper.peek = () => sig.peek()
  wrapper.subscribe = (cb) => sig.subscribe(cb)
  return wrapper
}
`
    expect(ids(lint(source))).not.toContain(RULE)
  })

  // ─── SCOPE BEHAVIOR ────────────────────────────────────────────────────────

  it('FIRES separately for each function scope (per-scope tracking)', () => {
    const source = `
function makeA(sig) {
  const a = () => sig()
  a.direct = sig.direct
  Object.defineProperty(a, '_v', { get: () => sig._v })
  return a
}
function makeB(sig) {
  const b = () => sig()
  b.direct = sig.direct
  return b
}
`
    const diags = lint(source).diagnostics.filter((d) => d.ruleId === RULE)
    // Only makeB should fire.
    expect(diags).toHaveLength(1)
  })

  it('does NOT use _v from an unrelated identifier in the same scope', () => {
    // `other._v = …` doesn't satisfy `wrapper`'s missing forwarding.
    const source = `
function createWrapper(sig) {
  const wrapper = () => sig()
  const other = {}
  wrapper.direct = sig.direct
  Object.defineProperty(other, '_v', { get: () => 0 })
  return wrapper
}
`
    expect(ids(lint(source))).toContain(RULE)
  })

  // ─── ANCHOR: REAL STORAGE PATTERN ──────────────────────────────────────────

  it('does NOT fire on the post-fix storage shape (canonical reference)', () => {
    const source = `
function createStorageSignal(sig, key, defaultValue) {
  const storageSig = (() => sig())
  storageSig.peek = () => sig.peek()
  storageSig.subscribe = (listener) => sig.subscribe(listener)
  storageSig.direct = (updater) => sig.direct(updater)
  storageSig.debug = () => sig.debug()
  Object.defineProperty(storageSig, '_v', {
    get: () => sig._v,
    configurable: true,
  })
  storageSig.set = (value) => {
    sig.set(value)
  }
  return storageSig
}
`
    expect(ids(lint(source))).not.toContain(RULE)
  })

  it('FIRES on the pre-fix storage shape (bisect canary)', () => {
    // Pre-PR-#546: same as above MINUS the Object.defineProperty(_v) block.
    const source = `
function createStorageSignal(sig, key, defaultValue) {
  const storageSig = (() => sig())
  storageSig.peek = () => sig.peek()
  storageSig.subscribe = (listener) => sig.subscribe(listener)
  storageSig.direct = (updater) => sig.direct(updater)
  storageSig.debug = () => sig.debug()
  storageSig.set = (value) => {
    sig.set(value)
  }
  return storageSig
}
`
    expect(ids(lint(source))).toContain(RULE)
  })
})
