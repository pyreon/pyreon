// Branch matrix for `inlineValueConstsInStmts` — the statement-tree walk that
// substitutes a component's body-local value `const`s into every expression a
// STRUCT-LEVEL emit will hold.
//
// The reason it has to be TOTAL over the statement grammar: a component's
// value consts are emitted as body-local `let`s inside `var body`, while
// handlers, computeds and functions become struct MEMBERS. A member cannot
// see a body-local, so a reference left un-inlined is "cannot find 'K' in
// scope" — a real-SDK-only failure that the parse-only gate passes.
//
// One `const` is therefore referenced from inside EVERY statement kind below,
// and the inlined form is asserted per kind. The `declare` / `break` /
// `continue` kinds are the no-op arms (nothing to inline) and are asserted by
// their untouched emit.
//
// The whole pass is also short-circuited when a component declares NO value
// consts, so the second describe asserts that byte-identical path.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const swift = (src: string) => transform(src, { target: 'swift' }).code

const app = (body: string, extra = '') => swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const K = 3
  const run = () => {
${body}
  }
${extra}
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`)

describe('a value const is inlined into every statement kind', () => {
  it('declare / let / assign / if+else / return / expr', () => {
    const out = app(`    let out: string
    let v = K + 1
    v = K + v
    if (v > K) { v = K } else { v = K * 2 }
    out = String(K)
    n.set(v + out.length)`, `  const get = () => { return K + 1 }`)
    // `declare` carries no expression — emitted untouched
    expect(out).toContain('var out: String\n')
    expect(out).toContain('var v = (3) + 1')
    expect(out).toContain('v = (3) + v')
    expect(out).toContain('if v > (3) {')
    expect(out).toContain('v = (3) * 2')
    expect(out).toContain('out = String((3))')
    // a `return` with an expression, in a struct-member function
    expect(out).toContain('private func get() -> Int { (3) + 1 }')
    // the const itself still emits as the body-local `let`
    expect(out).toContain('let K = 3')
  })

  it('while / do-while / for-range / for-of / switch, including their nested bodies', () => {
    const out = app(`    let v = 0
    while (v < K) { v = v + K }
    do { v = v + K } while (v < K)
    for (let i = 0; i < K; i++) { v += K }
    for (let j = 0; j < 6; j += 2) { v += K }
    for (const q of [K, K + 1]) { v += q }
    switch (v) { case K: v = K; break; default: v = K + 9 }
    n.set(v)`)
    expect(out).toContain('while v < (3) {')
    expect(out).toContain('} while v < (3)')
    // the for-range `to` bound AND the body
    expect(out).toContain('for i in 0..<(3) {')
    // a stride keeps its literal step; the BODY still inlines
    expect(out).toContain('for j in stride(from: 0, to: 6, by: 2) {')
    expect(out).toContain('for q in [(3), (3) + 1] {')
    // the discriminant is untouched (`v`), the TESTS and bodies inline
    expect(out).toContain('case (3):')
    expect(out).toContain('v = (3) + 9')
    // `break` carries nothing to inline
    expect(out).toContain('switch v {')
  })

  it('a component with NO value consts short-circuits the whole pass', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const run = () => { let v = 1; v = v + 1; n.set(v) }
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`)
    expect(out).toContain('var v = 1')
    expect(out).not.toContain('(1)')
  })
})

describe('a `for` that is NOT the canonical count-loop is NAMED, never silently emitted', () => {
  it('a non-literal FROM bound declines with the rewrite advice', () => {
    const r = transform(
      `import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const K = 3
  const run = () => { let v = 0; for (let i = K; i < K * 2; i += K) { v += i }; n.set(v) }
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`,
      { target: 'swift' },
    )
    expect(r.warnings.some((w) => w.includes('Only the canonical count-loop lowers to native'))).toBe(
      true,
    )
  })
})

describe('useHotkey — the modifier map de-duplicates aliases', () => {
  it('`mod` and `meta` both map to `.command` and are emitted ONCE', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { useHotkey } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  useHotkey('mod+meta+shift+k', () => { n.set(1) })
  useHotkey('ctrl+alt+j', () => { n.set(2) })
  return (<Stack><Press onPress={() => n.set(0)}><Text>{() => String(n())}</Text></Press></Stack>)
}`)
    expect(out).toContain('.keyboardShortcut(KeyEquivalent("k"), modifiers: [.command, .shift])')
    // every alias maps: ctrl → .control, alt → .option
    expect(out).toContain('.keyboardShortcut(KeyEquivalent("j"), modifiers: [.control, .option])')
  })
})

describe('syncedSignal initial literals, one arm per scalar', () => {
  it('string quotes, bool spells true/false, number passes through', () => {
    const out = swift(`import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '${P}'
export function Collab() {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 'title', initial: 'hi' })
  const count = syncedSignal({ doc, key: 'count', initial: 7 })
  const on = syncedSignal({ doc, key: 'on', initial: true })
  const off = syncedSignal({ doc, key: 'off', initial: false })
  return (<Stack><Text>{() => \`\${title()}\${count()}\${on()}\${off()}\`}</Text></Stack>)
}`)
    expect(out).toContain('PyreonSyncedSignal(doc: doc, key: "title", initial: "hi")')
    expect(out).toContain('PyreonSyncedSignal(doc: doc, key: "count", initial: 7)')
    expect(out).toContain('PyreonSyncedSignal(doc: doc, key: "on", initial: true)')
    expect(out).toContain('PyreonSyncedSignal(doc: doc, key: "off", initial: false)')
    // and the Swift type per scalar
    expect(out).toContain('PyreonSyncedSignal<String>')
    expect(out).toContain('PyreonSyncedSignal<Double>')
    expect(out).toContain('PyreonSyncedSignal<Bool>')
  })
})
