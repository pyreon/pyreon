---
title: "Canonical Multiplatform Primitives — API Reference"
description: "16 cross-platform UI primitives that compile to DOM + SwiftUI + Compose from one .tsx: Stack, Inline, Layer, Scroll, Spacer (layout); Text, Heading, Image, Icon"
---

# @pyreon/primitives — API Reference

> **Generated** from `primitives`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [primitives](/docs/primitives).

The multiplatform UI vocabulary for Pyreon. ONE canonical name per concept (`<Stack>` not `<View>`/`<VStack>`/`<div>`; `onPress` everywhere, not `onClick` vs `action:`). Web renders real DOM via `@pyreon/runtime-dom`; on iOS/Android the PMTC compiler intercepts the JSX at build time and emits idiomatic SwiftUI / Compose (the import is a type-anchor on native). Tokens-first styling (`padding={4}`, `gap="md"`) resolves through the theme per target. No responsive props / animations in v1 — apps needing responsive web use `@pyreon/elements` directly. CRITICAL boundary for native: PMTC compiles your component SOURCE in a narrow declarative TS subset, NOT npm libraries — see `get_pattern({ name: "multiplatform" })` for the supported subset + the silent-failure cliff.

## Features

- 15 canonical primitives compile to web DOM + iOS SwiftUI + Android Compose from one .tsx
- One canonical name + event per concept — `<Stack>` (not View/VStack/div), `onPress` everywhere
- Tokens-first styling (`padding={4}`, `gap="md"`) resolves through the theme per target
- PMTC compiles your component SOURCE in a narrow declarative TS subset — NOT npm libraries
- `<WebView>` hosts a web-only component (charts/flow/editor) natively with a bidirectional data bridge
- `<Transition>` / `<TransitionGroup>` — the animation vocabulary, lowered to SwiftUI `.transition(…)` and Compose `AnimatedVisibility` (import from HERE; `@pyreon/runtime-dom` is web-only)
- `<Web>` / `<NativeIOS>` / `<NativeAndroid>` escape hatches for genuinely per-platform UI
- `useNativeModule` FFI — add a platform capability the framework does not ship (Bluetooth, ARKit, a vendor SDK) as an app-level Swift/Kotlin class, no framework PR
- No responsive props or animations in v1 — responsive web uses `@pyreon/elements` directly

## Complete example

A full, end-to-end usage of the package:

```tsx
import { Stack, Inline, Text, Heading, Button, Field, Toggle } from '@pyreon/primitives'
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
}
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`Stack`](#stack) | component | Primary layout container. |
| [`Inline`](#inline) | component | Horizontal row — sugar for `<Stack direction="row">`. |
| [`Layer`](#layer) | component | Stacked / overlay container. |
| [`Scroll`](#scroll) | component | Scrollable region. |
| [`Spacer`](#spacer) | component | Flexible gap that pushes siblings apart. |
| [`Text`](#text) | component | Inline text. |
| [`Heading`](#heading) | component | Heading text. |
| [`Image`](#image) | component | Image. |
| [`Audio`](#audio) | component | Sound playback, and deliberately NON-VISUAL — the one place it does not mirror `<Video>`. |
| [`Video`](#video) | component | Video playback. |
| [`Icon`](#icon) | component | Icon by canonical name. |
| [`Button`](#button) | component | Styled CTA. |
| [`Press`](#press) | component | Unstyled tap target (no chrome). |
| [`Link`](#link) | component | Navigation link. |
| [`Field`](#field) | component | Text input. |
| [`Toggle`](#toggle) | component | Boolean switch/checkbox. |
| [`Modal`](#modal) | component | Modal/sheet. |
| [`Transition`](#transition) | component | The MULTIPLATFORM animation vocabulary — animate a subtree in and out of view. |
| [`TransitionGroup`](#transitiongroup) | component | A container that animates its own SIZE as rows enter and leave the keyed list inside it. |
| [`WebView`](#webview) | component | Host a web page/component natively (WKWebView on iOS, Android WebView; `<iframe srcdoc>` on web). |
| [`connectWebHost`](#connectwebhost) | function | The guest-side glue for the `<WebView>` bridge — the reusable OTHER half of the WebView-host pattern. |
| [`webHostDocument`](#webhostdocument) | function | Build the self-contained HTML page a `<WebView html={…}>` hosts — the document shell for the guest side of the WebView-h |
| [`Web / NativeIOS / NativeAndroid`](#web-nativeios-nativeandroid) | component | The Layer-4 per-platform escape hatch — one source carries a platform-specific subtree and exactly ONE branch renders pe |
| [`defineNativeModule / useNativeModule`](#definenativemodule-usenativemodule) | function | The Layer-4 FFI escape hatch — how an APP adds a platform capability the framework does not ship (Bluetooth, ARKit, a pa |
| [`init / resetPrimitivesConfig`](#init-resetprimitivesconfig) | function | One-time app-boot configuration for `@pyreon/primitives`. |

## API

### Stack `component`

```ts
(props: { direction?: 'column' | 'row'; align?: Align; justify?: Justify; gap?: Space; wrap?: boolean; padding?: Space; children }) => VNode
```

Primary layout container. Web → `<div style="display:flex;flex-direction:column|row">`; iOS → `VStack`/`HStack`; Android → `Column`/`Row`. Default `direction="column"`. `gap`/`padding` are theme-space tokens (number index OR "sm"|"md"|"lg").

**Example**

```tsx
<Stack gap="md" align="center"><Text>a</Text><Text>b</Text></Stack>
```

**Common mistakes**

- Using `<View>` / `<VStack>` / `<div>` — the canonical name is `<Stack>` (one name, all platforms)
- Expecting responsive props (breakpoint arrays) — not supported in v1; use @pyreon/elements for responsive web

**See also:** `Inline` · `Layer` · `Scroll`

---

### Inline `component`

```ts
(props: { align?: Align; justify?: Justify; gap?: Space; wrap?: boolean; padding?: Space; children }) => VNode
```

Horizontal row — sugar for `<Stack direction="row">`. Web flex-row; iOS `HStack`; Android `Row`. ⚠ On Android `<Inline>` is a NON-WRAPPING `Row` (SwiftUI HStack shrinks to fit, but Compose Row overflows + clips the last children). Keep horizontal groups short, or use a vertical `<Stack>` for action lists.

**Example**

```tsx
<Inline gap="sm"><Field value={q()} onChangeText={(t) => q.set(t)} /><Button onPress={search}>Go</Button></Inline>
```

**Common mistakes**

- Putting 5+ buttons in an &lt;Inline&gt; — they overflow + clip (become untappable) on Android; stack vertically or split
- Relying on `wrap` for native multi-line — wrapping behavior differs per target

**See also:** `Stack`

---

### Layer `component`

```ts
(props: { align?: Align; padding?: Space; children }) => VNode
```

Stacked / overlay container. Web → `position:relative` + abs children; iOS → `ZStack`; Android → `Box`. Use for badges, overlays, layered composition.

**Example**

```tsx
<Layer><Image src={hero} alt="" /><Text>overlaid caption</Text></Layer>
```

**Common mistakes**

- Using it for flow layout — Layer stacks children on the z-axis, not in a row/column

**See also:** `Stack`

---

### Scroll `component`

```ts
(props: { direction?: 'vertical' | 'horizontal'; padding?: Space; children }) => VNode
```

Scrollable region. Web → `overflow:auto`; iOS → `ScrollView`; Android → `Column(verticalScroll)` / `Row(horizontalScroll)`. ⚠ Do not put a weighted `<Spacer>` inside a Scroll on Android (weight inside a scroll is invalid Compose).

**Example**

```tsx
<Scroll><Stack gap="md">{/* long content */}</Stack></Scroll>
```

**Common mistakes**

- Nesting a `<Spacer>` (weight) inside `<Scroll>` — invalid on Android Compose

**See also:** `Stack`

---

### Spacer `component`

```ts
() => VNode
```

Flexible gap that pushes siblings apart. Web → flex spacer; iOS → `Spacer`; Android → `Spacer(Modifier.weight(1f))`. Use in an `<Inline>`/`<Stack>` to right-align or space-between.

**Example**

```tsx
<Inline><Text>left</Text><Spacer /><Text>right</Text></Inline>
```

**Common mistakes**

- Using it inside a `<Scroll>` on Android (weight + scroll conflict)

**See also:** `Inline` · `Stack`

---

### Text `component`

```ts
(props: { color?: ColorToken; size?: 'xs'|'sm'|'md'|'lg'|'xl'; weight?: 'regular'|'medium'|'bold'; truncate?: boolean; children }) => VNode
```

Inline text. Web `<span>`; iOS/Android `Text`. Read signals directly in children: `<Text>{count()}</Text>` (the compiler wraps it reactively). Avoid template literals on native — use string concat.

**Example**

```tsx
<Text size="lg" weight="bold" color="primary">{label()}</Text>
```

**Common mistakes**

- Using a template literal `{`Count: $&#123;n()&#125;`}` — partial native support; prefer `{"Count: " + n()}`
- Wrapping in `String(...)` — unnecessary, numbers coerce in JSX text

**See also:** `Heading`

---

### Heading `component`

```ts
(props: { level?: 1|2|3|4|5|6; color?: ColorToken; children }) => VNode
```

Heading text. Web `<h1>`–`<h6>` by `level`; iOS/Android a sized/weighted `Text`.

**Example**

```tsx
<Heading level={2}>Section</Heading>
```

**Common mistakes**

- Omitting `level` when document outline matters (web a11y)

**See also:** `Text`

---

### Image `component`

```ts
(props: { src: string; alt: string; fit?: 'cover'|'contain'|'fill'|'none'; width?: number|string; height?: number|string }) => VNode
```

Image. Web `<img>`; iOS `Image`; Android `AsyncImage` (Coil). `src` + `alt` REQUIRED. Bundled assets (via the asset pipeline) vs remote URLs dispatch per target.

**Example**

```tsx
<Image src={logo} alt="Logo" width={120} height={40} fit="contain" />
```

**Common mistakes**

- Omitting `alt` (required — a11y + it is the native contentDescription)

**See also:** `Icon`

---

### Audio `component`

```ts
(props: { src: string; autoPlay?: boolean; loop?: boolean; muted?: boolean; volume?: number; onStatusChange?: (status: 'waiting'|'playing'|'paused') => void }) => VNode
```

Sound playback, and deliberately NON-VISUAL — the one place it does not mirror `<Video>`. Audio has no view on the native targets (`AVAudioPlayer` / Media3 are objects, not views), so there is no `controls` prop: the web's browser-styled bar has no cross-platform counterpart, and a prop that silently no-ops on two of three targets is the failure this family refuses (see `useScreenOrientation`, which omits `lock()` for the same reason). Build a transport from Pyreon primitives and drive it with these props. `onStatusChange` uses the SAME three-value vocabulary as `<Video>` (`waiting`/`playing`/`paused`). `volume` is CLAMPED to 0..1 rather than rejected, on all three arms and at emit time, so the generated native source is honest about what will actually play. The native host is a concrete zero-size view rather than `EmptyView`, because a modifier on `EmptyView` is silently inert.

**Example**

```tsx
<Audio src="ping.mp3" autoPlay volume={0.4} onStatusChange={(s) => sound.set(s)} />
```

**Common mistakes**

- Looking for `controls` — it is deliberately absent; compose a transport from primitives instead
- Expecting unmuted autoplay on the web — browsers only permit MUTED autoplay; pair `autoPlay` with `muted`
- Passing a volume outside 0..1 and expecting a throw — it is clamped, on every target

**See also:** `Video`

---

### Video `component`

```ts
(props: { src: string; autoPlay?: boolean; loop?: boolean; muted?: boolean; controls?: boolean; width?: number|string; height?: number|string; onStatusChange?: (status: 'waiting'|'playing'|'paused') => void }) => VNode
```

Video playback. Web `<video playsinline>`; iOS AVKit `VideoPlayer` over `AVPlayer` (`PyreonVideoPlayer`); Android Media3 ExoPlayer in an `AndroidView`. `onStatusChange` surfaces the player state as ONE three-value vocabulary across all targets (`waiting`/`playing`/`paused`) — web media events, AVPlayer `timeControlStatus` KVO, ExoPlayer `Player.Listener`.

**Example**

```tsx
<Video src="https://cdn.example.com/intro.mp4" autoPlay muted loop onStatusChange={(s) => playState.set(s)} />
```

**Common mistakes**

- Expecting unmuted autoplay on the web — browsers only permit MUTED autoplay; pair `autoPlay` with `muted`
- Asserting rendered video FRAMES in tests — video draws on a surface layer neither XCUITest nor captureToImage can read; assert the onStatusChange-driven state instead

**See also:** `Image`

---

### Icon `component`

```ts
(props: { name: string; size?: 'sm'|'md'|'lg'; color?: ColorToken }) => VNode
```

Icon by canonical name. Web → svg; iOS → SF Symbol (`Image(systemName:)`); Android → Material `Icons.Filled.*`. The name maps through `ICON_MAP`; unmapped names warn + fall back.

**Example**

```tsx
<Icon name="star" size="md" color="primary" />
```

**Common mistakes**

- Using a platform-specific icon id — use the canonical name; the compiler maps it per target

**See also:** `Image`

---

### Button `component`

```ts
(props: { onPress: () => void; disabled?: boolean; variant?: 'primary'|'secondary'|'ghost'|'danger'; children }) => VNode
```

Styled CTA. Web `<button>`; iOS/Android `Button`. Handler is `onPress` (NOT `onClick`). Multi-statement handlers work: `onPress={() => { a.set(1); b.set(2) }}`.

**Example**

```tsx
<Button variant="primary" onPress={() => count.set(count() + 1)}>Increment</Button>
```

**Common mistakes**

- Using `onClick` — the canonical event is `onPress` (mapped to onClick/action:/onClick per target)
- Passing `onPress={maybeUndefined}` — guard it; a non-function handler is a footgun

**See also:** `Press` · `Link`

---

### Press `component`

```ts
(props: { onPress: () => void; onLongPress?: () => void; onSwipeLeft?: () => void; onSwipeRight?: () => void; disabled?: boolean; children }) => VNode
```

Unstyled tap target (no chrome). Web `<div role="button">`; iOS `Button {}` (plain); Android `Box(clickable)`. Use to make arbitrary content tappable; supports `onLongPress` and `onSwipeLeft`/`onSwipeRight` (horizontally-dominant ≥40px swipe — iOS high-priority DragGesture, Android direction-locked drag detector, web pointer-delta polyfill; taps still fire `onPress`).

**Example**

```tsx
<Press onPress={() => select(item)}><Card item={item} /></Press>
```

**Common mistakes**

- Using `<Press>` for a primary action — use `<Button>` for styled CTAs

**See also:** `Button`

---

### Link `component`

```ts
(props: { to: string; external?: boolean; children }) => VNode
```

Navigation link. Web `<a>`; iOS/Android router-aware navigation. Integrates with `@pyreon/router` (`to` is a route path). `external` opens outside the app.

**Example**

```tsx
<Link to="/profile">Profile</Link>
```

**Common mistakes**

- Hardcoding an href for internal routes — use `to` so it routes natively too

**See also:** `Button`

---

### Field `component`

```ts
(props: { value: string | (() => string); onChangeText: (next: string) => void; kind?: 'text'|'number'|'password'|'email'|'search'|'tel'|'url'; placeholder?: string; disabled?: boolean; onSubmit?: () => void }) => VNode
```

Text input. Web `<input>`; iOS/Android `TextField`. Handler is `onChangeText(next)` (NOT `onInput`/`onChange`). `value` accepts a signal accessor for two-way binding.

**Example**

```tsx
<Field value={draft()} onChangeText={(t) => draft.set(t)} placeholder="Search…" onSubmit={search} />
```

**Common mistakes**

- Using `onChange`/`onInput` — the canonical handler is `onChangeText(next: string)`
- Forgetting `value` is the source of truth — write back via `onChangeText` → signal.set

**See also:** `Toggle`

---

### Toggle `component`

```ts
(props: { value: boolean | (() => boolean); onChange: (next: boolean) => void; disabled?: boolean }) => VNode
```

Boolean switch/checkbox. Web checkbox; iOS `Toggle`; Android `Switch`. `onChange(next: boolean)`.

**Example**

```tsx
<Toggle value={enabled()} onChange={(v) => enabled.set(v)} />
```

**Common mistakes**

- Using `onPress`/`onClick` — Toggle uses `onChange(next: boolean)`

**See also:** `Field`

---

### Modal `component`

```ts
(props: { open: boolean | (() => boolean); onClose: () => void; children }) => VNode
```

Modal/sheet. Web overlay; iOS `.sheet(isPresented:)`; Android `Dialog(onDismissRequest)`. Drive `open` with a signal; `onClose` fires on dismiss.

**Example**

```tsx
<Modal open={showSheet()} onClose={() => showSheet.set(false)}><Stack>{/* sheet body */}</Stack></Modal>
```

**Common mistakes**

- Forgetting `onClose` — needed so the platform dismiss gesture updates your signal

**See also:** `Layer`

---

### Transition `component`

```ts
(props: { show: boolean | (() => boolean); name?: 'fade' | 'scale-in' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'; duration?: number; easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'; enterDuration?: number; leaveDuration?: number; enterEasing?: TransitionEasing; leaveEasing?: TransitionEasing; children }) => VNode
```

The MULTIPLATFORM animation vocabulary — animate a subtree in and out of view. Web renders a wrapper div driven by real CSS transitions; iOS emits `ZStack { if show { … .transition(…) } }.animation(…, value: show)`; Android emits `AnimatedVisibility(visible = show, enter =, exit =)`. `name` picks a preset every target translates natively (camelCase AND kebab-case both accepted — `slideUp` === `slide-up`), and direction is the direction of TRAVEL, so a slide-up rises INTO place from below. `duration`/`easing` are symmetric; `enterDuration`/`leaveDuration`/`enterEasing`/`leaveEasing` override one side and fall back to the symmetric value, which is how "quick in, slow out" is spelled. Import it from HERE, not from `@pyreon/runtime-dom` — that package is web-only and warns on native.

**Example**

```tsx
<Transition name="slide-up" show={isOpen()} enterDuration={200} leaveDuration={400}><Panel /></Transition>
```

**Common mistakes**

- Importing `Transition` from `@pyreon/runtime-dom` — it lowers fine, but the package is WEB-ONLY so PMTC warns; `@pyreon/primitives` is the import that resolves on all three targets
- Passing a non-literal `duration` (a signal read, a computed value) — the native emitters require a static number of milliseconds and warn + fall back to the default otherwise
- Expecting the children to UNMOUNT on web when `show` is false — the wrapper goes `display:none` and keeps them mounted, so an animation wrapper never gates content out of SSR (it also contributes no flex `gap` while hidden)
- Expecting an enter animation on the FIRST render — mounting with `show` already true paints at rest, matching `AnimatedVisibility(visible = true)` and SwiftUI `.animation(_:value:)`
- Reaching for a custom `name` — the preset set is closed on purpose; an unlisted name has no native translation and falls back to a fade

**See also:** `TransitionGroup`

---

### TransitionGroup `component`

```ts
(props: { children }) => VNode
```

A container that animates its own SIZE as rows enter and leave the keyed list inside it. Web measures the content with `ResizeObserver` and transitions the outer height; iOS emits `VStack { … }.animation(.default, value: <list>.count)`; Android emits `Column(modifier = Modifier.animateContentSize())`. Children-only by design — neither native emitter reads any other attribute, so a `duration`/`easing` prop here would be web-only decoration on a primitive whose whole purpose is parity. Wrap a `<For>` in it.

**Example**

```tsx
<TransitionGroup><For each={rows()} by={(r) => r.id}>{(r) => <Text>{r.label}</Text>}</For></TransitionGroup>
```

**Common mistakes**

- Expecting per-ROW enter/leave animation — this animates the CONTAINER; wrap an individual row in `<Transition>` for that
- Relying on it in a no-JS / server-rendered snapshot — the height is only ever driven from a measurement, so SSR output has no inline height and lays out at the content's natural size

**See also:** `Transition`

---

### WebView `component`

```ts
(props: { html?: string; src?: string; data?: unknown; onMessage?: (message: string) => void }) => VNode
```

Host a web page/component natively (WKWebView on iOS, Android WebView; `<iframe srcdoc>` on web). THE escape hatch for web-only packages (charts/flow/code/document) on native — they run inside the WebView. Bidirectional bridge: `data` is pushed in as `window.__pyreonData` (+ a `pyreondata` event, live, no reload); the page calls `window.pyreonPostMessage(payload)` → your `onMessage` closure.

**Example**

```tsx
<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />
```

**Common mistakes**

- Using it for core UI (nav/forms/lists) — pays WebView boot + bundle cost; use native primitives there. Reserve &lt;WebView&gt; for self-contained web-island panes (charts/editors/diagrams)
- Expecting native look-and-feel — content renders as a web view, not native widgets

**See also:** `Web` · `connectWebHost`

---

### connectWebHost `function`

```ts
connectWebHost<T>() => { data(): T | undefined; onData(cb: (data: T | undefined) => void): () => void; emit(message: string): void }
```

The guest-side glue for the `<WebView>` bridge — the reusable OTHER half of the WebView-host pattern. A web-only-rich component (chart/flow/editor) built as a self-contained bundle runs `connectWebHost()` INSIDE the hosted page (an `<iframe srcdoc>` on web, a WKWebView on iOS, an Android WebView) to read host-pushed props (`data()` / `onData(cb)` fires on every `pyreondata` push) and send events back (`emit(msg)` → the host `onMessage`). Same code on every platform, so a webview-hosted panel is truly 1:1. Guest-only: every method is an inert no-op off-browser, so importing it can never crash a build.

**Example**

```tsx
const host = connectWebHost<{ rows: number[] }>()
host.onData((d) => renderChart(root, d?.rows ?? []))
bar.onclick = () => host.emit(String(bar.dataset.id))
```

**Common mistakes**

- Hand-rolling `window.__pyreonData` / `window.pyreonPostMessage` in the bundle instead of this helper — the two ends can silently drift and the panel stops updating.
- Calling it in the HOST component (the one rendering `<WebView>`) — it runs in the GUEST bundle inside the WebView, not the host.

**See also:** `WebView` · `webHostDocument` · `Web / NativeIOS / NativeAndroid`

---

### webHostDocument `function`

```ts
webHostDocument(options: { script: string; css?: string; rootId?: string; title?: string }) => string
```

Build the self-contained HTML page a `<WebView html={…}>` hosts — the document shell for the guest side of the WebView-host pattern. Pairs with `connectWebHost`: bundle a web-only component to an IIFE that calls `connectWebHost()`, wrap it with `webHostDocument({ script })`, pass the result as `<WebView html={…}>`. Everything is INLINED (no external `<script>`/`<link>`) so the same page works as `<iframe srcdoc>` on web and `loadHTMLString` on a WKWebView / Android WebView — truly 1:1, no network, no CSP surprises.

**Example**

```tsx
const html = webHostDocument({ script: BUNDLED_CHART_IIFE, css: chartCss })
// <WebView html={html} data={metrics()} onMessage={(m) => selected.set(m)} />
```

**Common mistakes**

- Passing a module (import/export) as `script` — the guest page runs it as a plain inline `<script>`; build to a self-contained IIFE first.
- Referencing an external asset (CDN font, remote image) — a WKWebView `loadHTMLString` page has no base URL; inline everything (data: URIs, `css`).

**See also:** `connectWebHost` · `WebView`

---

### Web / NativeIOS / NativeAndroid `component`

```ts
Web(props: { children }) => VNodeChild · NativeIOS(props: { children }) => VNodeChild · NativeAndroid(props: { children }) => VNodeChild
```

The Layer-4 per-platform escape hatch — one source carries a platform-specific subtree and exactly ONE branch renders per target. `<Web>` renders its children on WEB only (a layout-transparent Fragment, no wrapper element); `<NativeIOS>` / `<NativeAndroid>` render NOTHING on web (they return null — their children are emitted only on the iOS / Android target by PMTC). Reach for these for the rare genuinely-per-platform UI branch the 15 canonical primitives can't express (a web-only-rich chart/flow/table view vs a native equivalent or a `<WebView>` embed).

**Example**

```tsx
<Web>{/* web-only-rich: <Chart>, <Flow>, <Table> */}</Web>
<NativeIOS>{/* Swift Charts, or a <WebView> embed */}</NativeIOS>
<NativeAndroid>{/* Compose chart, or a <WebView> embed */}</NativeAndroid>
```

**Common mistakes**

- Overusing them — defeats the one-source model; reach for them only when a target genuinely needs different UI.
- Putting web-visible content in `<NativeIOS>` / `<NativeAndroid>` — both render NOTHING on web (they are no-ops there); only `<Web>` content reaches the browser.

**See also:** `WebView` · `init / resetPrimitivesConfig` · `defineNativeModule / useNativeModule`

---

### defineNativeModule / useNativeModule `function`

```ts
defineNativeModule<T>(name: string, webImpl: T) => T · useNativeModule<T>(name: string) => T · hasNativeModule(name: string) => boolean
```

The Layer-4 FFI escape hatch — how an APP adds a platform capability the framework does not ship (Bluetooth, ARKit, a payments/analytics SDK). PMTC lowers `useNativeModule('X')` to an instance of a class YOU provide (`X()` on iOS, `X(context)` on Android) and passes member calls through verbatim, so the platform compiler type-checks the surface; on web the same call resolves the `defineNativeModule` registration, keeping one source running on all three targets. `await mod.method()` composes with the async lowering with no extra machinery. This is distinct from `<NativeIOS>`/`<NativeAndroid>`, which only BRANCH between canonical-primitive subtrees — they cannot host raw platform code.

**Example**

```tsx
type Bluetooth = { connect(id: string): Promise<boolean> }

// web implementation (native targets never run this)
defineNativeModule<Bluetooth>('Bluetooth', { connect: async () => false })

function Pairing() {
  const bt = useNativeModule<Bluetooth>('Bluetooth')
  return <Button onPress={() => { void bt.connect('cuff') }}>Connect</Button>
}
```

**Common mistakes**

- Passing a non-literal module name (`useNativeModule(NAME)`) — it is emitted verbatim as the native class name and PMTC resolves one file at a time, so only a STRING LITERAL at the call site works; anything else warns and the declaration is skipped on native.
- Forgetting `defineNativeModule` — native targets compile the call away, so a missing registration only surfaces on WEB, where `useNativeModule` throws.
- Giving the Android class a no-arg constructor — the Compose emit injects `LocalContext.current`, so it must take a SINGLE `Context` parameter (ignore it if unused); iOS is the opposite (no-argument initialiser).
- Declaring the Kotlin class in a different package from the generated sources — the emit references it UNQUALIFIED, so it must live in the `--kotlin-package` package.
- Expecting reactive re-render for free — mark the Swift class `@Observable` / back Kotlin state with `mutableStateOf` if its state should drive the view.
- Writing a method-bearing `type`/`interface` and expecting a struct — a method-only contract type is intentionally not lowered to a native struct (its methods live on the platform class); a MIXED data+method type emits the data fields and warns about the dropped methods.

**See also:** `Web / NativeIOS / NativeAndroid` · `WebView`

---

### init / resetPrimitivesConfig `function`

```ts
init(options: { navigate?: (to: string) => void }) => void · resetPrimitivesConfig() => void
```

One-time app-boot configuration for `@pyreon/primitives`. The package is deliberately router-AGNOSTIC (a consumer using only `<Stack>`/`<Text>` never pulls a router into their graph), so `<Link>` needs a navigation handler supplied ONCE via `init({ navigate })`. With it, `<Link>` intercepts plain left-clicks and routes via `navigate` (SPA — no full reload); WITHOUT it, `<Link>` is a plain `<a href>` that does a normal full-page navigation — so links always WORK, `init` only UPGRADES them to SPA. `init` merges with any previous config (later calls override the keys they set). `resetPrimitivesConfig()` clears it back to defaults (primarily for tests / teardown). The config is a module-level singleton and SSR-safe (the server renders a static `<a href>`; `navigate` is read only inside a client click handler).

**Example**

```tsx
import { init } from '@pyreon/primitives'

// at app boot, wire your router's navigate so <Link> does SPA navigation:
init({ navigate: (to) => myRouter.push(to) })
```

**Common mistakes**

- Wondering why `<Link>` does a FULL PAGE RELOAD — you did not call `init({ navigate })`. Without a navigate handler, `<Link>` falls back to a plain `<a href>` full-load; call `init` once at app boot with your router push.
- Expecting it to import a router — it is router-AGNOSTIC by design (works with any router, or none); YOU supply the `navigate` closure so the package never depends on `@pyreon/router`.

**See also:** `Link` · `Web / NativeIOS / NativeAndroid`

---
