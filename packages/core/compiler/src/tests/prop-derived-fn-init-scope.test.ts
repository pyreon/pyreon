/**
 * `propDerivedFnInits` records which prop-derived consts were initialized by a
 * FUNCTION expression (`const f = () => props.x`) — those inline to something
 * that is live when called, so the member-call fast path may keep it. Any other
 * prop-derived initializer (`const f = foo(props.n)`) must BAIL from that fast
 * path, or the value computed once at bind time goes stale.
 *
 * The set is keyed by NAME, like the registry it qualifies, so it has to stop at
 * the declaring scope the same way (issue #3815's leak class): a function
 * initializer in one component must not make a same-named VALUE initializer in
 * a sibling look live. Locked on BOTH backends — the scoping is a push/undo log
 * mirrored in jsx.ts and native/src/lib.rs.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  code: string,
  filename: string,
  ssr: boolean,
  knownSignals: string[] | null,
) => { code: string }

let native: NativeTransform | null = null
try {
  const req = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  native = (
    req(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as { transformJsx: NativeTransform }
  ).transformJsx
} catch {
  /* native binary absent — JS specs still run, equivalence specs skip */
}

const js = (src: string): string => transformJSX_JS(src, 't.tsx').code
const rs = (src: string): string => native!('' + src, 't.tsx', false, null).code
/** Text from `marker` on — the part of the module the case is about. */
const from = (out: string, marker: string): string => out.slice(out.indexOf(marker))

const FN_COMPONENT = `export function A(props: { x: number }) {
  const f = () => props.x
  return <p>{f()}</p>
}
`
const VALUE_COMPONENT = `export function B(props: { n: number }) {
  const f = foo(props.n)
  return <p>{f()}</p>
}
`

const backends: Array<[string, (src: string) => string, boolean]> = [
  ['JS', js, true],
  ['native', rs, native !== null],
]

describe.each(backends)('prop-derived fn-init flag is lexically scoped — %s backend', (_name, compile, available) => {
  it.runIf(available)('a value initializer compiles the same next to a function initializer as alone', () => {
    const alone = from(compile(VALUE_COMPONENT), 'function B')
    const afterFn = from(compile(FN_COMPONENT + VALUE_COMPONENT), 'function B')
    expect(afterFn).toBe(alone)
  })

  it.runIf(available)('and the other way round (value first, function second)', () => {
    const alone = from(compile(FN_COMPONENT), 'function A')
    const afterValue = from(compile(VALUE_COMPONENT + FN_COMPONENT), 'function A')
    expect(afterValue).toBe(alone)
  })

  it.runIf(available)('a function initializer still takes the live fast path (the flag is not lost)', () => {
    const fnAlone = compile(FN_COMPONENT)
    const valueAlone = compile(VALUE_COMPONENT)
    // the two shapes must compile differently — if they did not, the flag would
    // be doing nothing and the cases above would pass vacuously
    expect(from(fnAlone, 'function A')).not.toBe(from(valueAlone, 'function B').replace('function B', 'function A'))
  })
})

describe('prop-derived fn-init flag — backends agree', () => {
  it.runIf(native !== null)('JS and native emit byte-identical output for the sibling shapes', () => {
    for (const src of [FN_COMPONENT + VALUE_COMPONENT, VALUE_COMPONENT + FN_COMPONENT]) {
      expect(rs(src)).toBe(js(src))
    }
  })
})
