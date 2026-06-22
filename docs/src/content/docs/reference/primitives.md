---
title: "Canonical Multiplatform Primitives — API Reference"
description: "15 cross-platform UI primitives that compile to DOM + SwiftUI + Compose from one .tsx: Stack, Inline, Layer, Scroll, Spacer (layout); Text, Heading, Image, Icon"
---

# @pyreon/primitives — API Reference

> **Generated** from `primitives`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [primitives](/docs/primitives).

The multiplatform UI vocabulary for Pyreon. ONE canonical name per concept (`<Stack>` not `<View>`/`<VStack>`/`<div>`; `onPress` everywhere, not `onClick` vs `action:`). Web renders real DOM via `@pyreon/runtime-dom`; on iOS/Android the PMTC compiler intercepts the JSX at build time and emits idiomatic SwiftUI / Compose (the import is a type-anchor on native). Tokens-first styling (`padding={4}`, `gap="md"`) resolves through the theme per target. No responsive props / animations in v1 — apps needing responsive web use `@pyreon/elements` directly. CRITICAL boundary for native: PMTC compiles your component SOURCE in a narrow declarative TS subset, NOT npm libraries — see `get_pattern({ name: "multiplatform" })` for the supported subset + the silent-failure cliff.

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
| [`Icon`](#icon) | component | Icon by canonical name. |
| [`Button`](#button) | component | Styled CTA. |
| [`Press`](#press) | component | Unstyled tap target (no chrome). |
| [`Link`](#link) | component | Navigation link. |
| [`Field`](#field) | component | Text input. |
| [`Toggle`](#toggle) | component | Boolean switch/checkbox. |
| [`Modal`](#modal) | component | Modal/sheet. |
| [`WebView`](#webview) | component | Host a web page/component natively (WKWebView on iOS, Android WebView; `<iframe srcdoc>` on web). |
| [`Web`](#web) | component | Per-platform escape hatches. |

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
(props: { onPress: () => void; onLongPress?: () => void; disabled?: boolean; children }) => VNode
```

Unstyled tap target (no chrome). Web `<div role="button">`; iOS `Button {}` (plain); Android `Box(clickable)`. Use to make arbitrary content tappable; supports `onLongPress`.

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

**See also:** `Web`

---

### Web `component`

```ts
(props: { children }) => VNode  // + <NativeIOS> / <NativeAndroid>
```

Per-platform escape hatches. `<Web>` renders its children only on web; `<NativeIOS>` only on iOS; `<NativeAndroid>` only on Android. Use for the rare genuinely-per-platform UI branch that the canonical primitives can't express.

**Example**

```tsx
<NativeIOS><Text>iOS-only</Text></NativeIOS><Web><Text>web-only</Text></Web>
```

**Common mistakes**

- Overusing them — defeats "one source"; reach for them only when a target genuinely needs different UI

**See also:** `WebView`

---
