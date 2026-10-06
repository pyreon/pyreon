/**
 * Locks WHICH callee names make a prop-derived `const x = <call>(…)` a
 * stateful initializer (referenced at JSX use sites, never re-invoked) — on
 * BOTH backends.
 *
 * Two mechanisms decide it: the `useX` / `createX` naming convention
 * (`isFactoryConventionName` / `is_factory_convention_name`) and a short
 * explicit list for the names the convention cannot reach (`signal`,
 * `computed`, `effect`, `batch`, `defineStore`). Every other library name that
 * used to sit in that list (`useForm`, `useQuery`, `createContext`, …) is
 * covered by the convention, and this matrix pins that: if the convention is
 * narrowed, each of those names fails here BY NAME instead of silently
 * minting one disconnected instance per JSX use site.
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

let nativeTransform: NativeTransform | null = null
try {
  const requireAddon = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  const native = requireAddon(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as {
    transformJsx: NativeTransform
  }
  nativeTransform = native.transformJsx
} catch {
  // reported by the explicit presence spec below
}

/** Names the `useX` / `createX` convention reaches (formerly also listed). */
const CONVENTION_COVERED = [
  'createSelector',
  'createContext',
  'createReactiveContext',
  'useContext',
  'useRef',
  'createRef',
  'useForm',
  'useQuery',
  'useMutation',
  'useStore',
] as const

/** Names the convention cannot reach — these MUST stay explicit. */
const EXPLICIT_ONLY = ['signal', 'computed', 'effect', 'batch', 'defineStore'] as const

const backends: Array<[string, (code: string) => string]> = [
  ['js', (c) => transformJSX_JS(c, 'c.tsx').code ?? ''],
  ['native', (c) => nativeTransform!(c, 'c.tsx', false, null).code],
]

const invocations = (out: string, name: string): number =>
  [...out.matchAll(new RegExp(`\\b${name}\\(`, 'g'))].length

describe('stateful-call names', () => {
  it('the native binary is present (a skipped backend is not coverage)', () => {
    expect(nativeTransform).not.toBeNull()
  })

  for (const [backend, emit] of backends) {
    describe(backend, () => {
      for (const name of [...CONVENTION_COVERED, ...EXPLICIT_ONLY]) {
        it(`${name}(props.x) is invoked ONCE across several JSX use sites`, () => {
          if (backend === 'native' && !nativeTransform) return
          const out = emit(
            `function C(props){ const h = ${name}(props.n); return <div class={h} title={h}>{h}<span>{h}</span></div> }`,
          )
          expect(invocations(out, name)).toBe(1)
          expect(out).toMatch(new RegExp(`const h = ${name}\\(`))
        })
      }

      it('a user function with a lookalike NON-hook name is still inlined (stays reactive)', () => {
        if (backend === 'native' && !nativeTransform) return
        for (const name of ['useful', 'creator', 'userName', 'signals', 'defineStorex']) {
          const out = emit(
            `function C(props){ const h = ${name}(props.n); return <div class={h}>{h}</div> }`,
          )
          expect(invocations(out, name), name).toBeGreaterThan(1)
        }
      })
    })
  }

  it('both backends agree byte-for-byte on every name', () => {
    if (!nativeTransform) return
    // Bare-reference use sites only: a NON-stateful prop-derived const used as
    // a member-call receiver (`{() => h.c()}`) currently diverges between the
    // backends (native references `h`, JS re-inlines the call) — a separate,
    // pre-existing finding that is deliberately not asserted here.
    for (const name of [...CONVENTION_COVERED, ...EXPLICIT_ONLY]) {
      const src = `function C(props){ const h = ${name}(props.n); return <div class={h}>{h}</div> }`
      expect(nativeTransform(src, 'c.tsx', false, null).code, name).toBe(
        transformJSX_JS(src, 'c.tsx').code,
      )
    }
  })
})
