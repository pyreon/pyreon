// `try` / `catch` / `finally` and `throw` lower to both native targets.
//
// Before this, both statements were outside PMTC's subset: anywhere in a helper or a handler they warned
// "Unsupported statement" and were DROPPED — a dropped `throw` keeps running the code after it, and a dropped `try`
// loses the whole guarded block. Ordinary validation code (`if (!raw) throw new Error('required')`) could not cross.
//
// The two targets disagree on the error model, which is what these specs pin:
//
// - Kotlin exceptions are unchecked like JavaScript's, so the lowering is one-to-one.
// - Swift errors are checked: a helper that throws becomes `throws`, so does every helper that calls it without
//   catching (a fixed point), and each call is marked `try` where that is legal.
//
// A throw that NOTHING catches in a closure that cannot throw (an event handler) has no web-equivalent natively —
// Kotlin terminates, so Swift terminates too (`try!` / `fatalError`), and both targets name the position in a warning.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
  validateSwiftWithStubs,
} from '../validate'

const head = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
`

const validation = `${head}
function parseAge(raw: string): number {
  if (raw === '') throw new Error('required')
  const n = Number(raw)
  if (n < 0) throw new RangeError(\`negative: \${raw}\`)
  return n
}
function describeAge(raw: string): string {
  return 'age ' + String(parseAge(raw))
}
function App() {
  const input = signal('12')
  const msg = signal('')
  const check = () => {
    try {
      msg.set(describeAge(input()))
    } catch (e) {
      msg.set(\`failed: \${e.message}\`)
    } finally {
      input.set('')
    }
  }
  return (<Stack><Text>{msg()}</Text><Button onPress={check}>Check</Button></Stack>)
}`

const caughtInside = `${head}
function safeAge(raw: string): number {
  try {
    if (raw === '') throw new Error('required')
    return Number(raw)
  } catch {
    return 0
  }
}
function App() {
  const n = signal(safeAge('4'))
  return (<Stack><Text>{String(n())}</Text></Stack>)
}`

const rethrow = `${head}
function strict(raw: string): number {
  try {
    if (raw === '') throw new Error('required')
    return Number(raw)
  } catch (err) {
    throw err
  }
}
function App() {
  const out = signal('')
  const go = () => {
    try { out.set(String(strict(''))) } catch (e) { out.set(e.message) }
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`

const guarded = `${head}
type Item = { id: number; name: string }
function nameOf(items: Item[], id: number): string {
  const found = items.find((i) => i.id === id)
  if (found === undefined) throw new Error('missing')
  return found.name
}
function App() {
  const items = signal<Item[]>([{ id: 1, name: 'a' }])
  const out = signal('')
  const go = () => {
    try { out.set(nameOf(items(), 1)) } catch (e) { out.set(e.message) }
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`

const uncaught = `${head}
function parseAge(raw: string): number {
  if (raw === '') throw new Error('required')
  return Number(raw)
}
function App() {
  const n = signal('')
  return (<Stack><Text>{n()}</Text>
    <Button onPress={() => n.set(String(parseAge('')))}>Call</Button>
    <Button onPress={() => { throw new Error('boom') }}>Throw</Button>
  </Stack>)
}`

const asyncHandler = `${head}
function parseAge(raw: string): number {
  if (raw === '') throw new Error('required')
  return Number(raw)
}
function App() {
  const n = signal('')
  return (<Stack><Text>{n()}</Text>
    <Button onPress={async () => { n.set(String(parseAge(''))) }}>Call</Button>
  </Stack>)
}`

// The TypeScript-strict spellings: the catch binding is \`unknown\`, so real code narrows or casts it.
const strictCatch = `${head}
function p(raw: string): number {
  if (raw === '') throw new Error('required')
  return 1
}
function App() {
  const r = signal('')
  const a = () => { try { r.set(String(p(''))) } catch (e) { r.set(e instanceof Error ? e.message : String(e)) } }
  const b = () => { try { r.set(String(p(''))) } catch (e) { r.set((e as Error).message) } }
  const c = () => { try { r.set(String(p(''))) } catch (e) { r.set(\`failed: \${String(e)}\`) } }
  return (<Stack><Text>{r()}</Text><Button onPress={a}>A</Button><Button onPress={b}>B</Button><Button onPress={c}>C</Button></Stack>)
}`

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })
const code = (src: string, target: 'swift' | 'kotlin') => emit(src, target).code
const warnings = (src: string, target: 'swift' | 'kotlin') => emit(src, target).warnings.join('\n')

describe('throw + try/catch/finally — emit shape', () => {
  it('Swift: a throwing helper is `throws`, and so is a helper that calls it without catching', () => {
    const swift = code(validation, 'swift')
    expect(swift).toContain('func parseAge(_ raw: String) throws -> Double')
    expect(swift).toContain('throw PyreonThrown(message: "required")')
    // The fixed point: describeAge does not throw itself, but lets parseAge's error through.
    expect(swift).toMatch(/func describeAge\(_ raw: String\) throws -> String/)
    expect(swift).toContain('(try parseAge(raw))')
  })

  it('Swift: try/catch/finally is a do/catch with the finally block as a defer', () => {
    const swift = code(validation, 'swift')
    expect(swift).toMatch(/do \{\s*defer \{\s*input = ""\s*\}\s*do \{\s*msg = \(try describeAge\(input\)\)\s*\} catch let e \{/)
    expect(swift).toContain('pyreonErrorMessage(e)')
    expect(swift).toContain('private struct PyreonThrown: Error')
  })

  it('Kotlin: native exceptions, no signature changes', () => {
    const kotlin = code(validation, 'kotlin')
    expect(kotlin).toContain('fun parseAge(raw: String): Double')
    expect(kotlin).toContain('throw PyreonThrown("required")')
    expect(kotlin).toMatch(/try \{\s*msg = describeAge\(input\)\s*\} catch \(e: Exception\) \{/)
    expect(kotlin).toMatch(/\} finally \{\s*input = ""\s*\}/)
    expect(kotlin).toContain('pyreonErrorMessage(e)')
  })

  it('no warnings for the fully-handled shape, on either target', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warnings(validation, target)).not.toMatch(/throw|ThrowStatement|TryStatement/)
    }
  })

  it('a helper whose throw is caught inside it does not become `throws`', () => {
    const src = caughtInside
    const swift = code(src, 'swift')
    expect(swift).toContain('func safeAge(_ raw: String) -> Double')
    expect(swift).not.toContain('safeAge(_ raw: String) throws')
    expect(swift).toMatch(/\} catch \{\s*return 0/)
    expect(code(src, 'kotlin')).toContain('catch (pyreonCaught: Exception)')
  })

  it('a rethrow from a catch rethrows the caught error, and makes the helper throw', () => {
    const src = rethrow
    const swift = code(src, 'swift')
    expect(swift).toContain('func strict(_ raw: String) throws -> Double')
    expect(swift).toContain('throw err')
    expect(code(src, 'kotlin')).toContain('throw err')
  })

  it('an `if (x === undefined) throw` guard narrows the rest of a throwing helper', () => {
    const src = guarded
    const swift = code(src, 'swift')
    expect(swift).toMatch(/guard let found( = [^\n]*)? else \{\s*throw PyreonThrown\(message: "missing"\)\s*\}/)
    expect(swift).toContain('return found.name')
  })
})

describe('TypeScript-strict catch spellings', () => {
  it('`instanceof Error` is constant natively, and the cast / String() read through the accessors', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = code(strictCatch, target)
      expect(out).toContain('pyreonErrorMessage(e)')
      expect(out).toContain('pyreonErrorString(e)')
      expect(out).not.toMatch(/e \+ Error/)
      expect(warnings(strictCatch, target)).not.toContain('instanceof')
    }
  })

  it('a subclass test cannot be answered and is named', () => {
    const src = strictCatch.replace('e instanceof Error ?', 'e instanceof RangeError ?')
    expect(warnings(src, 'swift')).toContain('keeps the message, not the JavaScript error class')
  })
})

describe('an uncaught throw in a closure that cannot throw', () => {
  const src = uncaught

  it('Swift terminates (try! / fatalError) and warns', () => {
    const swift = code(src, 'swift')
    expect(swift).toContain('(try! parseAge(""))')
    expect(swift).toContain('fatalError(String(describing: PyreonThrown(message: "boom")))')
    expect(warnings(src, 'swift')).toContain('TERMINATES the app')
  })

  it('Kotlin throws natively and warns the same', () => {
    expect(code(src, 'kotlin')).toContain('throw PyreonThrown("boom")')
    expect(warnings(src, 'kotlin')).toContain('TERMINATES the app')
  })

  it('an async handler reports the error instead (the web reports an unhandled rejection)', () => {
    const asyncSrc = asyncHandler
    const swift = code(asyncSrc, 'swift')
    expect(swift).toContain('(try parseAge(""))')
    expect(swift).toContain('Unhandled error in an async handler')
    expect(code(asyncSrc, 'kotlin')).toContain('Unhandled error in an async handler')
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warnings(asyncSrc, target)).not.toContain('TERMINATES')
    }
  })
})

describe('shapes that do not lower are named, not dropped silently', () => {
  it('throwing a non-Error value', () => {
    const src = `${head}
function f(x: number): number {
  if (x < 0) throw { code: 1 }
  return x
}
function App() { return (<Stack><Text>{String(f(1))}</Text></Stack>) }`
    expect(warnings(src, 'swift')).toContain('throws some other value')
  })

  it('a finally block that returns', () => {
    const src = `${head}
function f(x: number): number {
  try { return x } finally { return 0 }
}
function App() { return (<Stack><Text>{String(f(1))}</Text></Stack>) }`
    expect(warnings(src, 'kotlin')).toContain('A `finally` block that')
  })
})

describe('try/throw survives the real toolchains', () => {
  const sources = { validation, strictCatch, caughtInside, rethrow, guarded, uncaught, asyncHandler }
  for (const [name, src] of Object.entries(sources)) {
    it.skipIf(!isSwiftcAvailable())(`Swift: ${name} type-checks against the stub`, () => {
      const r = validateSwiftWithStubs(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isSwiftUIAvailable())(`Swift: ${name} type-checks against the real SwiftUI SDK`, () => {
      const r = validateSwiftTypecheck(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`Kotlin: ${name} compiles on kotlinc`, () => {
      const r = validateKotlin(code(src, 'kotlin'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
  }
})
