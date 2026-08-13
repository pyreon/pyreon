// The 28 hooks the compiler claims lower natively, checked end to end.
//
// `NATIVE_LOWERED_HOOKS` is the allowlist that suppresses the "no native
// lowering" warning — so every name in it is an implicit promise that the hook
// emits compilable code on both targets. That promise had never been checked.
// The warning arc verified the 38 hooks that DON'T lower; nothing verified the
// 28 that supposedly do.
//
// Probing all 28 found three defects, each of a different kind:
//
//   useFetch (untyped)   EMIT bug — no generic lowers to `decode(Any.self, …)`,
//                        and `Any` cannot conform to `Decodable`. Swift only;
//                        Kotlin compiles either way. Now warns.
//
//   useStorage (scalar)  GATE hole — scalars lower to SwiftUI's own
//                        `@AppStorage`, which the stub never modelled, so the
//                        common path was outside the type gate entirely.
//                        (A struct value routes to PyreonAppStorage, which WAS
//                        stubbed — so the uncommon path was covered and the
//                        common one was not.)
//
//   usePermissions       STUB bug, in the INVERSE direction of the usual one.
//                        The real init defaults its parameter on both targets;
//                        both stubs required it (and Kotlin renamed it, and
//                        typed the property as a plain Set where the real one
//                        is Compose MutableState). A stub STRICTER than reality
//                        rejects CORRECT code. The documented trap is a
//                        superset stub masking breakage; this is the mirror
//                        image, and it fails in a way that looks like an emit
//                        bug. Latent only because no fixture used the hook.
//
// The through-line, again: each hook is exercised by an example along ONE
// shape, and the other shapes were never compiled. `useFetch` is device-proven
// — with a generic. `useStorage` is device-proven — through the struct path on
// iOS. Device evidence covers the path the example takes, not the API surface.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { NATIVE_LOWERED_HOOKS } from '../parse'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/** One minimal, REALISTIC call per hook — the shape an author would write. */
const USAGES: ReadonlyArray<readonly [string, string, string]> = [
  ['useAppState', '@pyreon/hooks', 'const s = useAppState()'],
  ['useAuth', '@pyreon/hooks', 'const a = useAuth()'],
  ['useBiometrics', '@pyreon/hooks', 'const b = useBiometrics()'],
  ['useClipboard', '@pyreon/hooks', 'const c = useClipboard()'],
  ['useColorScheme', '@pyreon/hooks', 'const c = useColorScheme()'],
  ['useCrashReporter', '@pyreon/hooks', 'const crash = useCrashReporter(); const go = () => { crash.recordError("x") }'],
  ['useDatabase', '@pyreon/hooks', 'const db = useDatabase()'],
  ['useFetch', '@pyreon/hooks', 'const f = useFetch<Resp>("https://x.dev/a")'],
  ['useFilePicker', '@pyreon/hooks', 'const p = useFilePicker()'],
  ['useForm', '@pyreon/form', 'const fm = useForm({ fields: {} })'],
  ['useFieldArray', '@pyreon/form', "const tags = useFieldArray(['a']); const add = () => { tags.append('b') }"],
  ['useGeolocation', '@pyreon/hooks', 'const g = useGeolocation()'],
  ['useHaptics', '@pyreon/hooks', 'const h = useHaptics()'],
  ['useImagePicker', '@pyreon/hooks', 'const i = useImagePicker()'],
  ['useLinking', '@pyreon/hooks', 'const l = useLinking()'],
  ['useMap', '@pyreon/hooks', 'const m = useMap()'],
  ['useNavigate', '@pyreon/router', 'const nav = useNavigate()'],
  ['useSecureStorage', '@pyreon/hooks', "const vault = useSecureStorage(); const save = () => { vault.write('auth', 'tok') }"],
  ['useNotifications', '@pyreon/hooks', 'const n = useNotifications()'],
  ['useOnline', '@pyreon/hooks', 'const o = useOnline()'],
  ['useParams', '@pyreon/router', 'const { id } = useParams()'],
  ['useUrlState', '@pyreon/url-state', "const q = useUrlState('q', 'all'); const go = () => { q.set('b') }"],
  ['usePayments', '@pyreon/hooks', 'const p = usePayments()'],
  // Seeded deliberately. A grant-less `usePermissions()` lowers to an EMPTY
  // native set in which every check denies, and now says so — so it is no
  // longer a shape this loop's "emits without warnings" assertion should use.
  // The seeded form is the one that produces a working container, which is
  // what the stub-fidelity check here is actually for.
  ['usePermissions', '@pyreon/hooks', "const p = usePermissions(['posts.*'])"],
  // Process-scoped storage — plain state, no persistence.
  ['useSessionStorage', '@pyreon/storage', "const s = useSessionStorage<string>('k', 'd')"],
  ['useMemoryStorage', '@pyreon/storage', "const m = useMemoryStorage<string>('k', 'd')"],
  [
    'useBluetooth',
    '@pyreon/hooks',
    'const bt = useBluetooth(); const go = () => { bt.scan() }; const n = bt.scanning()',
  ],
  // Pure state — no runtime, so what this gate proves for them is that the
  // use-site rewrite (reads drop parens, mutators become arithmetic) still
  // type-checks against the stubs.
  ['useToggle', '@pyreon/hooks', 'const t = useToggle(false); const f = () => { t.toggle() }'],
  [
    'useCounter',
    '@pyreon/hooks',
    'const c = useCounter(1, { min: 0, max: 10 }); const f = () => { c.inc(2) }',
  ],
  ['usePush', '@pyreon/hooks', 'const p = usePush()'],
  // Statement-position, so the "decl" here is the call itself — what this
  // gate proves for them is that the emitted .task / LaunchedEffect body
  // type-checks against the stubs.
  ['useInterval', '@pyreon/hooks', 'useInterval(() => { const x = 1 }, 1000)'],
  ['useTimeout', '@pyreon/hooks', 'useTimeout(() => { const x = 1 }, 500)'],
  [
    'useDebouncedCallback',
    '@pyreon/hooks',
    'const dc = useDebouncedCallback((n: number) => { const x = n }, 300)',
  ],
  [
    'useThrottledCallback',
    '@pyreon/hooks',
    'const tc = useThrottledCallback((n: number) => { const x = n }, 100)',
  ],
  [
    'useQuery',
    '@pyreon/query',
    'const q = useQuery<Resp>(() => ({ queryKey: ["k"], queryFn: () => fetch("/x"), staleTime: 0 }))',
  ],
  ['useShare', '@pyreon/hooks', 'const s = useShare()'],
  ['useSizeClass', '@pyreon/hooks', 'const s = useSizeClass()'],
  ['useStorage', '@pyreon/hooks', 'const s = useStorage("k", "")'],
  ['useWebSocket', '@pyreon/hooks', 'const w = useWebSocket("wss://x.dev")'],
]

/**
 * Excluded from the type-check, each for a stated reason. Named here rather
 * than quietly omitted — an exclusion nobody can see is how a gate rots.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'useNativeModule',
    'the FFI escape hatch: it emits a reference to the USER\'s own native class ' +
      '(`useNativeModule("X")` -> `X()`), which by construction cannot exist in a ' +
      'stub. Failing here is correct behaviour, not a defect.',
  ],
  [
    'useLoaderData',
    'already warns — a documented, disclosed gap rather than a silent one.',
  ],
])

const app = (name: string, mod: string, decl: string) =>
  `import { ${name} } from '${mod}'
import { Stack, Text } from '@pyreon/primitives'
type Resp = { text: string }
export function C(){ ${decl}; return (<Stack><Text>x</Text></Stack>) }`

describe('every hook claimed to lower natively type-checks on both targets', () => {
  // Asserted against the REAL allowlist, not a re-typed count: a hook added to
  // NATIVE_LOWERED_HOOKS now fails here until it is either type-checked or
  // excluded with a stated reason. It cannot be added silently — which is
  // exactly how these three defects survived in the first place.
  it('covers every hook in the allowlist, with nothing left unaccounted for', () => {
    const covered = new Set([...USAGES.map(([n]) => n), ...EXCLUDED.keys()])
    const missing = [...NATIVE_LOWERED_HOOKS].filter((h) => !covered.has(h))
    expect(missing, `not checked and not excluded: ${missing.join(', ')}`).toEqual([])
  })

  it('claims coverage for nothing outside the allowlist', () => {
    // The inverse guard — a stale entry here would inflate the apparent
    // coverage of a hook the compiler no longer claims to lower.
    const stale = [...USAGES.map(([n]) => n), ...EXCLUDED.keys()].filter(
      (n) => !NATIVE_LOWERED_HOOKS.has(n),
    )
    expect(stale, `no longer in the allowlist: ${stale.join(', ')}`).toEqual([])
  })

  it('every exclusion carries a rationale', () => {
    for (const [name, why] of EXCLUDED) {
      expect(why.length, name).toBeGreaterThan(40)
    }
  })

  for (const [name, mod, decl] of USAGES) {
    const src = app(name, mod, decl)

    it(`${name}: emits without warnings on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(transform(src, { target }).warnings ?? [], `${name}/${target}`).toEqual([])
      }
    })

    it.skipIf(!isSwiftcAvailable())(`${name}: the emitted Swift type-checks`, () => {
      const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())(`${name}: the emitted Kotlin type-checks`, () => {
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }

  // The measurement the useFetch warning is derived from. Typed compiles,
  // untyped does not — if that ever stops being true, the warning should go
  // rather than outlive the defect.
  describe('useFetch without a response type', () => {
    const untyped = app('useFetch', '@pyreon/hooks', 'const f = useFetch("https://x.dev/a")')

    it('warns, naming the typed form as the fix', () => {
      const w = transform(untyped, { target: 'swift' }).warnings ?? []
      const hit = w.find((x) => x.includes('useFetch without a response type'))
      expect(hit, `no warning; got ${JSON.stringify(w)}`).toBeTruthy()
      expect(hit).toContain('useFetch<Response>')
    })

    it('says it breaks iOS only — Kotlin compiles either way', () => {
      const w = transform(untyped, { target: 'swift' }).warnings ?? []
      expect(w.some((x) => x.includes('iOS only'))).toBe(true)
    })

    it.skipIf(!isSwiftcAvailable())('really does NOT type-check — the warning is earned', () => {
      const res = validateSwiftWithStubs(transform(untyped, { target: 'swift' }).code)
      expect(res.ok).toBe(false)
      expect(res.error ?? '').toContain('Decodable')
    })

    it.skipIf(!isKotlincAvailable())('but Kotlin genuinely is fine, as the warning claims', () => {
      expect(validateKotlin(transform(untyped, { target: 'kotlin' }).code).ok).toBe(true)
    })
  })

  // Guards for the two stub fixes. Both would have passed BEFORE the fix if
  // written loosely ("does usePermissions emit?"), so they assert the thing
  // that was actually wrong: the no-arg call, and the scalar storage path.
  describe('stub fidelity', () => {
    it.skipIf(!isSwiftcAvailable())('PyreonPermissions() with NO argument type-checks on Swift', () => {
      // The real init defaults its parameter; the stub used to require one.
      const res = validateSwiftWithStubs(
        transform(app('usePermissions', '@pyreon/hooks', 'const p = usePermissions()'), {
          target: 'swift',
        }).code,
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())('PyreonPermissions() with NO argument type-checks on Kotlin', () => {
      const res = validateKotlin(
        transform(app('usePermissions', '@pyreon/hooks', 'const p = usePermissions()'), {
          target: 'kotlin',
        }).code,
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isSwiftcAvailable())('the SCALAR useStorage path is gated, not just the struct one', () => {
      // Scalars lower to SwiftUI's @AppStorage (previously unstubbed);
      // structs lower to PyreonAppStorage (always stubbed).
      for (const decl of ['const s = useStorage("k", "")', 'const n = useStorage("k", 0)']) {
        const code = transform(app('useStorage', '@pyreon/hooks', decl), { target: 'swift' }).code
        expect(code, decl).toContain('@AppStorage')
        expect(validateSwiftWithStubs(code).ok, decl).toBe(true)
      }
    })
  })
})
