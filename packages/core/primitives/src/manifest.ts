import { defineManifest } from '@pyreon/manifest'

/**
 * `@pyreon/primitives` — the canonical MULTIPLATFORM UI vocabulary. These
 * 15 primitives (+ `<WebView>` + the `<Web>`/`<NativeIOS>`/`<NativeAndroid>`
 * escape hatches) are the ONLY UI layer that compiles to web DOM + iOS
 * SwiftUI + Android Compose from one source via PMTC. This manifest is the
 * AI's primitive-API reference — pair it with `get_pattern({ name:
 * 'multiplatform' })` for the full build-one-shot guide. (For web-only rich
 * UI use `@pyreon/elements` / `@pyreon/ui-components` instead — those are
 * NOT multiplatform.)
 */
export default defineManifest({
  name: '@pyreon/primitives',
  title: 'Canonical Multiplatform Primitives',
  tagline:
    '15 cross-platform UI primitives that compile to DOM + SwiftUI + Compose from one .tsx: Stack, Inline, Layer, Scroll, Spacer (layout); Text, Heading, Image, Icon (content); Button, Press, Link (interaction); Field, Toggle, Modal (input). Plus <WebView> (host a web-only component natively, bidirectional bridge) and <Web>/<NativeIOS>/<NativeAndroid> escape hatches.',
  description:
    'The multiplatform UI vocabulary for Pyreon. ONE canonical name per concept (`<Stack>` not `<View>`/`<VStack>`/`<div>`; `onPress` everywhere, not `onClick` vs `action:`). Web renders real DOM via `@pyreon/runtime-dom`; on iOS/Android the PMTC compiler intercepts the JSX at build time and emits idiomatic SwiftUI / Compose (the import is a type-anchor on native). Tokens-first styling (`padding={4}`, `gap="md"`) resolves through the theme per target. No responsive props / animations in v1 — apps needing responsive web use `@pyreon/elements` directly. CRITICAL boundary for native: PMTC compiles your component SOURCE in a narrow declarative TS subset, NOT npm libraries — see `get_pattern({ name: "multiplatform" })` for the supported subset + the silent-failure cliff.',
  category: 'browser',
  features: [
    '15 canonical primitives compile to web DOM + iOS SwiftUI + Android Compose from one .tsx',
    'One canonical name + event per concept — `<Stack>` (not View/VStack/div), `onPress` everywhere',
    'Tokens-first styling (`padding={4}`, `gap="md"`) resolves through the theme per target',
    'PMTC compiles your component SOURCE in a narrow declarative TS subset — NOT npm libraries',
    '`<WebView>` hosts a web-only component (charts/flow/editor) natively with a bidirectional data bridge',
    '`<Web>` / `<NativeIOS>` / `<NativeAndroid>` escape hatches for genuinely per-platform UI',
    'No responsive props or animations in v1 — responsive web uses `@pyreon/elements` directly',
  ],
  longExample: `import { Stack, Inline, Text, Heading, Button, Field, Toggle } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'

type Todo = { id: number; title: string; done: boolean }  // type alias, NOT interface (PMTC drops interface on native)

export function App() {
  const todos = signal<Todo[]>([])
  const draft = signal('')
  const remaining = computed(() => todos().filter((t) => !t.done).length)

  return (
    <Stack gap="md" padding={4}>
      <Heading level={1}>Todos ({remaining()} left)</Heading>
      <Inline gap="sm">
        <Field value={draft()} onChangeText={(t) => draft.set(t)} />
        <Button onPress={() => { todos.set([...todos(), { id: todos().length, title: draft(), done: false }]); draft.set('') }}>
          Add
        </Button>
      </Inline>
      <For each={todos()} by={(t) => t.id}>
        {(t) => (
          <Inline gap="sm">
            <Toggle value={t.done} onChange={(v) => todos.set(todos().map((x) => x.id === t.id ? { ...x, done: v } : x))} />
            <Text>{t.title}</Text>
          </Inline>
        )}
      </For>
    </Stack>
  )
}`,
  api: [
    {
      name: 'Stack',
      kind: 'component',
      signature:
        "(props: { direction?: 'column' | 'row'; align?: Align; justify?: Justify; gap?: Space; wrap?: boolean; padding?: Space; children }) => VNode",
      summary:
        'Primary layout container. Web → `<div style="display:flex;flex-direction:column|row">`; iOS → `VStack`/`HStack`; Android → `Column`/`Row`. Default `direction="column"`. `gap`/`padding` are theme-space tokens (number index OR "sm"|"md"|"lg").',
      example: `<Stack gap="md" align="center"><Text>a</Text><Text>b</Text></Stack>`,
      mistakes: [
        'Using `<View>` / `<VStack>` / `<div>` — the canonical name is `<Stack>` (one name, all platforms)',
        'Expecting responsive props (breakpoint arrays) — not supported in v1; use @pyreon/elements for responsive web',
      ],
      seeAlso: ['Inline', 'Layer', 'Scroll'],
    },
    {
      name: 'Inline',
      kind: 'component',
      signature:
        '(props: { align?: Align; justify?: Justify; gap?: Space; wrap?: boolean; padding?: Space; children }) => VNode',
      summary:
        'Horizontal row — sugar for `<Stack direction="row">`. Web flex-row; iOS `HStack`; Android `Row`. ⚠ On Android `<Inline>` is a NON-WRAPPING `Row` (SwiftUI HStack shrinks to fit, but Compose Row overflows + clips the last children). Keep horizontal groups short, or use a vertical `<Stack>` for action lists.',
      example: `<Inline gap="sm"><Field value={q()} onChangeText={(t) => q.set(t)} /><Button onPress={search}>Go</Button></Inline>`,
      mistakes: [
        'Putting 5+ buttons in an <Inline> — they overflow + clip (become untappable) on Android; stack vertically or split',
        'Relying on `wrap` for native multi-line — wrapping behavior differs per target',
      ],
      seeAlso: ['Stack'],
    },
    {
      name: 'Layer',
      kind: 'component',
      signature: '(props: { align?: Align; padding?: Space; children }) => VNode',
      summary:
        'Stacked / overlay container. Web → `position:relative` + abs children; iOS → `ZStack`; Android → `Box`. Use for badges, overlays, layered composition.',
      example: `<Layer><Image src={hero} alt="" /><Text>overlaid caption</Text></Layer>`,
      mistakes: ['Using it for flow layout — Layer stacks children on the z-axis, not in a row/column'],
      seeAlso: ['Stack'],
    },
    {
      name: 'Scroll',
      kind: 'component',
      signature: "(props: { direction?: 'vertical' | 'horizontal'; padding?: Space; children }) => VNode",
      summary:
        'Scrollable region. Web → `overflow:auto`; iOS → `ScrollView`; Android → `Column(verticalScroll)` / `Row(horizontalScroll)`. ⚠ Do not put a weighted `<Spacer>` inside a Scroll on Android (weight inside a scroll is invalid Compose).',
      example: `<Scroll><Stack gap="md">{/* long content */}</Stack></Scroll>`,
      mistakes: ['Nesting a `<Spacer>` (weight) inside `<Scroll>` — invalid on Android Compose'],
      seeAlso: ['Stack'],
    },
    {
      name: 'Spacer',
      kind: 'component',
      signature: '() => VNode',
      summary:
        'Flexible gap that pushes siblings apart. Web → flex spacer; iOS → `Spacer`; Android → `Spacer(Modifier.weight(1f))`. Use in an `<Inline>`/`<Stack>` to right-align or space-between.',
      example: `<Inline><Text>left</Text><Spacer /><Text>right</Text></Inline>`,
      mistakes: ['Using it inside a `<Scroll>` on Android (weight + scroll conflict)'],
      seeAlso: ['Inline', 'Stack'],
    },
    {
      name: 'Text',
      kind: 'component',
      signature:
        "(props: { color?: ColorToken; size?: 'xs'|'sm'|'md'|'lg'|'xl'; weight?: 'regular'|'medium'|'bold'; truncate?: boolean; children }) => VNode",
      summary:
        'Inline text. Web `<span>`; iOS/Android `Text`. Read signals directly in children: `<Text>{count()}</Text>` (the compiler wraps it reactively). Avoid template literals on native — use string concat.',
      example: `<Text size="lg" weight="bold" color="primary">{label()}</Text>`,
      mistakes: [
        'Using a template literal `{`Count: ${n()}`}` — partial native support; prefer `{"Count: " + n()}`',
        'Wrapping in `String(...)` — unnecessary, numbers coerce in JSX text',
      ],
      seeAlso: ['Heading'],
    },
    {
      name: 'Heading',
      kind: 'component',
      signature: '(props: { level?: 1|2|3|4|5|6; color?: ColorToken; children }) => VNode',
      summary: 'Heading text. Web `<h1>`–`<h6>` by `level`; iOS/Android a sized/weighted `Text`.',
      example: `<Heading level={2}>Section</Heading>`,
      mistakes: ['Omitting `level` when document outline matters (web a11y)'],
      seeAlso: ['Text'],
    },
    {
      name: 'Image',
      kind: 'component',
      signature:
        "(props: { src: string; alt: string; fit?: 'cover'|'contain'|'fill'|'none'; width?: number|string; height?: number|string }) => VNode",
      summary:
        'Image. Web `<img>`; iOS `Image`; Android `AsyncImage` (Coil). `src` + `alt` REQUIRED. Bundled assets (via the asset pipeline) vs remote URLs dispatch per target.',
      example: `<Image src={logo} alt="Logo" width={120} height={40} fit="contain" />`,
      mistakes: ['Omitting `alt` (required — a11y + it is the native contentDescription)'],
      seeAlso: ['Icon'],
    },
    {
      name: 'Icon',
      kind: 'component',
      signature: "(props: { name: string; size?: 'sm'|'md'|'lg'; color?: ColorToken }) => VNode",
      summary:
        'Icon by canonical name. Web → svg; iOS → SF Symbol (`Image(systemName:)`); Android → Material `Icons.Filled.*`. The name maps through `ICON_MAP`; unmapped names warn + fall back.',
      example: `<Icon name="star" size="md" color="primary" />`,
      mistakes: ['Using a platform-specific icon id — use the canonical name; the compiler maps it per target'],
      seeAlso: ['Image'],
    },
    {
      name: 'Button',
      kind: 'component',
      signature:
        "(props: { onPress: () => void; disabled?: boolean; variant?: 'primary'|'secondary'|'ghost'|'danger'; children }) => VNode",
      summary:
        'Styled CTA. Web `<button>`; iOS/Android `Button`. Handler is `onPress` (NOT `onClick`). Multi-statement handlers work: `onPress={() => { a.set(1); b.set(2) }}`.',
      example: `<Button variant="primary" onPress={() => count.set(count() + 1)}>Increment</Button>`,
      mistakes: [
        'Using `onClick` — the canonical event is `onPress` (mapped to onClick/action:/onClick per target)',
        'Passing `onPress={maybeUndefined}` — guard it; a non-function handler is a footgun',
      ],
      seeAlso: ['Press', 'Link'],
    },
    {
      name: 'Press',
      kind: 'component',
      signature: '(props: { onPress: () => void; onLongPress?: () => void; disabled?: boolean; children }) => VNode',
      summary:
        'Unstyled tap target (no chrome). Web `<div role="button">`; iOS `Button {}` (plain); Android `Box(clickable)`. Use to make arbitrary content tappable; supports `onLongPress`.',
      example: `<Press onPress={() => select(item)}><Card item={item} /></Press>`,
      mistakes: ['Using `<Press>` for a primary action — use `<Button>` for styled CTAs'],
      seeAlso: ['Button'],
    },
    {
      name: 'Link',
      kind: 'component',
      signature: '(props: { to: string; external?: boolean; children }) => VNode',
      summary:
        'Navigation link. Web `<a>`; iOS/Android router-aware navigation. Integrates with `@pyreon/router` (`to` is a route path). `external` opens outside the app.',
      example: `<Link to="/profile">Profile</Link>`,
      mistakes: ['Hardcoding an href for internal routes — use `to` so it routes natively too'],
      seeAlso: ['Button'],
    },
    {
      name: 'Field',
      kind: 'component',
      signature:
        "(props: { value: string | (() => string); onChangeText: (next: string) => void; kind?: 'text'|'number'|'password'|'email'|'search'|'tel'|'url'; placeholder?: string; disabled?: boolean; onSubmit?: () => void }) => VNode",
      summary:
        'Text input. Web `<input>`; iOS/Android `TextField`. Handler is `onChangeText(next)` (NOT `onInput`/`onChange`). `value` accepts a signal accessor for two-way binding.',
      example: `<Field value={draft()} onChangeText={(t) => draft.set(t)} placeholder="Search…" onSubmit={search} />`,
      mistakes: [
        'Using `onChange`/`onInput` — the canonical handler is `onChangeText(next: string)`',
        'Forgetting `value` is the source of truth — write back via `onChangeText` → signal.set',
      ],
      seeAlso: ['Toggle'],
    },
    {
      name: 'Toggle',
      kind: 'component',
      signature: '(props: { value: boolean | (() => boolean); onChange: (next: boolean) => void; disabled?: boolean }) => VNode',
      summary: 'Boolean switch/checkbox. Web checkbox; iOS `Toggle`; Android `Switch`. `onChange(next: boolean)`.',
      example: `<Toggle value={enabled()} onChange={(v) => enabled.set(v)} />`,
      mistakes: ['Using `onPress`/`onClick` — Toggle uses `onChange(next: boolean)`'],
      seeAlso: ['Field'],
    },
    {
      name: 'Modal',
      kind: 'component',
      signature: '(props: { open: boolean | (() => boolean); onClose: () => void; children }) => VNode',
      summary:
        'Modal/sheet. Web overlay; iOS `.sheet(isPresented:)`; Android `Dialog(onDismissRequest)`. Drive `open` with a signal; `onClose` fires on dismiss.',
      example: `<Modal open={showSheet()} onClose={() => showSheet.set(false)}><Stack>{/* sheet body */}</Stack></Modal>`,
      mistakes: ['Forgetting `onClose` — needed so the platform dismiss gesture updates your signal'],
      seeAlso: ['Layer'],
    },
    {
      name: 'WebView',
      kind: 'component',
      signature:
        '(props: { html?: string; src?: string; data?: unknown; onMessage?: (message: string) => void }) => VNode',
      summary:
        'Host a web page/component natively (WKWebView on iOS, Android WebView; `<iframe srcdoc>` on web). THE escape hatch for web-only packages (charts/flow/code/document) on native — they run inside the WebView. Bidirectional bridge: `data` is pushed in as `window.__pyreonData` (+ a `pyreondata` event, live, no reload); the page calls `window.pyreonPostMessage(payload)` → your `onMessage` closure.',
      example: `<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />`,
      mistakes: [
        'Using it for core UI (nav/forms/lists) — pays WebView boot + bundle cost; use native primitives there. Reserve <WebView> for self-contained web-island panes (charts/editors/diagrams)',
        'Expecting native look-and-feel — content renders as a web view, not native widgets',
      ],
      seeAlso: ['Web'],
    },
    {
      name: 'Web / NativeIOS / NativeAndroid',
      kind: 'component',
      signature:
        'Web(props: { children }) => VNodeChild · NativeIOS(props: { children }) => VNodeChild · NativeAndroid(props: { children }) => VNodeChild',
      summary:
        "The Layer-4 per-platform escape hatch — one source carries a platform-specific subtree and exactly ONE branch renders per target. `<Web>` renders its children on WEB only (a layout-transparent Fragment, no wrapper element); `<NativeIOS>` / `<NativeAndroid>` render NOTHING on web (they return null — their children are emitted only on the iOS / Android target by PMTC). Reach for these for the rare genuinely-per-platform UI branch the 15 canonical primitives can't express (a web-only-rich chart/flow/table view vs a native equivalent or a `<WebView>` embed).",
      example: `<Web>{/* web-only-rich: <Chart>, <Flow>, <Table> */}</Web>
<NativeIOS>{/* Swift Charts, or a <WebView> embed */}</NativeIOS>
<NativeAndroid>{/* Compose chart, or a <WebView> embed */}</NativeAndroid>`,
      mistakes: [
        'Overusing them — defeats the one-source model; reach for them only when a target genuinely needs different UI.',
        'Putting web-visible content in `<NativeIOS>` / `<NativeAndroid>` — both render NOTHING on web (they are no-ops there); only `<Web>` content reaches the browser.',
      ],
      seeAlso: ['WebView', 'init / resetPrimitivesConfig'],
    },
    {
      name: 'init / resetPrimitivesConfig',
      kind: 'function',
      signature:
        'init(options: { navigate?: (to: string) => void }) => void · resetPrimitivesConfig() => void',
      summary:
        "One-time app-boot configuration for `@pyreon/primitives`. The package is deliberately router-AGNOSTIC (a consumer using only `<Stack>`/`<Text>` never pulls a router into their graph), so `<Link>` needs a navigation handler supplied ONCE via `init({ navigate })`. With it, `<Link>` intercepts plain left-clicks and routes via `navigate` (SPA — no full reload); WITHOUT it, `<Link>` is a plain `<a href>` that does a normal full-page navigation — so links always WORK, `init` only UPGRADES them to SPA. `init` merges with any previous config (later calls override the keys they set). `resetPrimitivesConfig()` clears it back to defaults (primarily for tests / teardown). The config is a module-level singleton and SSR-safe (the server renders a static `<a href>`; `navigate` is read only inside a client click handler).",
      example: `import { init } from '@pyreon/primitives'

// at app boot, wire your router's navigate so <Link> does SPA navigation:
init({ navigate: (to) => myRouter.push(to) })`,
      mistakes: [
        'Wondering why `<Link>` does a FULL PAGE RELOAD — you did not call `init({ navigate })`. Without a navigate handler, `<Link>` falls back to a plain `<a href>` full-load; call `init` once at app boot with your router push.',
        'Expecting it to import a router — it is router-AGNOSTIC by design (works with any router, or none); YOU supply the `navigate` closure so the package never depends on `@pyreon/router`.',
      ],
      seeAlso: ['Link', 'Web / NativeIOS / NativeAndroid'],
    },
  ],
})
