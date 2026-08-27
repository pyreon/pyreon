#!/usr/bin/env bun
/**
 * check-native-coverage — the app-runtime multiplatform FINISH-LINE gate.
 *
 * `check-multiplatform-tier` proves every package DECLARES a multiplatform
 * story (a tier + rationale). It does not prove the story is TRUE: a package
 * can declare `shared` and still emit a warning through PMTC, or claim a
 * native runtime that no longer ships. This gate closes that hole for the
 * surface that matters — the APP-RUNTIME / feature-building packages, the
 * ones an app author actually composes into a screen — and turns "is the
 * monorepo fully multiplatform?" into a measured, enforced number.
 *
 * ## The registry (below) IS the finish-line checklist
 *
 * It enumerates every package that SHOULD cross to iOS/Android — the `shared`
 * tier, the `service-backend` tier, and the `nativeFrontend`/partial set —
 * and pins the MECHANISM by which each one crosses:
 *
 *   - `pmtc-lowers`     — its primary authoring API lowers through
 *                         `@pyreon/native-compiler` with ZERO warnings. Proven
 *                         by transforming a representative, correct-usage
 *                         snippet for BOTH targets and asserting no warnings.
 *                         This is the strongest evidence a package crosses.
 *   - `native-container`— it ships a co-located native runtime beside `src/`
 *                         (`package.json` `pyreon.native` → `native/{swift,kotlin}`).
 *                         Proven by asserting the co-source dirs exist and are
 *                         non-empty. Several ALSO carry a `pmtc-lowers` snippet
 *                         (store/query/i18n/…), tested as a bonus — belt and
 *                         braces: the runtime ships AND the authoring lowers.
 *   - `webview-host`    — its engine is a WEB engine (ECharts, ProseMirror,
 *                         CodeMirror, an elk/SVG layout) that cannot be
 *                         reimplemented as a native view, so the package ships a
 *                         `./webview` subpath that runs the SAME web bundle
 *                         inside a native `<WebView>` (WKWebView / Android
 *                         WebView / `<iframe srcdoc>` on web), with a
 *                         bidirectional data bridge. Proven by asserting the
 *                         subpath is DECLARED, the module EXISTS, it exports the
 *                         documented host API, and a test covers it — see
 *                         `WEBVIEW_HOST_CAVEATS` for what this does NOT buy.
 *   - `partial`         — the package is `web-only` at the TIER level, but its
 *                         manifest declares a `nativeFrontend`: a named SUBSET
 *                         that really does lower (http's endpoint calls,
 *                         validation's `zodSchema(…)` declaration form,
 *                         url-state's string-default `useUrlState`). Proven by
 *                         transforming that documented form and asserting ZERO
 *                         warnings, AND by requiring the manifest to declare the
 *                         `nativeFrontend` the entry claims. Collapsing this into
 *                         `web-first` understates it; calling it a full crossing
 *                         overstates it — so it is counted and reported apart.
 *   - `web-first`       — a rich widget or web-coupled API whose native-frontend
 *                         arc is still OPEN, with NO `nativeFrontend` in its
 *                         manifest. Tracked as a known gap, not a hard failure.
 *                         Where a canonical snippet exists it is transformed and
 *                         asserted to STILL warn, so the day it lowers clean the
 *                         gate prompts a reclassification (the ratchet's forward
 *                         direction).
 *
 * ## Every snippet's IMPORTS are checked against the package's real exports
 *
 * `transform(...)` never resolves imports, so a snippet naming a symbol that
 * does not exist still "runs" — and because an unknown symbol warns "has NO
 * native lowering", it manufactures a gap indistinguishable from a real one.
 * Two entries shipped exactly that way. Every snippet's `@pyreon/*` named
 * imports are now verified against the package's actual exports, and a phantom
 * symbol FAILS the gate loudly.
 *
 * ## What fails the gate (a REGRESSION)
 *
 *   - a `pmtc-lowers` snippet that starts emitting warnings (was crossing,
 *     now does not) — unless the package is on `WARN_ALLOWLIST` with a reason.
 *   - a `native-container` package whose `pyreon.native` co-source vanished.
 *
 * `WARN_ALLOWLIST` is a RATCHET: it can only shrink. It starts EMPTY — every
 * pmtc-lowers/native-container snippet is clean today — so any warning is a
 * real regression until someone consciously accepts it with a reason.
 *
 * The `web-first` set is the OTHER ratchet: it is the list of remaining
 * finish-line items, and it can only shrink as packages move to
 * `native-container` / `pmtc-lowers`.
 *
 * Usage:
 *   bun scripts/check-native-coverage.ts          # verify (CI mode)
 *   bun scripts/check-native-coverage.ts --json    # machine-readable summary
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// NOT `import.meta.dir` — Bun-only; the pure policy below is imported by
// vitest (node) in test-utils. Resolve from this file's URL instead.
const REPO = resolve(new URL('..', import.meta.url).pathname)

/**
 * Packages whose registry snippet transforms WITHOUT warnings but whose emitted
 * native code does NOT compile.
 *
 * This list exists because the gate historically judged a package by transform
 * warnings alone and never compiled anything — so a warning-free uncompilable
 * emit read as "crosses". Compiling all 31 snippets on real swiftc found nine
 * failures, every one of them invisible to the old gate.
 *
 * It is a RATCHET, exactly like `lint-baseline.json`: an entry here is a known
 * debt, and the gate FAILS if a listed package starts compiling (remove it) or
 * if an unlisted one stops (fix it). It can only shrink. Never add an entry to
 * silence a NEW failure — that is the one move that makes this list worthless.
 *
 * The shared shape of every entry below is a VERBATIM PASSTHROUGH: the emitter
 * did not recognise a factory call, so the TS name was reproduced into Swift
 * where no such symbol exists. Each runtime DOES ship the real type
 * (`PyreonMachine`, `PyreonI18n`, `PyreonSyncedSignal`, …), so these are
 * unbuilt lowerings rather than platform limits.
 */
export const KNOWN_UNCOMPILABLE: ReadonlyMap<string, string> = new Map([
  // EMPTY, and that is the point. Every entry this list started with turned out
  // to be a wrong registry snippet or a stub narrower than the shipped runtime,
  // not a package that cannot cross. Add an entry only for a package whose emit
  // genuinely does not build, with the reason — never to silence a new failure.
])

/**
 * The Kotlin half of the same ratchet, and it starts EMPTY.
 *
 * The compile pass was Swift-only from the day it was added, so a Kotlin emit
 * that transformed with zero warnings and did not build read as "crosses" —
 * precisely the hole the Swift half exists to close, left open on the other
 * target. All 33 snippets compile on real kotlinc today, so there is no debt to
 * record; the map exists so a future genuine platform limit has somewhere to go
 * that is visible rather than silent.
 *
 * Same rules: an entry may only be REMOVED, never added to silence a new
 * failure, and a listed package that starts compiling fails the gate.
 */
export const KNOWN_UNCOMPILABLE_KOTLIN: ReadonlyMap<string, string> = new Map([])

export type Mechanism =
  | 'pmtc-lowers'
  | 'native-container'
  | 'webview-host'
  | 'partial'
  | 'web-first'

/**
 * What a `webview-host` entry does NOT buy. Printed with the report so the
 * coverage number can never be read as "natively rendered".
 *
 * Hosting means the SAME web bundle runs inside a native shell. That IS one
 * codebase on every target and it ships — but it is not a native view, and the
 * differences are real:
 *
 *   - a WebView costs process/startup time the native view tree does not;
 *   - every prop/event crosses a JSON bridge, so interaction is not at native
 *     latency and large payloads are serialized per update;
 *   - the hosted content is opaque to native gestures and to the platform
 *     accessibility tree (VoiceOver/TalkBack see a web document, and the
 *     `AccessibilityProps` vocabulary stops at the WebView boundary);
 *   - the host page must be BUNDLED with the app (or fetched, which App Store
 *     4.2 / Play policy discourage), so the engine's bytes ship per app.
 */
export const WEBVIEW_HOST_CAVEATS =
  'the SAME web bundle inside a native shell — real, shipping, one codebase; ' +
  'NOT a native view: WebView startup cost, JSON-bridge latency, no native ' +
  'gesture/accessibility integration for hosted content, host page must be bundled'

export interface RegistryEntry {
  /** `@pyreon/<name>` — the published package. */
  name: string
  /** How this package crosses to native (the checklist label). */
  mechanism: Mechanism
  /** One sentence on the crossing story — the human-readable truth. */
  rationale: string
  /**
   * A representative, CORRECT-USAGE snippet of the primary API. Transformed
   * for both targets. For non-`web-first` entries: warnings MUST be 0 (or the
   * name allowlisted). For `web-first` entries: warnings are expected > 0 and
   * a drop to 0 emits a reclassification NOTICE (not a failure).
   */
  snippet?: string
  /**
   * The package ships a co-located native runtime (`pyreon.native`) that must
   * exist and be non-empty. Set on every `native-container` entry.
   */
  requiresCoSource?: boolean
  /**
   * The `./webview` host contract to VERIFY. Set on every `webview-host` entry.
   *
   * The export names are NAMED here rather than derived from the package name,
   * because they are pattern-identical but not mechanically derivable
   * (`@pyreon/charts` → `buildChartHostHtml`, SINGULAR; `@pyreon/rich-text` →
   * `buildRichTextHostHtml`, PascalCase). A derivation rule would either be
   * wrong for those two or so loose it verified nothing.
   */
  webviewHost?: {
    /** the host-page builder, e.g. `buildChartHostHtml` */
    hostHtmlExport: string
    /** the host component, e.g. `ChartWebView` */
    componentExport: string
  }
}

/**
 * THE REGISTRY — every app-runtime / feature-building package that should
 * cross, with its crossing mechanism. Grouped by mechanism for readability;
 * order does not matter to the logic.
 *
 * Snippets use CORRECT API shapes (verified by running the real
 * `transform(...)`): arrow-form `defineStore`, typed `useQuery<T>`,
 * `createI18n({ locale, messages })`, table `data: () => rows()`, source-first
 * `@pyreon/rx` transforms (NOT `pipe`, which has no native lowering), etc. A
 * malformed snippet manufactures a false gap.
 */
export const REGISTRY: RegistryEntry[] = [
  // ── pmtc-lowers: authoring API lowers clean, no runtime container needed ──
  {
    name: '@pyreon/reactivity',
    mechanism: 'pmtc-lowers',
    rationale: 'signal/computed/effect lower to native @Observable state on both targets.',
    snippet: `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  return (<Stack><Text>{count()}</Text><Text>{doubled()}</Text><Button onPress={() => count.set(count() + 1)}>inc</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/rx',
    mechanism: 'pmtc-lowers',
    rationale:
      'source-first collection transforms (filter/map/take/…) lower to chained computeds; `pipe` stays web-only.',
    snippet: `import { signal } from '@pyreon/reactivity'
import { filter, map } from '@pyreon/rx'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const nums = signal<number[]>([1, 2, 3])
  const evens = filter(nums, (x) => x % 2 === 0)
  const doubled = map(evens, (x) => x * 2)
  return (<Stack><Text>{doubled().length}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/core',
    mechanism: 'pmtc-lowers',
    rationale: 'VNode/components + For/Show control flow lower to SwiftUI/Compose view trees.',
    snippet: `import { signal } from '@pyreon/reactivity'
import { For, Show } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const items = signal<{ id: number; name: string }[]>([{ id: 1, name: 'a' }])
  const on = signal(true)
  return (<Stack><Show when={on()}><Text>hi</Text></Show><For each={items} by={(i) => i.id}>{(i) => <Text>{i.name}</Text>}</For></Stack>)
}`,
  },
  {
    name: '@pyreon/primitives',
    mechanism: 'pmtc-lowers',
    rationale:
      'the canonical native UI vocabulary (Stack/Inline/Text/Button/…) — the primitives that DEFINE what lowers.',
    snippet: `import { Stack, Inline, Text, Button } from '@pyreon/primitives'
export function C() {
  return (<Stack gap={2}><Inline><Text>a</Text></Inline><Button onPress={() => {}}>go</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/styler',
    mechanism: 'pmtc-lowers',
    rationale: 'styled() style objects lower to native view modifiers.',
    // The CALL form `styled('div', {…})` is NOT the lowering shape: the parser
    // requires the TAGGED TEMPLATE over a canonical primitive, and the call
    // form fell through BEFORE the existing non-canonical warning — so this
    // snippet emitted `styled("div", …)` verbatim (uncompilable Swift) with
    // zero warnings, and the gate passed it because the gate only counts
    // warnings and never compiles. Verified: this shape emits `VStack` and
    // typechecks on real swiftc.
    snippet: `import { styled } from '@pyreon/styler'
import { Stack, Text } from '@pyreon/primitives'
const Box = styled(Stack)\`padding: 8px;\`
export function C() { return (<Box><Text>hi</Text></Box>) }`,
  },
  {
    name: '@pyreon/rocketstyle',
    mechanism: 'pmtc-lowers',
    rationale: 'rocketstyle(Element).theme()/.attrs() dimensions lower to native styled components.',
    // The registry used `rocketstyle(Element)` — a call form that does not exist in
    // the RUNTIME either (init.ts is curried: `rocketstyle()({name, component})`),
    // so `readCurriedPrimitive` bailed BEFORE its own warning and the module-decl
    // catch-all emitted the chain verbatim. Verified: this shape lowers with zero
    // warnings to VStack / Column(Modifier.background(...).padding(...)).
    snippet: `import { rocketstyle } from '@pyreon/rocketstyle'
import { Stack, Text } from '@pyreon/primitives'
const Btn = rocketstyle()({ name: 'Btn', component: Stack })
  .theme(() => ({ backgroundColor: '#6b7280', padding: 8 }))
export function C() { return (<Btn><Text>hi</Text></Btn>) }`,
  },
  {
    name: '@pyreon/elements',
    mechanism: 'pmtc-lowers',
    rationale: 'the Element flex primitive lowers to native stacks (its own Text is not a native primitive).',
    snippet: `import { Element } from '@pyreon/elements'
import { Text } from '@pyreon/primitives'
export function C() { return (<Element gap={2}><Text>a</Text><Text>b</Text></Element>) }`,
  },
  {
    name: '@pyreon/attrs',
    mechanism: 'pmtc-lowers',
    rationale: 'attrs(Component)(defaults) HOC lowers via the wrapped native component.',
    // Same class as rocketstyle above: `attrs(Element)({…})` skips the options object
    // the runtime takes (`attrs({ name, component })`), so the walk bailed at a
    // CallExpression callee and never reached its own bare-form warning. Verified:
    // this shape lowers to VStack(spacing:) / Arrangement.spacedBy.
    snippet: `import { attrs } from '@pyreon/attrs'
import { Stack, Text } from '@pyreon/primitives'
const Box = attrs({ name: 'Box', component: Stack }).attrs({ gap: 2 })
export function C() { return (<Box><Text>hi</Text></Box>) }`,
  },
  {
    name: '@pyreon/coolgrid',
    mechanism: 'pmtc-lowers',
    rationale: 'Container/Row/Col grid lowers to native stack layouts.',
    snippet: `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/primitives'
export function C() { return (<Container><Row><Col><Text>a</Text></Col></Row></Container>) }`,
  },
  {
    name: '@pyreon/ui-core',
    mechanism: 'pmtc-lowers',
    rationale: 'the PyreonUI theme provider lowers transparently around a native tree.',
    snippet: `import { PyreonUI } from '@pyreon/ui-core'
import { Stack, Text } from '@pyreon/primitives'
export function C() { return (<PyreonUI><Stack><Text>a</Text></Stack></PyreonUI>) }`,
  },
  {
    name: '@pyreon/router',
    mechanism: 'pmtc-lowers',
    rationale:
      'RouterLink/navigation lower onto the native router runtimes (@pyreon/native-router-{swift,kotlin}).',
    snippet: `import { RouterLink } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
export function C() { return (<Stack><RouterLink to="/about"><Text>About</Text></RouterLink></Stack>) }`,
  },
  {
    name: '@pyreon/validate',
    mechanism: 'pmtc-lowers',
    rationale:
      'the schema-authoring surface (s.object/s.string/…) lowers to a native Codable struct with parse/safeParse.',
    snippet: `import { s } from '@pyreon/validate'
import { Stack, Text } from '@pyreon/primitives'
const Signup = s.object({ name: s.string(), age: s.number() })
export function C() { return (<Stack><Text>ok</Text></Stack>) }`,
  },

  // ── native-container: ships a co-located native runtime (pyreon.native) ──
  {
    name: '@pyreon/store',
    mechanism: 'native-container',
    rationale: 'defineStore(id, () => {…}) lowers to a native @Observable singleton over PyreonStore runtime.',
    requiresCoSource: true,
    snippet: `import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
const useCounter = defineStore('counter', () => {
  const count = signal(0)
  return { count }
})
export function C() {
  return (<Stack><Text>{useCounter().store.count()}</Text><Button onPress={() => useCounter().store.count.set(useCounter().store.count() + 1)}>inc</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/state-tree',
    mechanism: 'native-container',
    rationale: 'model(id, shape) lowers to a native observable model over the state-tree runtime.',
    requiresCoSource: true,
    // `model('user', {…})` is a phantom API — there is no two-argument overload on
    // web either; every real overload takes a single `{ state }` / `{ schema }`
    // config and the chain must end in `.create()`. This one is module-scope by
    // design (the mirror of the three above).
    snippet: `import { model } from '@pyreon/state-tree'
import { Stack, Text } from '@pyreon/primitives'
const user = model({ state: { name: 'Ada', age: 36 } }).create()
export function C() { return (<Stack><Text>{user.name()}</Text></Stack>) }`,
  },
  {
    name: '@pyreon/machine',
    mechanism: 'native-container',
    rationale: 'createMachine(config) lowers to a native state machine over the machine runtime.',
    requiresCoSource: true,
    // createMachine lowers only INSIDE a component body (it emits `remember {}` /
    // an @State) — the recognizer lives in the component-body statement walk and
    // is structurally unreachable at module scope, where the catch-all printed it
    // verbatim with no warning. The old snippet also mis-nested the second state
    // (`on: { off: … }` instead of `on: { on: … }`), so that transition would have
    // vanished even once scoped right.
    snippet: `import { createMachine } from '@pyreon/machine'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const toggle = createMachine({
    initial: 'off',
    states: { off: { on: { TOGGLE: 'on' } }, on: { on: { TOGGLE: 'off' } } },
  })
  return (<Stack><Text>{toggle()}</Text><Button onPress={() => toggle.send('TOGGLE')}>t</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/i18n',
    mechanism: 'native-container',
    rationale: 'createI18n({ locale, messages }) lowers to a native PyreonI18n container with baked dictionaries.',
    requiresCoSource: true,
    // Same scope rule as machine: the API in the old snippet was correct, only its
    // placement was wrong.
    snippet: `import { createI18n } from '@pyreon/i18n'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hello' }, de: { hello: 'Hallo' } } })
  return (<Stack><Text>{i18n.t('hello')}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/query',
    mechanism: 'native-container',
    rationale: 'useQuery<T>(() => ({ queryKey, queryFn, staleTime })) lowers to a native PyreonQuery over the query runtime.',
    requiresCoSource: true,
    snippet: `import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface Todo { id: number; title: string }
export function C() {
  const q = useQuery<Todo>(() => ({ queryKey: ['todo', 1], queryFn: () => fetch('https://api.example.com/todos/1').then((r) => r.json()), staleTime: 60000 }))
  return (<Stack><Text>{q.data}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/form',
    mechanism: 'native-container',
    rationale: 'useForm({ initialValues }) lowers to a native form controller over the form runtime.',
    requiresCoSource: true,
    snippet: `import { useForm } from '@pyreon/form'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const form = useForm({ initialValues: { name: '' } })
  return (<Stack><Text>{form.values().name}</Text><Button onPress={() => form.submit()}>save</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/storage',
    mechanism: 'native-container',
    rationale: 'useStorage(key, default) lowers to native persistence over the storage backends runtime.',
    requiresCoSource: true,
    snippet: `import { useStorage } from '@pyreon/storage'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const theme = useStorage('theme', 'light')
  return (<Stack><Text>{theme()}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/sync',
    mechanism: 'native-container',
    rationale: 'syncedSignal({ key, initial }) lowers to a native CRDT-backed signal over the sync runtime.',
    requiresCoSource: true,
    // The old snippet omitted `doc`, which is invalid on the WEB too — syncedSignal
    // destructures it and calls `doc.getMap(...)`, so it would throw on undefined.
    // A phantom call form, not a native limitation.
    snippet: `import { syncedSignal, PyreonCrdtDoc } from '@pyreon/sync'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C() {
  const doc = new PyreonCrdtDoc('peer-1')
  const count = syncedSignal({ doc, key: 'count', initial: 0 })
  return (<Stack><Text>{count()}</Text><Button onPress={() => count.set(count() + 1)}>inc</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/hooks',
    mechanism: 'native-container',
    rationale:
      'the device/data hooks (useFetch/useAuth/useCamera/…) lower onto ~30 co-located native service runtimes.',
    requiresCoSource: true,
    snippet: `import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
interface Todo { id: number }
export function C() {
  const req = useFetch<Todo>('https://api.example.com/todos/1')
  return (<Stack><Text>{req.data}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/permissions',
    mechanism: 'native-container',
    rationale: 'usePermissions(grants) lowers to a native PyreonPermissions container over the permissions runtime.',
    requiresCoSource: true,
    snippet: `import { usePermissions } from '@pyreon/permissions'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const perms = usePermissions(['posts.read'])
  return (<Stack><Text>{perms.can('posts.read')}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/table',
    mechanism: 'native-container',
    rationale:
      'ships the PyreonTable native runtime; the useTable() authoring lowering is a documented open refinement.',
    requiresCoSource: true,
    // Its manifest has declared a nativeFrontend for `createTableState` all
    // along; the registry just never carried a snippet, so the gate could not
    // see it and the package read as native-runtime-only. Verified: zero
    // warnings on both targets, emits PyreonTableState<Row>, compiles on real
    // swiftc and kotlinc. `useTable` (the TanStack row model) is still web.
    snippet: `import { createTableState } from '@pyreon/table'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
interface Row { id: string; name: string }
export function C() {
  const rows = signal<Row[]>([{ id: '1', name: 'Ada' }])
  const table = createTableState({
    data: () => rows(),
    columns: [{ id: 'name', accessor: (r: Row) => r.name }],
    pageSize: 10,
  })
  return (<Stack><Text>{String(table.pageCount())}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/toast',
    mechanism: 'native-container',
    rationale:
      'ships the PyreonToast native runtime; the useToast() authoring lowering is a documented open refinement.',
    requiresCoSource: true,
    // Verified: lowers to `PyreonToast.shared.add(...)` / `PyreonToast.add(...)`.
    snippet: `import { toast } from '@pyreon/toast'
import { Stack, Button } from '@pyreon/primitives'
export function C() {
  return (<Stack><Button onPress={() => toast('saved')}>go</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/a11y',
    mechanism: 'native-container',
    rationale:
      'ships the native accessibility runtime; component-level helpers (VisuallyHidden) do not lower — a11y crosses via native accessibility modifiers.',
    requiresCoSource: true,
    // Verified: lowers to `PyreonA11y.announce(...)` on both targets.
    snippet: `import { announce } from '@pyreon/a11y'
import { Stack, Button } from '@pyreon/primitives'
export function C() {
  return (<Stack><Button onPress={() => announce('saved')}>go</Button></Stack>)
}`,
  },
  {
    name: '@pyreon/sized-map',
    mechanism: 'native-container',
    rationale: 'ships a co-located native bounded-map runtime used by the data packages.',
    requiresCoSource: true,
    // Verified: lowers to `PyreonSizedMap<..>(maxEntries:)`. The option is `maxEntries`; a `maxSize` typo warns by name rather than silently emitting.
    snippet: `import { SizedMap } from '@pyreon/sized-map'
import { Stack, Text } from '@pyreon/primitives'
const cache = new SizedMap<string, number>({ maxEntries: 10 })
export function C() { return (<Stack><Text>{cache.size}</Text></Stack>) }`,
  },

  // ── web-first: rich widget / web-coupled API, native-frontend arc OPEN ──
  // ── partial: `web-only` TIER, but the manifest declares a nativeFrontend ──
  // These are NOT gaps. Each package's own manifest names a SUBSET that lowers,
  // and the snippet below exercises exactly that documented form and is asserted
  // to emit ZERO warnings. They were filed `web-first` on the strength of
  // snippets that imported symbols the packages DO NOT EXPORT
  // (`createHttpClient`, `object`/`string`/`number`) — fictional code that warns
  // for the wrong reason and reads as a proven gap. The import check above is
  // what makes that unrepeatable.
  {
    name: '@pyreon/http',
    mechanism: 'partial',
    rationale:
      'the CLIENT (middleware, interceptors, streaming) stays web, but same-file endpoint calls DO lower: createHttp({ baseUrl }) + api.endpoint(…) resolve through useFetch/useQuery to native PyreonFetch/PyreonQuery. Verified zero-warning on both targets; literal params only.',
    snippet: `import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: number; name: string }
const api = createHttp({ baseUrl: 'https://api.example.com' })
const getUser = api.endpoint('GET /users/:id')
export function C() {
  const req = useFetch<User>(getUser({ params: { id: '1' } }))
  return (<Stack><Text>{req.data}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/validation',
    mechanism: 'partial',
    rationale:
      'the zod/valibot/arktype ADAPTERS stay web, but the declarative form DOES lower: a top-level zodSchema(z.object({…})) emits native field validators. Verified zero-warning on both targets; the runtime surface around it (inline .parse(), async validate) stays web.',
    snippet: `import { z } from 'zod'
import { zodSchema } from '@pyreon/validation'
import { Stack, Text } from '@pyreon/primitives'
const Signup = zodSchema(z.object({ name: z.string(), age: z.number() }))
export function C() { return (<Stack><Text>ok</Text></Stack>) }`,
  },
  {
    name: '@pyreon/url-state',
    mechanism: 'partial',
    rationale:
      "history entries, popstate and the pluggable serializers stay web, but useUrlState(key, 'default') with a STRING default DOES lower, bound to the native router's query. Verified zero-warning on both targets (a typed/number default still warns on this branch — #2943 widens that).",
    snippet: `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const q = useUrlState('q', 'all')
  return (<Stack><Text>{q()}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/feature',
    mechanism: 'partial',
    rationale:
      'CRUD composite. The RUNTIME half stays web — generated hooks (useList / useById / useCreate / useUpdate / useDelete / useSearch), the network fetcher and validator/form integration lower only when every dependency does. The DECLARATION half crosses today: the literal field-type map emits a Codable struct + a module-scope const with `name` and `initialValues` on both targets. A Zod / Valibot / ArkType schema is not introspected and warns by name.',
    snippet: `import { defineFeature } from '@pyreon/feature'
import { Stack, Text } from '@pyreon/primitives'
const Todo = defineFeature({
  name: 'todo',
  schema: { id: 'string', title: 'string', done: 'boolean' },
})
export function C() { return (<Stack><Text>ok</Text></Stack>) }`,
  },
  {
    name: '@pyreon/hotkeys',
    mechanism: 'partial',
    rationale:
      'the REGISTRY half (registerHotkey / scopes / conflict reporting) is web; the `useHotkey` authoring hook lowers to a SwiftUI `.keyboardShortcut` on a hidden Button and a Compose focused key handler. `mod` resolves per platform: Command on iOS, Ctrl on Android.',
    snippet: `import { useHotkey } from '@pyreon/hotkeys'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const n = signal(0)
  useHotkey('mod+s', () => { n.set(n() + 1) })
  return (<Stack><Text>{n()}</Text></Stack>)
}`,
  },
  // ── webview-host: the web ENGINE runs inside a native <WebView> ──────────
  // These four cannot be reimplemented as native views (ECharts is a canvas
  // engine, ProseMirror/CodeMirror are DOM editors, flow is an elk/SVG layout),
  // so they cross by HOSTING: `./webview` builds a self-contained page that runs
  // in WKWebView / Android WebView / an `<iframe srcdoc>` on web, with the
  // bidirectional bridge (`data` → `window.__pyreonData` + a `pyreondata`
  // event; `window.pyreonPostMessage` → `onMessage`).
  //
  // Evidence rung, stated per entry rather than implied — the host BRIDGE is
  // proven in real Chromium against the REAL engine (`src/webview.browser.test.tsx`),
  // and the native `<WebView>` host is emit + stub-typecheck proven (PMTC lowers
  // it on both targets; `examples/native-viz` emits 24 `PyreonWebView` calls,
  // 0 warnings). NO device test hosts a WebView on either platform — see the
  // `not device-proven` note each rationale carries.
  {
    name: '@pyreon/charts',
    mechanism: 'webview-host',
    rationale:
      'ECharts is a canvas engine with no native equivalent, so it crosses by HOSTING the same web chart in a native <WebView> (@pyreon/charts/webview). Bridge proven in real Chromium against real ECharts; native host is emit + stub-typecheck proven, NOT device-proven.',
    webviewHost: { hostHtmlExport: 'buildChartHostHtml', componentExport: 'ChartWebView' },
  },
  {
    name: '@pyreon/code',
    mechanism: 'webview-host',
    rationale:
      'CodeMirror 6 is a DOM editor with no native equivalent, so it crosses by HOSTING the same editor in a native <WebView> (@pyreon/code/webview). Bridge proven in real Chromium against real CodeMirror; native host is emit + stub-typecheck proven, NOT device-proven.',
    webviewHost: { hostHtmlExport: 'buildCodeHostHtml', componentExport: 'CodeWebView' },
  },
  {
    name: '@pyreon/flow',
    mechanism: 'webview-host',
    rationale:
      'the node-graph is an elk/SVG layout with no native equivalent, so it crosses by HOSTING the same diagram in a native <WebView> (@pyreon/flow/webview — self-contained, no CDN). Bridge + real SVG render proven in real Chromium; native host is emit + stub-typecheck proven, NOT device-proven.',
    webviewHost: { hostHtmlExport: 'buildFlowHostHtml', componentExport: 'FlowWebView' },
  },
  {
    name: '@pyreon/rich-text',
    mechanism: 'webview-host',
    rationale:
      'TipTap/ProseMirror is a DOM editor with no native equivalent, so it crosses by HOSTING the same WYSIWYG in a native <WebView> (@pyreon/rich-text/webview). Bridge proven in real Chromium against real TipTap; native host is emit + stub-typecheck proven, NOT device-proven.',
    webviewHost: { hostHtmlExport: 'buildRichTextHostHtml', componentExport: 'RichTextWebView' },
  },

  {
    name: '@pyreon/dnd',
    mechanism: 'partial',
    rationale:
      'the pdnd/DOM-shaped surface stays web (useDraggable / useDroppable are element-getter hooks, useDragMonitor is page-global, useFileDrop is an OS file picker — each still warns BY NAME). List REORDER is gesture-shaped rather than DOM-shaped, and it lowers: useSortable becomes a co-located PyreonSortableState engine on both targets. The full contract is required — items, a single-param `by`, and an arrow `onReorder`; a partial one warns naming the exact prop.',
    snippet: `import { useSortable } from '@pyreon/dnd'
import { Stack, Text } from '@pyreon/primitives'
interface Row { id: string; label: string }
export function C() {
  const items = signal<Row[]>([])
  const s = useSortable({
    items: () => items(),
    by: (item: Row) => item.id,
    onReorder: (next: Row[]) => items.set(next),
  })
  return (<Stack><Text>x</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/kinetic',
    mechanism: 'partial',
    rationale:
      'the CSS class/style engine is web; a `.preset()` chain lowers through the same <Transition> path the primitive uses, with a synthesized mount flag driving the enter. A preset-less chain degrades to a plain container and warns by name.',
    snippet: `import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div').preset('fade')
export function C() { return (<Stack><Box><Text>hi</Text></Box></Stack>) }`,
  },
]

/**
 * The warn-regression RATCHET — pmtc-lowers/native-container snippets that are
 * TEMPORARILY accepted as warning, each with a reason. It can only SHRINK.
 * Empty today: every such snippet is clean, so any warning is a real
 * regression to fix, not to absorb here.
 */
export const WARN_ALLOWLIST: Record<string, string> = {}

// ─────────────────────────────── pure logic ───────────────────────────────

export interface SnippetOutcome {
  name: string
  /** total warnings across both targets */
  warnings: number
  /** the warning strings (deduped), for the report */
  messages: string[]
  /**
   * `@pyreon/*` symbols the snippet imports that the package does NOT export.
   * Non-empty means the snippet is FICTIONAL and its warning count is
   * meaningless — see the header note on why that reads as a real gap.
   */
  unknownSymbols?: string[]
}

/**
 * The measured state of a `webview-host` entry's `./webview` contract. Every
 * field is an OBSERVATION (from package.json / the module source / the test
 * tree), so the verdict below is pure and unit-testable.
 */
export interface WebviewHostCheck {
  /** `package.json` `exports` declares a `./webview` subpath */
  exportDeclared: boolean
  /** the file that subpath resolves to exists on disk */
  moduleExists: boolean
  /** the module source exports the named host-page builder */
  hostHtmlExported: boolean
  /** the module source exports the named host component */
  componentExported: boolean
  /** at least one test file covers the webview module */
  testExists: boolean
  /** the test files found, for the report */
  testFiles: string[]
}

/**
 * Verify a `webview-host` entry against its measured contract. PURE.
 *
 * Returns the list of PROBLEMS — empty means the mechanism is really there.
 * Any non-empty result FAILS the gate: a `webview-host` entry claims a shipping
 * crossing path, so a missing export or a vanished subpath is a regression, not
 * a gap. (That asymmetry is the point — `web-first` is allowed to be absent;
 * `webview-host` is a claim that must hold.)
 */
export function webviewHostProblems(
  entry: RegistryEntry,
  check: WebviewHostCheck | undefined,
): string[] {
  const spec = entry.webviewHost
  if (!spec) return ['webview-host entry carries no webviewHost contract to verify']
  if (!check) return ['webview-host contract was never measured (package not found?)']

  const problems: string[] = []
  if (!check.exportDeclared) problems.push('package.json declares no "./webview" export')
  if (!check.moduleExists) problems.push('the "./webview" module does not exist on disk')
  if (!check.hostHtmlExported) {
    problems.push(`the webview module does not export \`${spec.hostHtmlExport}\` (the host-page builder)`)
  }
  if (!check.componentExported) {
    problems.push(`the webview module does not export \`${spec.componentExport}\` (the host component)`)
  }
  if (!check.testExists) problems.push('no test file covers the webview module')
  return problems
}

export interface EntryResult {
  name: string
  mechanism: Mechanism
  /** 'crosses' | 'gap' | 'regression' */
  status: 'crosses' | 'gap' | 'regression'
  /** human-readable detail for the report */
  detail: string
}

/**
 * Classify one registry entry given the (already computed) snippet outcome and
 * co-source presence. PURE — no fs, no transform — so it is unit-testable.
 *
 * @param snippet outcome of transforming entry.snippet (undefined if none)
 * @param coSourcePresent whether the co-source dirs exist + are non-empty
 *                   (undefined if the entry does not require co-source)
 * @param webviewHost measured `./webview` contract (undefined unless the entry
 *                   is `webview-host`)
 * @param nativeFrontend the `multiplatform.nativeFrontend` the package's OWN
 *                   manifest declares (undefined when it declares none) — the
 *                   evidence a `partial` entry is measured against
 */
export function classifyEntry(
  entry: RegistryEntry,
  snippet: SnippetOutcome | undefined,
  coSourcePresent: boolean | undefined,
  webviewHost?: WebviewHostCheck | undefined,
  nativeFrontend?: string | undefined,
): EntryResult {
  const base = { name: entry.name, mechanism: entry.mechanism }

  // A snippet naming a symbol its package does not export proves NOTHING —
  // it warns for the wrong reason. Fail before any mechanism is judged.
  if (snippet && snippet.unknownSymbols && snippet.unknownSymbols.length > 0) {
    return {
      ...base,
      status: 'regression',
      detail: `snippet imports symbols the package does not export: ${snippet.unknownSymbols.join(', ')} — the snippet proves nothing (transform never resolves imports, so an unknown symbol warns "no native lowering" and manufactures a phantom gap)`,
    }
  }

  if (entry.mechanism === 'partial') {
    const problems: string[] = []
    if (!nativeFrontend) {
      problems.push(
        "the package's manifest declares no `multiplatform.nativeFrontend` — a partial crossing must be declared there, not only here",
      )
    }
    if (!snippet) problems.push('no snippet exercising the documented native form')
    else if (snippet.warnings > 0 && !(entry.name in WARN_ALLOWLIST)) {
      problems.push(
        `the documented native form emits ${snippet.warnings} warning(s): ${snippet.messages[0] ?? ''}`,
      )
    }
    if (problems.length > 0) return { ...base, status: 'regression', detail: problems.join('; ') }
    return {
      ...base,
      status: 'crosses',
      detail: `PARTIAL — only the declared subset lowers: ${nativeFrontend}`,
    }
  }

  if (entry.mechanism === 'webview-host') {
    const problems = webviewHostProblems(entry, webviewHost)
    if (problems.length > 0) return { ...base, status: 'regression', detail: problems.join('; ') }
    return {
      ...base,
      status: 'crosses',
      detail: `hosts its web engine in a native <WebView> via ./webview (${WEBVIEW_HOST_CAVEATS})`,
    }
  }

  if (entry.mechanism === 'web-first') {
    // The `partial` branch above rejects an entry whose manifest declares no
    // `nativeFrontend`. This is the OTHER direction, and it is the one that
    // actually drifted: `@pyreon/dnd` shipped `useSortable` lowering to a
    // native reorder engine and declared the `nativeFrontend` to say so, while
    // this registry still called it `web-first` — so the gate under-reported a
    // package that had already crossed. Checking one direction only means the
    // list can always fall behind reality on the other.
    if (nativeFrontend) {
      return {
        ...base,
        status: 'regression',
        detail: `classified web-first, but the package's manifest declares a \`multiplatform.nativeFrontend\` (${nativeFrontend}) — a declared partial crossing must be registered as \`partial\`, with a snippet exercising it, or the gate under-reports`,
      }
    }
    // A web-first snippet is EXPECTED to warn; a drop to 0 is progress, not a
    // failure — surfaced as a gap with a reclassification hint.
    if (snippet && snippet.warnings === 0) {
      return {
        ...base,
        status: 'gap',
        detail: `web-first, but its snippet now transforms with ZERO warnings — consider reclassifying to pmtc-lowers.`,
      }
    }
    return { ...base, status: 'gap', detail: `web-first (arc open): ${entry.rationale}` }
  }

  // pmtc-lowers / native-container — these are supposed to CROSS.
  const problems: string[] = []

  if (entry.requiresCoSource && coSourcePresent === false) {
    problems.push('co-source (pyreon.native) is missing or empty')
  }
  if (snippet && snippet.warnings > 0 && !(entry.name in WARN_ALLOWLIST)) {
    problems.push(`snippet emits ${snippet.warnings} warning(s): ${snippet.messages[0] ?? ''}`)
  }

  if (problems.length > 0) {
    return { ...base, status: 'regression', detail: problems.join('; ') }
  }

  // A DECLARED frontend must be a PROVEN one. `@pyreon/table` had declared a
  // `nativeFrontend` for `createTableState` all along and its registry entry
  // carried no snippet, so the gate reported "native runtime ships" and the
  // package read as native-runtime-only for months. The reverse-direction check
  // added earlier only covers `web-first`, so a `native-container` entry could
  // still drift this way — the same one-directional blind spot, one mechanism
  // over.
  if (nativeFrontend && !snippet) {
    return {
      ...base,
      status: 'regression',
      detail:
        `the manifest declares a \`multiplatform.nativeFrontend\` (${nativeFrontend.slice(0, 60)}…) ` +
        `but this entry has no snippet, so nothing proves it — add one exercising that form`,
    }
  }

  const how =
    entry.mechanism === 'pmtc-lowers'
      ? 'lowers clean through PMTC'
      : entry.requiresCoSource
        ? snippet
          ? 'native runtime ships + authoring lowers clean'
          : 'native runtime ships'
        : 'native runtime ships'
  const allowNote = entry.name in WARN_ALLOWLIST ? ` [allowlisted: ${WARN_ALLOWLIST[entry.name]}]` : ''
  return { ...base, status: 'crosses', detail: `${how}${allowNote}` }
}

export interface CoverageSummary {
  total: number
  crossing: number
  gaps: number
  regressions: number
  /** the web-first / allowlisted open items, `name — reason` */
  openGaps: string[]
  /** the regressions, `name — detail` */
  regressed: string[]
}

/** Aggregate classified results into the coverage summary. PURE. */
export function summarize(results: EntryResult[]): CoverageSummary {
  const crossing = results.filter((r) => r.status === 'crosses').length
  const regressions = results.filter((r) => r.status === 'regression')
  const gaps = results.filter((r) => r.status === 'gap')
  return {
    total: results.length,
    crossing,
    gaps: gaps.length,
    regressions: regressions.length,
    openGaps: gaps.map((r) => `${r.name} — ${r.detail}`),
    regressed: regressions.map((r) => `${r.name} — ${r.detail}`),
  }
}

/** Registry sanity — invariants checkable without fs/transform. PURE. */
export function validateRegistry(registry: RegistryEntry[]): string[] {
  const errs: string[] = []
  const seen = new Set<string>()
  for (const e of registry) {
    if (seen.has(e.name)) errs.push(`duplicate registry entry: ${e.name}`)
    seen.add(e.name)
    if (!e.rationale || e.rationale.length === 0) errs.push(`${e.name}: missing rationale`)
    if (e.mechanism === 'native-container' && !e.requiresCoSource) {
      errs.push(`${e.name}: native-container must set requiresCoSource`)
    }
    if (e.mechanism === 'web-first' && e.requiresCoSource) {
      errs.push(`${e.name}: web-first must not require co-source (it does not cross yet)`)
    }
    if (e.mechanism === 'pmtc-lowers' && !e.snippet) {
      errs.push(`${e.name}: pmtc-lowers must carry a snippet (the crossing proof)`)
    }
    if (e.mechanism === 'partial') {
      if (!e.snippet) {
        errs.push(`${e.name}: partial must carry a snippet exercising the documented native form`)
      }
      if (e.requiresCoSource) {
        errs.push(`${e.name}: partial is a lowering subset — it ships no native co-source`)
      }
    }
    if (e.mechanism === 'webview-host') {
      if (!e.webviewHost) {
        errs.push(`${e.name}: webview-host must carry a webviewHost contract (the crossing proof)`)
      } else {
        if (!e.webviewHost.hostHtmlExport) errs.push(`${e.name}: webviewHost needs a hostHtmlExport`)
        if (!e.webviewHost.componentExport) errs.push(`${e.name}: webviewHost needs a componentExport`)
      }
      if (e.requiresCoSource) {
        errs.push(`${e.name}: webview-host hosts a WEB bundle — it ships no native co-source`)
      }
    } else if (e.webviewHost) {
      errs.push(`${e.name}: only a webview-host entry may carry a webviewHost contract`)
    }
  }
  for (const name of Object.keys(WARN_ALLOWLIST)) {
    if (!seen.has(name)) errs.push(`WARN_ALLOWLIST names ${name}, which is not in the registry`)
  }
  return errs
}

// ─────────────────────────────── fs helpers ───────────────────────────────

interface PkgLoc {
  name: string
  dir: string
  native?: { swift?: string; kotlin?: string }
  /** the raw `exports` map, for the `./webview` subpath check */
  exports?: Record<string, unknown>
}

/** Map every published package name → its dir + pyreon.native field. */
function scanPackages(repoRoot: string): Map<string, PkgLoc> {
  const out = new Map<string, PkgLoc>()
  const pkgRoot = join(repoRoot, 'packages')
  for (const cat of readdirSync(pkgRoot)) {
    const catDir = join(pkgRoot, cat)
    let entries: string[]
    try {
      entries = readdirSync(catDir)
    } catch {
      continue
    }
    for (const pkg of entries) {
      const dir = join(catDir, pkg)
      const pj = join(dir, 'package.json')
      if (!existsSync(pj)) continue
      let m: {
        name?: string
        pyreon?: { native?: { swift?: string; kotlin?: string } }
        exports?: Record<string, unknown>
      }
      try {
        m = JSON.parse(readFileSync(pj, 'utf8'))
      } catch {
        continue
      }
      if (typeof m.name !== 'string') continue
      const loc: PkgLoc = { name: m.name, dir }
      if (m.pyreon?.native) loc.native = m.pyreon.native
      if (m.exports && typeof m.exports === 'object') loc.exports = m.exports
      out.set(m.name, loc)
    }
  }
  return out
}

/** A native dir exists and holds at least one source file (recursively). */
function dirHasSource(dir: string): boolean {
  if (!existsSync(dir)) return false
  let found = false
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      if (found) return
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift') || p.endsWith('.kt')) found = true
    }
  }
  walk(dir)
  return found
}

/**
 * MEASURE a package's `./webview` contract against what the registry claims.
 *
 * Deliberately reads the SOURCE the export points at (the `bun` condition, i.e.
 * `src/webview.ts`) rather than a built `lib/`: this gate runs in `validate-fast`
 * before any bootstrap, so keying on `lib/` would make the check a function of
 * whether someone had built recently rather than of the source — the documented
 * "a spawn-based test reads lib/" trap in reverse.
 */
function measureWebviewHost(
  loc: PkgLoc | undefined,
  spec: NonNullable<RegistryEntry['webviewHost']>,
): WebviewHostCheck | undefined {
  if (!loc) return undefined

  const sub = loc.exports?.['./webview'] as Record<string, string> | string | undefined
  const exportDeclared = sub !== undefined
  // Prefer the `bun` condition (source); fall back to any string target so a
  // future exports shape does not silently read as "not declared".
  const target =
    typeof sub === 'string'
      ? sub
      : (sub?.bun ?? sub?.import ?? sub?.default ?? sub?.types)

  let moduleExists = false
  let source = ''
  if (typeof target === 'string' && target.length > 0) {
    const file = join(loc.dir, target)
    try {
      source = readFileSync(file, 'utf8')
      moduleExists = true
    } catch {
      moduleExists = false
    }
  }

  const tests = findWebviewTests(join(loc.dir, 'src'))
  return {
    exportDeclared,
    moduleExists,
    hostHtmlExported: moduleExports(source, spec.hostHtmlExport),
    componentExported: moduleExports(source, spec.componentExport),
    testExists: tests.length > 0,
    testFiles: tests,
  }
}

/**
 * Does `source` export `name`? Matches the declaration forms this repo uses —
 * `export function X`, `export const X`, `export class X`, and the re-export
 * list `export { X }` / `export { Y as X }`. Word-boundary anchored, so
 * `buildChartHostHtmlOptions` never satisfies `buildChartHostHtml`.
 */
function moduleExports(source: string, name: string): boolean {
  if (source.length === 0 || name.length === 0) return false
  const n = name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  const decl = new RegExp(String.raw`^\s*export\s+(?:async\s+)?(?:function|const|let|var|class)\s+${n}\b`, 'm')
  if (decl.test(source)) return true
  // `export { a, b as X }` — scan each brace group for the exported NAME
  // (the half after `as`, or the bare identifier).
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of (m[1] ?? '').split(',')) {
      const seg = part.trim()
      if (seg.length === 0) continue
      const asIdx = seg.search(/\bas\b/)
      const exported = asIdx === -1 ? seg : seg.slice(asIdx + 2).trim()
      if (exported.replace(/^type\s+/, '').trim() === name) return true
    }
  }
  return false
}

/**
 * Every name a module EXPORTS, following `export … from` / `export *` through
 * relative re-exports. Static — no dynamic import, so a browser-only package
 * cannot blow the gate up by being imported in node.
 *
 * This exists because `transform(...)` NEVER RESOLVES IMPORTS: a snippet that
 * names a symbol the package does not export still "runs", and — since an
 * unknown symbol warns "has NO native lowering" — it produces a warning that
 * looks exactly like a genuine gap. Two entries shipped that way (`@pyreon/http`
 * importing `createHttpClient`, which does not exist — the real export is
 * `createHttp`; `@pyreon/validation` importing `object`/`string`/`number`, which
 * are `@pyreon/validate`'s builders). Both packages CROSS with their real API.
 * A registry that cannot tell a real gap from a typo manufactures phantom ones.
 */
function collectExportedNames(entryFile: string, seen = new Set<string>()): Set<string> {
  const names = new Set<string>()
  if (seen.has(entryFile)) return names
  seen.add(entryFile)

  let source: string
  try {
    source = readFileSync(entryFile, 'utf8')
  } catch {
    return names
  }

  // `export function X` / `export const X` / `export class X` / `export type X` …
  for (const m of source.matchAll(
    /^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    if (m[1]) names.add(m[1])
  }

  // `export { a, b as c }` (with or without a `from`) — the EXPORTED half.
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of (m[1] ?? '').split(',')) {
      const seg = part.trim()
      if (seg.length === 0) continue
      const asIdx = seg.search(/\bas\b/)
      const exported = (asIdx === -1 ? seg : seg.slice(asIdx + 2)).trim()
      const clean = exported.replace(/^type\s+/, '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(clean)) names.add(clean)
    }
  }

  // `export * from './x'` — recurse (the only form that hides names entirely).
  for (const m of source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const rel = m[1]
    if (!rel || !rel.startsWith('.')) continue
    const resolved = resolveRelativeModule(entryFile, rel)
    if (resolved) for (const n of collectExportedNames(resolved, seen)) names.add(n)
  }

  return names
}

/** Resolve a relative specifier against a file, trying the usual extensions. */
function resolveRelativeModule(fromFile: string, rel: string): string | undefined {
  const base = join(fromFile, '..', rel)
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(cand).isFile()) return cand
    } catch {
      /* keep trying */
    }
  }
  return undefined
}

/** The named imports a snippet pulls from each `@pyreon/*` package. */
/**
 * Symbols the snippet imported that reappear in the EMIT as a free-function
 * call — i.e. the emitter did not recognise them and reproduced the TypeScript
 * name verbatim into Swift/Kotlin, where no such function exists.
 *
 * This is the cheapest possible detector for the single most common way a
 * package silently fails to cross, and it needs NO toolchain, so it runs on
 * every `validate-fast` rather than only where swiftc lives. Every instance
 * found so far — `createMachine(...)`, `createI18n(...)`, `syncedSignal(...)`,
 * `model(...)`, `rocketstyle(...)`, `attrs(...)`, `RouterLink(...)` — produced
 * ZERO transform warnings, which is exactly why a warning-count gate was blind
 * to all of them.
 *
 * Two deliberate narrowings keep it free of false positives:
 *
 *   - `@pyreon/primitives` symbols are exempt. `Text` and `Button` are BOTH the
 *     TS import and the real SwiftUI type, so a correct emit contains `Text(`.
 *   - Only FREE calls count. A member call is how a correct lowering usually
 *     looks (`toast('x')` → `PyreonToast.shared.add(...)`, `announce('x')` →
 *     `PyreonA11y.announce(...)`), so `.announce(` must not trip it.
 */
export function verbatimSymbolsIn(
  emitted: string,
  imports: ReadonlyMap<string, string[]>,
): string[] {
  const hits: string[] = []
  for (const [pkg, names] of imports) {
    if (pkg === '@pyreon/primitives') continue
    for (const name of names) {
      // (^|non-member, non-word) NAME ( — a free call, never `.NAME(`.
      const re = new RegExp(`(^|[^.\\w])${name}\\s*\\(`, 'm')
      if (re.test(emitted) && !hits.includes(name)) hits.push(name)
    }
  }
  return hits
}

export function pyreonImportsOf(snippet: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of snippet.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](@pyreon\/[^'"]+)['"]/g)) {
    const pkg = m[2]
    if (!pkg) continue
    const names: string[] = []
    for (const part of (m[1] ?? '').split(',')) {
      const seg = part.trim().replace(/^type\s+/, '')
      // `a as b` — the IMPORTED name is the half before `as`.
      const imported = seg.split(/\s+as\s+/)[0]?.trim() ?? ''
      if (/^[A-Za-z_$][\w$]*$/.test(imported)) names.push(imported)
    }
    out.set(pkg, [...(out.get(pkg) ?? []), ...names])
  }
  return out
}

/**
 * Names a snippet imports from a workspace `@pyreon/*` package that the package
 * does NOT export. PURE given the resolved export sets.
 *
 * Subpath imports (`@pyreon/x/sub`) and packages absent from the workspace are
 * SKIPPED rather than guessed at — a check that cannot see the truth must say
 * nothing, not fail honest code.
 */
export function unknownImportedSymbols(
  imports: Map<string, string[]>,
  exportsByPkg: Map<string, Set<string>>,
): string[] {
  const bad: string[] = []
  for (const [pkg, names] of imports) {
    const known = exportsByPkg.get(pkg)
    if (!known || known.size === 0) continue
    for (const n of names) if (!known.has(n)) bad.push(`${n} (not exported by ${pkg})`)
  }
  return bad
}

/** Every test file under `src` whose name mentions webview. */
function findWebviewTests(srcDir: string): string[] {
  const found: string[] = []
  const walk = (d: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e)
      let isDir = false
      try {
        isDir = statSync(p).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        walk(p)
      } else if (/webview/i.test(e) && /\.(test|spec)\.[cm]?[jt]sx?$/.test(e)) {
        found.push(p)
      }
    }
  }
  walk(srcDir)
  return found.sort()
}

/** Both co-source dirs (swift + kotlin) present + non-empty. */
/**
 * Is `name` a type the package's own native co-source DECLARES?
 *
 * Some symbols are deliberately spelled identically on all three platforms —
 * `PyreonCrdtDoc` is a TS class AND `public final class PyreonCrdtDoc` in Swift
 * AND `class PyreonCrdtDoc` in Kotlin — so seeing `PyreonCrdtDoc(...)` in the
 * emit is the lowering WORKING, not a passthrough.
 *
 * Checked against the shipped source rather than by a name convention (e.g.
 * "starts with Pyreon"): a convention would also wave through a genuinely
 * unlowered symbol that happens to be named that way, and this file has already
 * been wrong once today by matching a name instead of a declaration.
 */
function coSourceDeclares(loc: PkgLoc | undefined, name: string): boolean {
  if (!loc?.native) return false
  const re = new RegExp(`\\b(class|struct|object|enum|actor|protocol)\\s+${name}\\b`)
  for (const rel of [loc.native.swift, loc.native.kotlin]) {
    if (typeof rel !== 'string') continue
    const dir = join(loc.dir, rel)
    if (!existsSync(dir)) continue
    const stack = [dir]
    while (stack.length > 0) {
      const cur = stack.pop() as string
      for (const ent of readdirSync(cur, { withFileTypes: true })) {
        const full = join(cur, ent.name)
        if (ent.isDirectory()) stack.push(full)
        else if (/\.(swift|kt)$/.test(ent.name) && re.test(readFileSync(full, 'utf8'))) return true
      }
    }
  }
  return false
}

function coSourceOk(loc: PkgLoc | undefined): boolean {
  if (!loc || !loc.native) return false
  const { swift, kotlin } = loc.native
  const swiftOk = typeof swift === 'string' && dirHasSource(join(loc.dir, swift))
  const kotlinOk = typeof kotlin === 'string' && dirHasSource(join(loc.dir, kotlin))
  return swiftOk && kotlinOk
}

// ───────────────────────────────── main ───────────────────────────────────

async function main(): Promise<number> {
  const json = process.argv.includes('--json')

  const regErrs = validateRegistry(REGISTRY)
  if (regErrs.length > 0) {
    for (const e of regErrs) console.error(`[check-native-coverage] registry error: ${e}`)
    return 1
  }

  // Dynamic import so the pure logic (imported by vitest) never eagerly loads
  // the compiler's parse/emit graph.
  const { transform } = await import('../packages/native/compiler/src/index')
  // Compiling is OPT-IN: swiftc is ~250ms and kotlinc ~2.5s per snippet, which
  // is fine in the native CI job and far too slow for validate-fast. The CI
  // job that already owns the toolchains sets PYREON_COVERAGE_COMPILE=1.
  const compileEnabled = process.env.PYREON_COVERAGE_COMPILE === '1'
  // REAL SwiftUI, not the minimal stubs. The stub validator is the right tool
  // inside the compiler's own suite, but it is a SUBSET of SwiftUI — it has no
  // `.background` View modifier, so every emit that sets a colour fails against
  // it. Control experiment: the known-good `styled(Stack)` tagged-template path
  // emits a byte-identical line and fails the stubs the same way, while both
  // typecheck against the real SDK. Using stubs here would have manufactured
  // false "does not compile" verdicts for correct emits — the subset-stub trap,
  // which is exactly the failure mode a coverage gate must not have.
  const { isSwiftcAvailable, validateSwiftWithStubs, isKotlincAvailable, validateKotlin } =
    compileEnabled
      ? await import('../packages/native/compiler/src/validate')
      : {
          isSwiftcAvailable: () => false,
          validateSwiftWithStubs: () => ({ ok: true }),
          isKotlincAvailable: () => false,
          validateKotlin: () => ({ ok: true }),
        }
  const canCompile = compileEnabled && isSwiftcAvailable()
  if (compileEnabled && !canCompile) {
    console.log('[check-native-coverage] PYREON_COVERAGE_COMPILE=1 but the SwiftUI SDK is unavailable (macOS only) — compile pass SKIPPED.')
  }
  // Kotlin compiles on any runner with a JDK, so unlike the Swift half it is
  // not macOS-gated. Announce a skip rather than passing silently — a compile
  // pass that quietly does not run is worse than none, because the green reads
  // as "the emit builds".
  const canCompileKotlin = compileEnabled && isKotlincAvailable()
  if (compileEnabled && !canCompileKotlin) {
    console.log('[check-native-coverage] PYREON_COVERAGE_COMPILE=1 but kotlinc is unavailable — Kotlin compile pass SKIPPED.')
  }
  const packages = scanPackages(REPO)

  // Completeness ratchet: every `shared`/`service-backend` package DEFINITIVELY
  // should cross, so each MUST appear in the registry — a new one cannot slip
  // past the finish-line checklist. (The `web-only`+partial set is curated: most
  // web-only packages are architecturally web-coupled and correctly excluded, so
  // we do not force all of them in.)
  const { findManifests } = await import('../packages/internals/manifest/src')
  const manifests = await findManifests(REPO)
  const registered = new Set(REGISTRY.map((e) => e.name))
  const missing: string[] = []
  /** package → its manifest's declared `multiplatform.nativeFrontend` */
  const nativeFrontendByPkg = new Map<string, string>()
  for (const m of manifests) {
    const mp = (m.manifest as { multiplatform?: { tier?: unknown; nativeFrontend?: unknown } })
      .multiplatform
    const tier = mp?.tier
    if (typeof mp?.nativeFrontend === 'string' && mp.nativeFrontend.length > 0) {
      nativeFrontendByPkg.set(m.manifest.name, mp.nativeFrontend)
    }
    if ((tier === 'shared' || tier === 'service-backend') && !registered.has(m.manifest.name)) {
      missing.push(`${m.manifest.name} (tier '${tier}')`)
    }
  }
  if (missing.length > 0) {
    console.error(
      `[check-native-coverage] these '${'shared'}'/'service-backend' packages MUST be in the ` +
        `registry (they definitively should cross) but are absent:`,
    )
    for (const n of missing) console.error(`  - ${n}`)
    console.error('Add each to REGISTRY with its crossing mechanism + a representative snippet.')
    return 1
  }

  const results: EntryResult[] = []
  const notices: string[] = []
  /** measured `./webview` contracts, so the report can SHOW the evidence */
  const webviewChecks = new Map<string, WebviewHostCheck>()

  for (const entry of REGISTRY) {
    // Run the snippet through both targets (if present).
    let outcome: SnippetOutcome | undefined
    if (entry.snippet) {
      const msgs: string[] = []
      let count = 0
      const verbatim: string[] = []
      const snippetImports = pyreonImportsOf(entry.snippet)
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(entry.snippet, { target })
        count += r.warnings.length
        for (const w of r.warnings) if (!msgs.includes(w)) msgs.push(w)
        // A verbatim TS symbol in the emit is a silent non-crossing: the
        // frontend declined without warning and the module-decl catch-all
        // printed the call. Counted as a warning so it flows through the
        // existing classification instead of needing a parallel status.
        for (const sym of verbatimSymbolsIn(r.code, snippetImports)) {
          if (verbatim.includes(sym)) continue
          // A symbol the package's own native source declares is a SHARED name,
          // not a passthrough — the emit naming it is the lowering working.
          if (coSourceDeclares(packages.get(entry.name), sym)) continue
          verbatim.push(sym)
          count += 1
          msgs.push(
            `${sym}() is reproduced VERBATIM in the ${target} emit — the frontend did not ` +
              `recognise this call shape and declined silently, so the emitted code names a ` +
              `function that exists on neither target.`,
          )
        }
      }
      // Verify the snippet is REAL before trusting its warning count.
      const imports = pyreonImportsOf(entry.snippet)
      const exportsByPkg = new Map<string, Set<string>>()
      for (const pkg of imports.keys()) {
        const loc = packages.get(pkg)
        if (loc) exportsByPkg.set(pkg, collectExportedNames(join(loc.dir, 'src', 'index.ts')))
      }
      outcome = {
        name: entry.name,
        warnings: count,
        messages: msgs,
        unknownSymbols: unknownImportedSymbols(imports, exportsByPkg),
      }
    }

    const coOk = entry.requiresCoSource ? coSourceOk(packages.get(entry.name)) : undefined
    const webview = entry.webviewHost
      ? measureWebviewHost(packages.get(entry.name), entry.webviewHost)
      : undefined
    if (webview) webviewChecks.set(entry.name, webview)
    const res = classifyEntry(
      entry,
      outcome,
      coOk,
      webview,
      nativeFrontendByPkg.get(entry.name),
    )
    // Compile the emitted Swift. A snippet can transform with ZERO warnings and
    // still not build — which is how seven packages shipped a verbatim TS
    // factory call into Swift unnoticed. Only run it for entries that HAVE a
    // snippet and are otherwise judged crossing; a package already failing on
    // warnings does not need a second verdict.
    // Compile the emitted Kotlin. Mirror of the Swift pass below, and it exists
    // for the same reason: warnings alone cannot tell a valid composable from an
    // invented one. Runs FIRST so a package broken on both targets reports the
    // Swift detail, which is the one with the real SDK behind it.
    if (canCompileKotlin && entry.snippet && res.status === 'crosses') {
      const kotlin = transform(entry.snippet, { target: 'kotlin' })
      const kv = validateKotlin(kotlin.code) as { ok: boolean; error?: string }
      const knownK = KNOWN_UNCOMPILABLE_KOTLIN.get(entry.name)
      if (!kv.ok && knownK === undefined) {
        res.status = 'regression'
        const firstK = String(kv.error ?? '')
          .split('\n')
          .find((l) => l.includes('error:'))
        res.detail = `emit does NOT compile on kotlinc: ${firstK?.replace(/^.*error: /, '').trim() ?? 'unknown error'}`
      } else if (kv.ok && knownK !== undefined) {
        res.status = 'regression'
        res.detail = `now COMPILES on kotlinc — remove it from KNOWN_UNCOMPILABLE_KOTLIN (recorded reason: ${knownK})`
      } else if (!kv.ok) {
        notices.push(`${entry.name}: known-uncompilable on kotlinc — ${knownK}`)
      }
    }
    if (canCompile && entry.snippet && res.status === 'crosses') {
      const swift = transform(entry.snippet, { target: 'swift' })
      const v = validateSwiftWithStubs(swift.code) as { ok: boolean; error?: string }
      const known = KNOWN_UNCOMPILABLE.get(entry.name)
      if (!v.ok && known === undefined) {
        // NOT in the ratchet: a package that used to compile has stopped, or a
        // new snippet never did. Either way this is the failure the gate exists
        // for, and adding it to the list instead of fixing it defeats the list.
        res.status = 'regression'
        const first = String(v.error ?? '')
          .split('\n')
          .find((l) => l.includes('error:'))
        res.detail = `emit does NOT compile on swiftc: ${first?.replace(/^.*error: /, '').trim() ?? 'unknown error'}`
      } else if (v.ok && known !== undefined) {
        // The ratchet may only shrink. A listed package that now compiles must
        // be REMOVED, or the list rots into a permanent excuse — the same way a
        // lint baseline does when counts are allowed to drift upward.
        res.status = 'regression'
        res.detail = `now COMPILES — remove it from KNOWN_UNCOMPILABLE (recorded reason: ${known})`
      } else if (!v.ok) {
        notices.push(`${entry.name}: known-uncompilable — ${known}`)
      }
    }

    results.push(res)

    if (res.mechanism === 'web-first' && outcome && outcome.warnings === 0) {
      notices.push(`${entry.name}: web-first snippet no longer warns — reclassify?`)
    }
  }

  const summary = summarize(results)

  if (json) {
    console.log(JSON.stringify({ summary, results }, null, 2))
    return summary.regressions > 0 ? 1 : 0
  }

  // Human report.
  console.log('check-native-coverage — app-runtime multiplatform finish line\n')
  const byMech = (m: Mechanism) => results.filter((r) => r.mechanism === m)
  const line = (r: EntryResult) => {
    const mark = r.status === 'crosses' ? '✓' : r.status === 'gap' ? '·' : '✗'
    return `  ${mark} ${r.name.padEnd(24)} ${r.detail}`
  }
  console.log('pmtc-lowers (authoring API lowers clean):')
  for (const r of byMech('pmtc-lowers')) console.log(line(r))
  console.log('\nnative-container (ships co-located native runtime):')
  for (const r of byMech('native-container')) console.log(line(r))
  const hosted = byMech('webview-host')
  if (hosted.length > 0) {
    console.log('\nwebview-host (the SAME web bundle inside a native <WebView>):')
    for (const r of hosted) {
      // Show the EVIDENCE, not just the verdict — the whole point of the
      // mechanism is that it is verified rather than asserted.
      const n = webviewChecks.get(r.name)?.testFiles.length ?? 0
      const evidence = r.status === 'crosses' ? `./webview verified · ${n} test file(s)` : r.detail
      console.log(`  ${r.status === 'crosses' ? '✓' : '✗'} ${r.name.padEnd(24)} ${evidence}`)
    }
    console.log(`  ⚠ ${WEBVIEW_HOST_CAVEATS}.`)
  }
  const partials = byMech('partial')
  if (partials.length > 0) {
    console.log('\npartial (web-only TIER, but a declared nativeFrontend subset DOES lower):')
    for (const r of partials) console.log(line(r))
  }
  console.log('\nweb-first (no nativeFrontend declared — the arc is genuinely open):')
  for (const r of byMech('web-first')) console.log(line(r))

  const hostedCrossing = hosted.filter((r) => r.status === 'crosses').length
  const partialCrossing = partials.filter((r) => r.status === 'crosses').length
  // A `native-container` package proves it ships a native runtime. Ten of them
  // ALSO carry a lowering snippet, so their authoring API is proven too. The
  // rest are co-source ONLY: the runtime ships, but writing the package's
  // primary API in SHARED source does not lower — `useToast()` / `useTable()`
  // reproduce verbatim and fail the native build (with a precise warning
  // saying so, which is the deliberate choice: a behavioural hook must not
  // silently degrade to a no-op the way a presentational container can).
  //
  // That distinction was disclosed per-entry and in this file's header, but NOT
  // in the summary line — which is the line that gets quoted. Two of three
  // mechanisms were qualified there and the largest one was not, so a reader
  // reasonably took the remainder as unqualified full crossings. Derived from
  // the registry rather than a hardcoded count, so adding a snippet to one of
  // them moves this number without anyone remembering to.
  const coSourceOnly = byMech('native-container').filter(
    (r) =>
      r.status === 'crosses' &&
      REGISTRY.find((e) => e.name === r.name)?.snippet === undefined,
  ).length
  const notes: string[] = []
  if (hostedCrossing > 0) notes.push(`${hostedCrossing} by WEBVIEW-HOSTING, not native rendering`)
  if (partialCrossing > 0) notes.push(`${partialCrossing} PARTIALLY, only their declared subset`)
  if (coSourceOnly > 0) {
    notes.push(
      `${coSourceOnly} by SHIPPING A NATIVE RUNTIME whose shared-TS authoring API does not lower`,
    )
  }
  const note = notes.length > 0 ? ` (${notes.join('; ')})` : ''
  console.log(
    `\n${summary.crossing}/${summary.total} app-runtime packages cross${note}; ${summary.gaps} open gap(s).`,
  )
  if (summary.openGaps.length > 0) {
    console.log('Open gaps:')
    for (const g of summary.openGaps) console.log(`  · ${g}`)
  }
  for (const n of notices) console.log(`NOTICE: ${n}`)

  if (summary.regressions > 0) {
    console.error(`\n✗ ${summary.regressions} REGRESSION(S) — a package that should cross does not:`)
    for (const r of summary.regressed) console.error(`  ✗ ${r}`)
    console.error(
      '\nFix the snippet/runtime, or (last resort) add a WARN_ALLOWLIST entry with a reason.',
    )
    return 1
  }
  console.log('\n✓ no regressions — every crossing package still crosses.')
  return 0
}

// Only run when invoked directly (not when imported by the unit test).
if (import.meta.main) {
  main().then((code) => process.exit(code))
}
