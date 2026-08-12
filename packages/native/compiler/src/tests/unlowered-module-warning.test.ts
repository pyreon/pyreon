// Non-hook exports from web-only modules failed BOTH targets with no warning.
//
// The hook arc keys on `/^use[A-Z]/`, so plain exports fell straight through:
//
//   s                  from @pyreon/validate     ❌ both, 0 warnings
//                        (the `s.object({…})` DECLARATION form now lowers;
//                         inline uses like `s.string().parse(x)` still do not)
//   pipe / map         from @pyreon/rx           ❌ both, 0 warnings
//   createPermissions  from @pyreon/permissions  ❌ both, 0 warnings
//
// while `useQuery` — sitting right next to them in the same kind of import —
// warned properly. Same silent-build-failure class the hook arc was written to
// eliminate, just outside its name filter.
//
// Scoped to NON-HOOK imports, which does two things: it avoids double-warning
// with the hook arc, and it handles PARTIAL support for free. `usePermissions`
// genuinely lowers while `createPermissions` does not, so warning per-EXPORT
// rather than per-package is what keeps that entry honest.
//
// Every entry was MEASURED. `@pyreon/url-state` already warns through another
// path, `@pyreon/toast` now LOWERS to the native PyreonToast runtime (so it
// must NOT warn), and `@pyreon/state-tree`'s `model()` lowers cleanly — so none
// of them is listed, and the tests below assert that rather than leaving it to
// trust.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const P = '@pyreon/primitives'

// NOTE this fixture used to be `const Schema = s.object({ name: s.string() })`.
// That shape now LOWERS — a top-level `s.object({ … })` declaration emits a
// Swift Codable struct / Kotlin data class with parse + constraints — so
// asserting a warning on it would assert the stale-entry failure: telling the
// author a working API is unusable.
//
// The invariant this suite protects is unchanged and still worth holding: an
// `s` use that does NOT lower must warn rather than emit verbatim. Only the
// fixture moved, to an inline call, which is genuinely not lowered.
const VALIDATE = `import { s } from '@pyreon/validate'
import { Stack, Text } from '${P}'
export function C(){ const ok = s.string().parse('x'); return (<Stack><Text>{ok}</Text></Stack>) }`

const RX = `import { pipe, map } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
export function C(){ const xs = signal([1,2]); const dbl = pipe(xs, map((n: number) => n * 2)); return (<Stack><Text>{dbl().length}</Text></Stack>) }`

const PERMISSIONS_FACTORY = `import { createPermissions } from '@pyreon/permissions'
import { Stack, Text } from '${P}'
const can = createPermissions(['posts.edit'])
export function C(){ return (<Stack><Text>{can('posts.edit')}</Text></Stack>) }`

/** The hook from the SAME capability, which DOES lower. */
const PERMISSIONS_HOOK = `import { usePermissions } from '@pyreon/hooks'
import { Stack, Text } from '${P}'
export function C(){ const p = usePermissions(); return (<Stack><Text>x</Text></Stack>) }`

/** A non-hook export that lowers — the guard against over-warning. */
const STATE_TREE = `import { model } from '@pyreon/state-tree'
import { Stack, Text } from '${P}'
const M = model({ state: { n: 0 } }).create()
export function C(){ return (<Stack><Text>{M.n}</Text></Stack>) }`

const warns = (src: string, target: 'swift' | 'kotlin' = 'swift') =>
  transform(src, { target }).warnings ?? []

describe('non-hook exports with no native lowering', () => {
  for (const [label, src, symbol] of [
    ['@pyreon/validate', VALIDATE, 's'],
    ['@pyreon/rx', RX, 'pipe'],
    ['@pyreon/permissions', PERMISSIONS_FACTORY, 'createPermissions'],
  ] as const) {
    it(`${label}: warns, naming the symbol`, () => {
      const hit = warns(src).find((w) => w.startsWith(`${symbol} (from `))
      expect(hit, `no warning; got ${JSON.stringify(warns(src))}`).toBeTruthy()
    })

    it(`${label}: quotes the error the author would otherwise hit`, () => {
      expect(warns(src).some((w) => w.includes(`cannot find '${symbol}' in scope`))).toBe(true)
    })

    it(`${label}: warns on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(warns(src, target).some((w) => w.startsWith(`${symbol} (from `)), target).toBe(true)
      }
    })
  }

  // a11y and http were added after measuring EVERY export of each. NOTE
  // `announce` now LOWERS (→ PyreonA11y), so the a11y probe uses a still-DOM
  // export (`VisuallyHidden`) — the per-export `supported` set keeps `announce`
  // silent while the live-region components still warn.
  for (const [label, src, symbol] of [
    [
      '@pyreon/a11y',
      `import { VisuallyHidden } from '@pyreon/a11y'\nimport { Stack, Text } from '${P}'\nexport function C(){ return (<Stack><VisuallyHidden>hi</VisuallyHidden><Text>x</Text></Stack>) }`,
      'VisuallyHidden',
    ],
    [
      '@pyreon/http',
      `import { endpoint } from '@pyreon/http'\nimport { Stack, Text } from '${P}'\nconst g = endpoint('GET /u/:id')\nexport function C(){ return (<Stack><Text>x</Text></Stack>) }`,
      'endpoint',
    ],
  ] as const) {
    it(`${label}: warns, naming the symbol`, () => {
      const hit = warns(src).find((w) => w.startsWith(`${symbol} (from `))
      expect(hit, `no warning; got ${JSON.stringify(warns(src))}`).toBeTruthy()
    })
  }

  it('points a11y and http at what native actually offers', () => {
    // `announce` lowers now, so probe a still-DOM export for the advice string.
    const a11y = `import { VisuallyHidden } from '@pyreon/a11y'\nimport { Stack, Text } from '${P}'\nexport function C(){ return (<Stack><VisuallyHidden>x</VisuallyHidden><Text>x</Text></Stack>) }`
    const http = `import { endpoint } from '@pyreon/http'\nimport { Stack, Text } from '${P}'\nconst g = endpoint('GET /u')\nexport function C(){ return (<Stack><Text>x</Text></Stack>) }`
    expect(warns(a11y).some((w) => w.includes('accessibilityLabel'))).toBe(true)
    expect(warns(http).some((w) => w.includes('useFetch'))).toBe(true)
  })

  it('names a concrete alternative, not just a refusal', () => {
    // Each module gets its OWN advice — `computed()` for rx, the HOOK for
    // permissions — because a generic "unsupported" leaves the author guessing.
    expect(warns(RX).some((w) => w.includes('computed()'))).toBe(true)
    expect(warns(PERMISSIONS_FACTORY).some((w) => w.includes('usePermissions()'))).toBe(true)
  })

  // The partial-support case, and the reason this is scoped per-export.
  it('does NOT warn for usePermissions, which genuinely lowers', () => {
    expect(warns(PERMISSIONS_HOOK).filter((w) => w.includes('NO native lowering'))).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('usePermissions really does type-check — the split is earned', () => {
    const res = validateSwiftWithStubs(transform(PERMISSIONS_HOOK, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // Over-warning would be its own bug: a non-hook export that DOES lower must
  // stay silent, or the warning becomes noise people learn to ignore.
  it('does NOT warn for state-tree model(), which lowers', () => {
    expect(warns(STATE_TREE).filter((w) => w.includes('NO native lowering'))).toEqual([])
  })

  it.skipIf(!isKotlincAvailable())('state-tree model() really does type-check', () => {
    const res = validateKotlin(transform(STATE_TREE, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it('does not double-warn a symbol imported twice', () => {
    const twice = `import { pipe } from '@pyreon/rx'
import { pipe as p2 } from '@pyreon/rx'
import { Stack, Text } from '${P}'
export function C(){ return (<Stack><Text>x</Text></Stack>) }`
    expect(warns(twice).filter((w) => w.startsWith('pipe (from '))).toHaveLength(1)
  })
})

// @pyreon/sync and @pyreon/rich-text were MISSING from WEB_ONLY_PACKAGES and
// failed both targets with no diagnostic — `syncedSignal(...)` and
// `createRichTextEditor(...)` emitted verbatim and died with "cannot find ...
// in scope", while @pyreon/table, listed right beside them, warned properly.
//
// Fixed in the EXISTING web-only mechanism rather than the module map above:
// these are whole packages with no native runtime (Yjs + IndexedDB/WebSocket;
// TipTap/ProseMirror), which is exactly what that set is for. Adding them to
// the newer per-export map would have worked too and been the wrong home.
//
// Worth recording how they were found: the first probe imported these symbols
// WITHOUT CALLING them, so the emit stripped the unused import and reported
// "OK both, 0 warnings" — a clean pass that proved nothing. A probe that does
// not exercise the thing measures the stripper, not the feature.
describe('web-only packages that were missing from the set', () => {
  for (const [label, src, symbol] of [
    [
      '@pyreon/sync',
      `import { syncedSignal } from '@pyreon/sync'\nimport { Stack, Text } from '${P}'\nexport function C(){ const s = syncedSignal({ key: 'k', initial: 0 }); return (<Stack><Text>{s()}</Text></Stack>) }`,
      '@pyreon/sync',
    ],
    [
      '@pyreon/rich-text',
      `import { createRichTextEditor } from '@pyreon/rich-text'\nimport { Stack, Text } from '${P}'\nexport function C(){ const e = createRichTextEditor({ content: {} }); return (<Stack><Text>x</Text></Stack>) }`,
      '@pyreon/rich-text',
    ],
  ] as const) {
    it(`${label}: warns as WEB-ONLY on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        const hit = warns(src, target).find((w) => w.startsWith(`${symbol} is WEB-ONLY`))
        expect(hit, `${target}: no warning; got ${JSON.stringify(warns(src, target))}`).toBeTruthy()
      }
    })

    it(`${label}: names the escape hatch`, () => {
      expect(warns(src).some((w) => w.includes('<Web>'))).toBe(true)
    })
  }
})

// @pyreon/elements is the INVERSE of @pyreon/rx: there, one export lowers and
// the rest do not; here, only `Element` lowers while Text / List / Overlay /
// Portal all failed both targets SILENTLY. Both are expressed with the same
// `supported` set rather than two mechanisms.
//
// Found by a SYSTEMATIC sweep of every published package rather than more
// ad-hoc probes — the previous four findings came from one-offs and two were
// nearly missed. The sweep also produced false positives worth naming: `mount`,
// `renderToString` and `island` "fail" too, but no author calls a web/server
// entry point inside a shared component body, so reporting them would be noise.
// And `defineStore` looked broken until the probe was written properly — the
// first one stringified it instead of calling it.
describe('partial-support packages: only some exports lower', () => {
  const el = (imp: string, jsx: string) =>
    `import { ${imp} } from '@pyreon/elements'\nimport { Stack, Text } from '${P}'\nexport function C(){ return (<Stack>${jsx}</Stack>) }`

  for (const [name, imp, jsx] of [
    ['Portal', 'Portal', '<Portal><Text>x</Text></Portal>'],
    ['Overlay', 'Overlay', '<Overlay trigger={() => null} content={() => null} />'],
    ['List', 'List', '<List data={[1,2]} />'],
  ] as const) {
    it(`elements ${name}: warns`, () => {
      const hit = warns(el(imp, jsx)).find((w) => w.startsWith(`${imp} (from `))
      expect(hit, `no warning; got ${JSON.stringify(warns(el(imp, jsx)))}`).toBeTruthy()
    })
  }

  it('elements Element stays SILENT — it lowers', () => {
    const src = el('Element', '<Element><Text>x</Text></Element>')
    expect(warns(src).filter((w) => w.includes('NO native lowering'))).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('elements Element really does type-check', () => {
    const src = el('Element', '<Element><Text>x</Text></Element>')
    const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it('storage: the factory warns and points at the hook', () => {
    const src = `import { createStorage } from '@pyreon/storage'\nimport { Stack, Text } from '${P}'\nexport function C(){ const s = createStorage({} as never); return (<Stack><Text>x</Text></Stack>) }`
    expect(warns(src).some((w) => w.includes('useStorage(key, initial)'))).toBe(true)
  })

  it('store defineStore stays SILENT — it lowers', () => {
    const src = `import { defineStore } from '@pyreon/store'\nimport { signal } from '@pyreon/reactivity'\nimport { Stack, Text } from '${P}'\nconst useC = defineStore('c', () => { const n = signal(0); return { n } })\nexport function C(){ const s = useC(); return (<Stack><Text>{s.store.n}</Text></Stack>) }`
    expect(warns(src).filter((w) => w.includes('NO native lowering'))).toEqual([])
  })
})

// @pyreon/core and @pyreon/reactivity — the two most-used packages — each had
// silent failures among exports that mostly DO lower:
//
//   reactivity   batch / untrack / effectScope   ✗   (signal, computed, effect,
//                                                     onCleanup all lower)
//   core         lazy / cx / createUniqueId /    ✗   (onMount, h, Fragment,
//                splitProps                           Show, For, Suspense lower)
//
// These use an explicit `unsupported` DENY list rather than the `supported`
// allow list every other entry uses. That direction is forced: listing what is
// supported here would mean enumerating almost the entire public surface of
// both packages, and anything missed would false-warn on code in essentially
// every multiplatform component. That is the @pyreon/rx over-generalisation at
// the worst possible scale, so the guard tests below matter more than the
// warning tests.
//
// `batch` is arguably strippable rather than unsupported — SwiftUI @State and
// Compose mutableStateOf already coalesce writes within one action, so the
// wrapper is a no-op on native. Warned rather than stripped because that is an
// emit change with a return-value question (`batch(() => x)` yields x on web).
describe('core and reactivity: deny-listed exports', () => {
  const rx = (imp: string, body: string) =>
    `import { ${imp} } from '@pyreon/reactivity'\nimport { Stack, Text, Button } from '${P}'\nexport function C(){ ${body} }`
  const core = (imp: string, body: string) =>
    `import { ${imp} } from '@pyreon/core'\nimport { Stack, Text } from '${P}'\nexport function C(){ ${body} }`

  for (const [label, src, symbol] of [
    ['batch', rx('signal, batch', `const n = signal(0); return (<Stack><Button onPress={() => batch(() => { n.set(1) })}>b</Button></Stack>)`), 'batch'],
    ['untrack', rx('signal, untrack', `const n = signal(0); const v = untrack(() => n()); return (<Stack><Text>{v}</Text></Stack>)`), 'untrack'],
    ['effectScope', rx('effectScope', `const s = effectScope(); return (<Stack><Text>x</Text></Stack>)`), 'effectScope'],
    ['cx', core('cx', `const c = cx(['a']); return (<Stack><Text>{c}</Text></Stack>)`), 'cx'],
    ['createUniqueId', core('createUniqueId', `const id = createUniqueId(); return (<Stack><Text>{id}</Text></Stack>)`), 'createUniqueId'],
  ] as const) {
    it(`${label}: warns, naming the symbol`, () => {
      const hit = warns(src).find((w) => w.startsWith(`${symbol} (from `))
      expect(hit, `no warning; got ${JSON.stringify(warns(src))}`).toBeTruthy()
    })
  }

  // THE GUARD THAT MATTERS. A false warning on any of these would fire in
  // essentially every multiplatform component ever written.
  for (const [label, src] of [
    ['signal + computed', rx('signal, computed', `const n = signal(1); const d = computed(() => n() * 2); return (<Stack><Text>{d()}</Text></Stack>)`)],
    ['onMount', core('onMount', `onMount(() => {}); return (<Stack><Text>x</Text></Stack>)`)],
    [
      'Show',
      `import { Show } from '@pyreon/core'\nimport { signal } from '@pyreon/reactivity'\nimport { Stack, Text } from '${P}'\nexport function C(){ const f = signal(true); return (<Stack><Show when={f()}><Text>x</Text></Show></Stack>) }`,
    ],
    [
      'For',
      `import { For } from '@pyreon/core'\nimport { signal } from '@pyreon/reactivity'\nimport { Stack, Text } from '${P}'\nexport function C(){ const xs = signal([1]); return (<Stack><For each={xs()} by={(i: number) => i}>{(i: number) => <Text>{i}</Text>}</For></Stack>) }`,
    ],
    [
      'Suspense',
      `import { Suspense } from '@pyreon/core'\nimport { Stack, Text } from '${P}'\nexport function C(){ return (<Stack><Suspense fallback={<Text>l</Text>}><Text>x</Text></Suspense></Stack>) }`,
    ],
  ] as const) {
    it(`${label}: stays SILENT — it lowers`, () => {
      expect(warns(src).filter((w) => w.includes('NO native lowering'))).toEqual([])
    })
  }
})
