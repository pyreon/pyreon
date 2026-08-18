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
 *   - `web-first`       — a rich widget or web-coupled API whose native-frontend
 *                         arc is still OPEN. Tracked as a known gap, not a hard
 *                         failure. Where a canonical snippet exists it is
 *                         transformed and asserted to STILL warn, so the day it
 *                         lowers clean the gate prompts a reclassification (the
 *                         ratchet's forward direction).
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

export type Mechanism = 'pmtc-lowers' | 'native-container' | 'web-first' | 'webview-host'

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
    snippet: `import { styled } from '@pyreon/styler'
import { Text } from '@pyreon/primitives'
const Box = styled('div', { padding: 8, backgroundColor: 'red' })
export function C() { return (<Box><Text>hi</Text></Box>) }`,
  },
  {
    name: '@pyreon/rocketstyle',
    mechanism: 'pmtc-lowers',
    rationale: 'rocketstyle(Element).theme()/.attrs() dimensions lower to native styled components.',
    snippet: `import { rocketstyle } from '@pyreon/rocketstyle'
import { Element } from '@pyreon/elements'
const Btn = rocketstyle(Element).theme(() => ({ backgroundColor: 'blue' })).attrs({ tag: 'button' })
export function C() { return (<Btn>go</Btn>) }`,
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
    snippet: `import { attrs } from '@pyreon/attrs'
import { Element } from '@pyreon/elements'
import { Text } from '@pyreon/primitives'
const Box = attrs(Element)({ gap: 2 })
export function C() { return (<Box><Text>x</Text></Box>) }`,
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
    snippet: `import { model } from '@pyreon/state-tree'
import { Stack, Text } from '@pyreon/primitives'
const useUser = model('user', { name: 'Ada', age: 36 })
export function C() { return (<Stack><Text>{useUser().name()}</Text></Stack>) }`,
  },
  {
    name: '@pyreon/machine',
    mechanism: 'native-container',
    rationale: 'createMachine(config) lowers to a native state machine over the machine runtime.',
    requiresCoSource: true,
    snippet: `import { createMachine } from '@pyreon/machine'
import { Stack, Text, Button } from '@pyreon/primitives'
const useToggle = createMachine({ initial: 'off', states: { off: { on: { TOGGLE: 'on' } }, on: { off: { TOGGLE: 'off' } } } })
export function C() { return (<Stack><Text>{useToggle().state()}</Text><Button onPress={() => useToggle().send('TOGGLE')}>t</Button></Stack>) }`,
  },
  {
    name: '@pyreon/i18n',
    mechanism: 'native-container',
    rationale: 'createI18n({ locale, messages }) lowers to a native PyreonI18n container with baked dictionaries.',
    requiresCoSource: true,
    snippet: `import { createI18n } from '@pyreon/i18n'
import { Stack, Text } from '@pyreon/primitives'
const i18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hello' }, de: { hello: 'Hallo' } } })
export function C() { return (<Stack><Text>{i18n.t('hello')}</Text></Stack>) }`,
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
    snippet: `import { syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '@pyreon/primitives'
const count = syncedSignal({ key: 'count', initial: 0 })
export function C() { return (<Stack><Text>{count()}</Text></Stack>) }`,
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
  },
  {
    name: '@pyreon/toast',
    mechanism: 'native-container',
    rationale:
      'ships the PyreonToast native runtime; the useToast() authoring lowering is a documented open refinement.',
    requiresCoSource: true,
  },
  {
    name: '@pyreon/a11y',
    mechanism: 'native-container',
    rationale:
      'ships the native accessibility runtime; component-level helpers (VisuallyHidden) do not lower — a11y crosses via native accessibility modifiers.',
    requiresCoSource: true,
  },
  {
    name: '@pyreon/sized-map',
    mechanism: 'native-container',
    rationale: 'ships a co-located native bounded-map runtime used by the data packages.',
    requiresCoSource: true,
  },

  // ── web-first: rich widget / web-coupled API, native-frontend arc OPEN ──
  {
    name: '@pyreon/http',
    mechanism: 'web-first',
    rationale:
      'createHttpClient() wrapper does not lower yet; the underlying fetch() reuses hooks’ PyreonFetch runtime (arc open).',
    snippet: `import { createHttpClient } from '@pyreon/http'
import { Stack, Text } from '@pyreon/primitives'
const api = createHttpClient({ baseURL: 'https://api.example.com' })
export function C() { return (<Stack><Text>ok</Text></Stack>) }`,
  },
  {
    name: '@pyreon/validation',
    mechanism: 'web-first',
    rationale:
      'the Standard-Schema builders (object/string/number) do not lower; the sibling @pyreon/validate DOES (arc open).',
    snippet: `import { object, string, number } from '@pyreon/validation'
import { Stack, Text } from '@pyreon/primitives'
const schema = object({ name: string(), age: number() })
export function C() { return (<Stack><Text>ok</Text></Stack>) }`,
  },
  {
    name: '@pyreon/url-state',
    mechanism: 'web-first',
    rationale: 'useUrlState() is coupled to the URL/history web platform; only a string-default flat form lowers (arc open).',
    snippet: `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const [page] = useUrlState('page', 1)
  return (<Stack><Text>{page()}</Text></Stack>)
}`,
  },
  {
    name: '@pyreon/feature',
    mechanism: 'web-first',
    rationale: 'CRUD-feature composite (form + query + table) has no native emit yet — crosses once its parts do (arc open).',
    snippet: `import { defineFeature } from '@pyreon/feature'
import { Stack, Text } from '@pyreon/primitives'
export function C() { return (<Stack><Text>feature</Text></Stack>) }`,
  },
  {
    name: '@pyreon/hotkeys',
    mechanism: 'web-first',
    rationale: 'keyboard-shortcut binding has no native analogue on touch platforms (arc open).',
    snippet: `import { useHotkeys } from '@pyreon/hotkeys'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  useHotkeys('mod+s', () => {})
  return (<Stack><Text>hk</Text></Stack>)
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
    mechanism: 'web-first',
    rationale: 'pointer-driven drag-and-drop; native gesture frontend arc still open.',
  },
  {
    name: '@pyreon/kinetic',
    mechanism: 'web-first',
    rationale:
      'CSS-transition animation engine; the preset vocabulary partially crosses via <Transition name>, full frontend arc open.',
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
 */
export function classifyEntry(
  entry: RegistryEntry,
  snippet: SnippetOutcome | undefined,
  coSourcePresent: boolean | undefined,
  webviewHost?: WebviewHostCheck | undefined,
): EntryResult {
  const base = { name: entry.name, mechanism: entry.mechanism }

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
  for (const m of manifests) {
    const mp = (m.manifest as { multiplatform?: { tier?: unknown } }).multiplatform
    const tier = mp?.tier
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
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(entry.snippet, { target })
        count += r.warnings.length
        for (const w of r.warnings) if (!msgs.includes(w)) msgs.push(w)
      }
      outcome = { name: entry.name, warnings: count, messages: msgs }
    }

    const coOk = entry.requiresCoSource ? coSourceOk(packages.get(entry.name)) : undefined
    const webview = entry.webviewHost
      ? measureWebviewHost(packages.get(entry.name), entry.webviewHost)
      : undefined
    if (webview) webviewChecks.set(entry.name, webview)
    const res = classifyEntry(entry, outcome, coOk, webview)
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
  console.log('\nweb-first (native-frontend arc still open):')
  for (const r of byMech('web-first')) console.log(line(r))

  const hostedCrossing = hosted.filter((r) => r.status === 'crosses').length
  const hostedNote =
    hostedCrossing > 0 ? ` (${hostedCrossing} of them by WEBVIEW-HOSTING, not native rendering)` : ''
  console.log(
    `\n${summary.crossing}/${summary.total} app-runtime packages cross${hostedNote}; ${summary.gaps} open gap(s).`,
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
