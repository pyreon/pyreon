// `defineStore('<id>', setup)` recognition.
//
// Every bail in this recognizer is LOUD by design, and that is the whole point
// of the arc it came from: the v1 shape fell through to a silent `return null`
// and emitted uncompilable passthrough — `private let useApp = defineStore("app",
// { ((n: signal(1))) })`, referencing `defineStore` and `signal`, neither of
// which exists in Swift, with zero warnings on both targets.
//
// So each spec here asserts TWO things for the shape it declines: the warning
// that names it, AND that no store singleton was emitted (a warning beside a
// half-emitted store would be the same failure wearing a diagnostic). The
// paired positive shape proves the recognizer still accepts what it should.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'

const mod = (decls: string): string => `import { Stack, Text } from '${P}'
${decls}
export function S() { const a = useApp(); return (<Stack><Text>{String(a)}</Text></Stack>) }`

const store = (setup: string, id = `'app'`): string =>
  mod(`const useApp = defineStore(${id}, ${setup})`)

const run = (src: string) => transform(src, { target: 'swift' })
const warnings = (src: string): string[] => run(src).warnings
const emitsStore = (src: string): boolean => run(src).code.includes('PyreonStore_')
const declined = (src: string, needle: string): void => {
  expect(warnings(src).some((w) => w.includes(needle))).toBe(true)
  expect(emitsStore(src)).toBe(false)
}

const OK = `() => { const n = signal(0); return { n } }`

describe('defineStore — the shape that lowers', () => {
  it('a block-body setup with a signal and a shorthand return emits the singleton', () => {
    const src = store(OK)
    expect(warnings(src)).toEqual([])
    expect(run(src).code).toContain('PyreonStore_app')
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonStore_app')
  })

  it('a `function` expression setup is accepted alongside the arrow form', () => {
    const src = mod(`const useApp = defineStore('app', function () { const n = signal(0); return { n } })`)
    expect(warnings(src)).toEqual([])
    expect(emitsStore(src)).toBe(true)
  })

  it('signals, computeds and methods all land on the singleton', () => {
    const src = store(
      `() => { const n = signal(0); const d = computed(() => n() * 2); const inc = () => { n.set(n() + 1) }; return { n, d, inc } }`,
    )
    expect(warnings(src)).toEqual([])
    const code = run(src).code
    expect(code).toContain('PyreonStore_app')
    expect(code).toContain('inc')
  })

  it('a `signal()` with no argument still declares a field', () => {
    const src = store(`() => { const n = signal(); return { n } }`)
    expect(emitsStore(src)).toBe(true)
  })

  it('a setup-body decl that is neither signal/computed/arrow is skipped, not fatal', () => {
    // A `const z = other(1)` is an ordinary call: it declares nothing the
    // singleton can carry, so it is skipped while the store still emits.
    const src = store(`() => { const n = signal(0); const z = other(1); return { n } }`)
    expect(emitsStore(src)).toBe(true)
  })

  it('a destructured decl inside the setup body is skipped, not fatal', () => {
    const src = store(`() => { const { a } = o; const n = signal(0); return { n } }`)
    expect(emitsStore(src)).toBe(true)
  })
})

describe('defineStore — the store ID', () => {
  it('a module-scope `const` holding the id resolves', () => {
    const src = mod(`const ID = 'app'\nconst useApp = defineStore(ID, ${OK})`)
    expect(warnings(src)).toEqual([])
    expect(emitsStore(src)).toBe(true)
  })

  it('a computed id is declined by name', () => {
    declined(store(OK, 'makeId()'), 'the id must be statically known')
  })

  it('a single-argument call is not a store declaration at all', () => {
    const src = mod(`const useApp = defineStore('app')`)
    expect(emitsStore(src)).toBe(false)
    expect(warnings(src)).toEqual([])
  })
})

describe('defineStore — the setup argument', () => {
  it('a non-function setup is declined by name', () => {
    expect(warnings(store(`{}`)).some((w) => w.includes('setup argument must be a function expression')))
      .toBe(true)
    expect(emitsStore(store(`{}`))).toBe(false)
  })

  it('the EXPRESSION-body form is declined and names the block-body form', () => {
    declined(store(`() => ({ n: signal(0) })`), 'v1 requires the block-body form')
  })

  it('a setup with no return is declined', () => {
    declined(store(`() => { const n = signal(0) }`), 'must return an object literal of signals')
  })

  it('a return that is not an object literal is declined', () => {
    declined(store(`() => { const n = signal(0); return n }`), 'setup must return an object literal')
  })

  it('a parenthesised return object is unwrapped rather than declined', () => {
    const src = store(`() => { const n = signal(0); return ({ n }) }`)
    expect(emitsStore(src)).toBe(true)
  })
})

describe('defineStore — the setup BODY statements', () => {
  it('a statement kind outside the supported set is declined, and NAMES the kind', () => {
    // Naming the node kind is what makes the message actionable — "saw
    // `VariableDeclaration`" for a `let`, which the recognizer only accepts as
    // `const`.
    const src = store(`() => { let q = 1; return { q } }`)
    expect(warnings(src).some((w) => w.includes('saw `VariableDeclaration`'))).toBe(true)
    expect(emitsStore(src)).toBe(false)
  })

  it('a BLOCK-body computed is declined and names the expression-body form', () => {
    declined(
      store(`() => { const n = signal(0); const d = computed(() => { return 1 }); return { n, d } }`),
      'must be an expression-body arrow',
    )
  })

  it('a computed whose argument is not an arrow at all is declined the same way', () => {
    declined(
      store(`() => { const n = signal(0); const d = computed(fn); return { n, d } }`),
      'must be an expression-body arrow',
    )
  })
})

describe('defineStore — the RETURNED object', () => {
  it('a non-shorthand key is declined, and names the shorthand form', () => {
    declined(
      store(`() => { const n = signal(0); return { n: n } }`),
      'only shorthand keys are supported',
    )
  })

  it('a returned key matching no setup decl is declined BY NAME', () => {
    declined(store(`() => { const n = signal(0); return { n, zz } }`), 'returned key `zz`')
  })

  it('an EMPTY returned object is accepted — the decls still land on the singleton', () => {
    // v2 puts ALL setup decls on the singleton, not just the returned subset,
    // so an empty return is not a reason to drop the store.
    const src = store(`() => { const n = signal(0); return {} }`)
    expect(emitsStore(src)).toBe(true)
  })
})

describe('defineStore — a setup body that is neither a block nor an object', () => {
  it('an expression-body arrow returning a NON-object is not a store at all', () => {
    // Neither the block form nor the `() => ({ … })` form — there is nothing to
    // read, and nothing to say about it either.
    const src = mod(`const useApp = defineStore('app', () => 42)`)
    expect(warnings(src)).toEqual([])
    expect(emitsStore(src)).toBe(false)
  })
})

describe('defineStore — setup-body and return shapes that are walked past', () => {
  it('a plain `const q = 5` in the setup body is skipped, not fatal', () => {
    // Not a signal, not a computed, not an arrow — nothing the singleton can
    // carry, and nothing worth refusing the whole store over.
    const src = store(`() => { const q = 5; const n = signal(0); return { n } }`)
    expect(warnings(src)).toEqual([])
    expect(emitsStore(src)).toBe(true)
  })

  it('a SPREAD in the returned object is walked past rather than treated as a key', () => {
    const src = store(`() => { const n = signal(0); return { ...rest, n } }`)
    expect(warnings(src)).toEqual([])
    expect(emitsStore(src)).toBe(true)
  })
})
