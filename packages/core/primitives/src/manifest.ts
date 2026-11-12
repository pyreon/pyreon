import { defineManifest } from '@pyreon/manifest'

/**
 * `@pyreon/primitives` — the canonical MULTIPLATFORM UI vocabulary. These
 * 22 canonical primitives (+ `<Transition>`/`<TransitionGroup>`, `<WebView>`
 * and the `<Web>`/`<NativeIOS>`/`<NativeAndroid>` escape hatches) are the
 * ONLY UI layer that compiles to web DOM + iOS
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
    '22 canonical cross-platform UI primitives that compile to DOM + SwiftUI + Compose from one .tsx: Stack, Inline, Layer, Scroll, Spacer (layout); Text, Heading, Image, Audio, Video, Icon (content); Button, Press, Link, Gesture (interaction); Canvas + CanvasRect/CanvasCircle/CanvasLine/CanvasPath/CanvasText (drawing); Field, Toggle, Select, Modal (input); Tabs (+ Tab entries), Split (navigation). Plus <Transition>/<TransitionGroup> (animation), <WebView> (host a web-only component natively, bidirectional bridge) and <Web>/<NativeIOS>/<NativeAndroid> escape hatches.',
  description:
    'The multiplatform UI vocabulary for Pyreon. ONE canonical name per concept (`<Stack>` not `<View>`/`<VStack>`/`<div>`; `onPress` everywhere, not `onClick` vs `action:`). Web renders real DOM via `@pyreon/runtime-dom`; on iOS/Android the PMTC compiler intercepts the JSX at build time and emits idiomatic SwiftUI / Compose (the import is a type-anchor on native). Tokens-first styling (`padding={4}`, `gap="md"`) resolves through the theme per target. No responsive props in v1 — apps needing responsive web use `@pyreon/elements` directly; animation is `<Transition>` / `<TransitionGroup>`. CRITICAL boundary for native: PMTC compiles your component SOURCE in a narrow declarative TS subset, NOT npm libraries — see `get_pattern({ name: "multiplatform" })` for the supported subset + the silent-failure cliff.',
  category: 'browser',
  multiplatform: {
    tier: 'shared',
    rationale:
      "the 22 canonical primitives: real web DOM runtime AND SwiftUI/Compose emit — the compiler's native target vocabulary",
  },
  features: [
    'Native compiler tooling: primitivesPlugin from @pyreon/primitives/native-plugin owns hook recognition and Swift/Kotlin lowering; the native CLI discovers it through pyreon.native.plugin, and direct compiler callers install it explicitly',
    '22 canonical primitives compile to web DOM + iOS SwiftUI + Android Compose from one .tsx',
    '`<Tabs>`/`<Tab>` — a tab bar that keeps every visited tab mounted (TabView on iOS, BottomNavigation/NavigationRail by window width on Android, a WAI-ARIA tablist bottom bar / side rail on the web); `<Split>` — a list/detail layout that collapses to one pane on a narrow window',
    'One canonical name + event per concept — `<Stack>` (not View/VStack/div), `onPress` everywhere',
    'Tokens-first styling (`padding={4}`, `gap="md"`) resolves through the theme per target',
    'PMTC compiles your component SOURCE in a narrow declarative TS subset — NOT npm libraries',
    '`<WebView>` hosts a web-only component (flow/editor) natively with a bidirectional data bridge',
    '`<Transition>` / `<TransitionGroup>` — the animation vocabulary, lowered to SwiftUI `.transition(…)` and Compose `AnimatedVisibility` (import from HERE; `@pyreon/runtime-dom` is web-only)',
    '`<Web>` / `<NativeIOS>` / `<NativeAndroid>` escape hatches for genuinely per-platform UI',
    '`useNativeModule` FFI — add a platform capability the framework does not ship (Bluetooth, ARKit, a vendor SDK) as an app-level Swift/Kotlin class, no framework PR',
    '`<Gesture onPan onPinch onRotate>` — continuous gestures (cumulative values + start/change/end phase) lowered to simultaneous SwiftUI Drag/Magnify/RotateGesture and one Compose pointer loop; drive content with the `translateX`/`translateY`/`scale`/`rotate` props every primitive accepts',
    '`<Canvas>` + shape children (`CanvasRect`, `CanvasCircle`, `CanvasLine`, `CanvasPath` with SVG path data, `CanvasText`) — vector drawing lowered to stacked `<svg>` layers on web, SwiftUI `Path`s on iOS and Compose draw layers on Android',
    'No responsive props in v1 — responsive web uses `@pyreon/elements` directly',
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
        'Primary layout container. Web → `<div style="display:flex;flex-direction:column|row">`; iOS → `VStack`/`HStack`; Android → `Column`/`Row`. Default `direction="column"`. Without `align`, children start at the cross-axis start on every target (web flex `stretch`, iOS `VStack(alignment: .leading)` / `HStack(alignment: .top)`, Android Column/Row Start/Top), so rows and unequal columns line up the same way everywhere. `gap`/`padding` are theme-space tokens (number index OR "sm"|"md"|"lg").',
      example: `<Stack gap="md" align="center"><Text>a</Text><Text>b</Text></Stack>`,
      mistakes: [
        'Using `<View>` / `<VStack>` / `<div>` — the canonical name is `<Stack>` (one name, all platforms)',
        'Expecting responsive props (breakpoint arrays) — not supported in v1; use @pyreon/elements for responsive web',
        'Relying on `justify` or `wrap` natively — both are IGNORED on iOS and Android (the compiler warns); use `<Spacer />` between children to distribute them',
      ],
      seeAlso: ['Inline', 'Layer', 'Scroll'],
    },
    {
      name: 'Inline',
      kind: 'component',
      signature:
        '(props: { align?: Align; justify?: Justify; gap?: Space; wrap?: boolean; padding?: Space; children }) => VNode',
      summary:
        'Horizontal row — sugar for `<Stack direction="row">`. Web flex-row; iOS `HStack(alignment: .top)` unless `align` is set; Android `Row`. ⚠ On Android `<Inline>` is a NON-WRAPPING `Row` (SwiftUI HStack shrinks to fit, but Compose Row overflows + clips the last children). Keep horizontal groups short, or use a vertical `<Stack>` for action lists.',
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
        'Stacked / overlay container. Web → `position:relative` single-cell grid (`align` → `place-items`); iOS → `ZStack`; Android → `Box`. Native children overlap automatically; on web, ordinary children flow into separate grid rows, so give the front child `position:absolute` to overlap. Use for badges, overlays, layered composition.',
      example: `<Layer><Image src={hero} alt="" /><Text>overlaid caption</Text></Layer>`,
      mistakes: [
        'Using it for flow layout — Layer stacks children on the z-axis, not in a row/column',
      ],
      seeAlso: ['Stack'],
    },
    {
      name: 'Scroll',
      kind: 'component',
      signature:
        "(props: { axis?: 'vertical' | 'horizontal'; padding?: Space; children }) => VNode",
      summary:
        'Scrollable region, vertical unless `axis="horizontal"`. Web → `overflow-y:auto` (or `overflow-x`); iOS → `ScrollView` with its content in a leading-aligned stack pinned to the leading edge (a top-aligned row when horizontal), as on the web and Android; Android → `Column(verticalScroll)` / `Row(horizontalScroll)`. ⚠ Do not put a weighted `<Spacer>` inside a Scroll on Android (weight inside a scroll is invalid Compose).',
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
      name: 'Audio',
      kind: 'component',
      signature:
        "(props: { src: string; autoPlay?: boolean; loop?: boolean; muted?: boolean; volume?: number; onStatusChange?: (status: 'waiting'|'playing'|'paused') => void }) => VNode",
      summary:
        "Sound playback, and deliberately NON-VISUAL — the one place it does not mirror `<Video>`. Audio has no view on the native targets (`AVAudioPlayer` / Media3 are objects, not views), so there is no `controls` prop: the web's browser-styled bar has no cross-platform counterpart, and a prop that silently no-ops on two of three targets is the failure this family refuses (see `useScreenOrientation`, which omits `lock()` for the same reason). Build a transport from Pyreon primitives and drive it with these props. `onStatusChange` uses the SAME three-value vocabulary as `<Video>` (`waiting`/`playing`/`paused`). `volume` is CLAMPED to 0..1 rather than rejected, on all three arms and at emit time, so the generated native source is honest about what will actually play. The native host is a concrete zero-size view rather than `EmptyView`, because a modifier on `EmptyView` is silently inert.",
      example: `<Audio src="ping.mp3" autoPlay volume={0.4} onStatusChange={(s) => sound.set(s)} />`,
      mistakes: [
        'Looking for `controls` — it is deliberately absent; compose a transport from primitives instead',
        'Expecting unmuted autoplay on the web — browsers only permit MUTED autoplay; pair `autoPlay` with `muted`',
        'Passing a volume outside 0..1 and expecting a throw — it is clamped, on every target',
      ],
      seeAlso: ['Video'],
    },
    {
      name: 'Video',
      kind: 'component',
      signature:
        "(props: { src: string; autoPlay?: boolean; loop?: boolean; muted?: boolean; controls?: boolean; width?: number|string; height?: number|string; onStatusChange?: (status: 'waiting'|'playing'|'paused') => void }) => VNode",
      summary:
        'Video playback. Web `<video playsinline>`; iOS AVKit `VideoPlayer` over `AVPlayer` (`PyreonVideoPlayer`); Android Media3 ExoPlayer in an `AndroidView`. `onStatusChange` surfaces the player state as ONE three-value vocabulary across all targets (`waiting`/`playing`/`paused`) — web media events, AVPlayer `timeControlStatus` KVO, ExoPlayer `Player.Listener`.',
      example: `<Video src="https://cdn.example.com/intro.mp4" autoPlay muted loop onStatusChange={(s) => playState.set(s)} />`,
      mistakes: [
        'Expecting unmuted autoplay on the web — browsers only permit MUTED autoplay; pair `autoPlay` with `muted`',
        'Asserting rendered video FRAMES in tests — video draws on a surface layer neither XCUITest nor captureToImage can read; assert the onStatusChange-driven state instead',
      ],
      seeAlso: ['Image'],
    },
    {
      name: 'Icon',
      kind: 'component',
      signature: "(props: { name: string; size?: 'sm'|'md'|'lg'; color?: ColorToken }) => VNode",
      summary:
        'Icon by canonical name. Web → svg; iOS → SF Symbol (`Image(systemName:)`); Android → Material `Icons.Filled.*`. The name maps through `ICON_MAP`; unmapped names warn + fall back.',
      example: `<Icon name="star" size="md" color="primary" />`,
      mistakes: [
        'Using a platform-specific icon id — use the canonical name; the compiler maps it per target',
      ],
      seeAlso: ['Image'],
    },
    {
      name: 'Button',
      kind: 'component',
      signature:
        "(props: { onPress: () => void; disabled?: boolean; variant?: 'primary'|'secondary'|'ghost'|'danger'; children }) => VNode",
      summary:
        'Styled CTA. Web `<button>` (filled blue by default); iOS `Button` with `.buttonStyle(.borderedProminent)` by default (`secondary` `.bordered`, `ghost` `.borderless`, `danger` red `.borderedProminent`); Android Material `Button` (`OutlinedButton` / `TextButton` for secondary / ghost). An inline `style` that sets a background or border replaces the default chrome, as it does on the web. Handler is `onPress` (NOT `onClick`). Multi-statement handlers work: `onPress={() => { a.set(1); b.set(2) }}`.',
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
      signature:
        '(props: { onPress: () => void; onLongPress?: () => void; onSwipeLeft?: () => void; onSwipeRight?: () => void; disabled?: boolean; children }) => VNode',
      summary:
        'Unstyled tap target (no chrome). Web `<div role="button">`; iOS `Button {}` (plain); Android `Box(clickable)`. Use to make arbitrary content tappable; supports `onLongPress` and `onSwipeLeft`/`onSwipeRight` (horizontally-dominant ≥40px swipe — iOS high-priority DragGesture, Android direction-locked drag detector, web pointer-delta polyfill; taps still fire `onPress`).',
      example: `<Press onPress={() => select(item)}><Card item={item} /></Press>`,
      mistakes: ['Using `<Press>` for a primary action — use `<Button>` for styled CTAs'],
      seeAlso: ['Button', 'Gesture'],
    },
    {
      name: 'Gesture',
      kind: 'component',
      signature:
        "(props: { onPan?: (e: { dx: number; dy: number; x: number; y: number; phase: 'start'|'change'|'end' }) => void; onPinch?: (e: { scale: number; centerX: number; centerY: number; phase }) => void; onRotate?: (e: { degrees: number; phase }) => void; children }) => VNode",
      summary:
        'A region that recognises CONTINUOUS gestures and reports their values. Every value is CUMULATIVE since the gesture began; each gesture delivers one `start`, any number of `change`, then one `end` (also on cancel). Pan, pinch and rotate run SIMULTANEOUSLY, and nothing is reported until the pointer passes the touch slop (10px/pt, the platform slop on Android), so a `<Press>` inside still gets its taps. Web: pointer events on a `touch-action: none` div (capture taken only once claimed); iOS: `PyreonGesture` (simultaneous `DragGesture`/`MagnifyGesture`/`RotateGesture`); Android: `PyreonGesture` (one `pointerInput` loop over `calculatePan`/`calculateZoom`/`calculateRotation`). Drive content with the transform props (`translateX`/`translateY`/`scale`/`rotate`), which every primitive accepts and which update in place. Known divergence: a two-finger pan follows the centroid on web/Android and the first finger on iOS.',
      example: `const zoom = signal(1.0)
const base = signal(1.0)
<Gesture
  onPinch={(e) => {
    zoom.set(base() * e.scale)
    if (e.phase === 'end') base.set(zoom())
  }}
>
  <Stack scale={zoom()}><Text>Floor plan</Text></Stack>
</Gesture>`,
      mistakes: [
        'Putting `scale`/`translateX` on the `<Gesture>` ITSELF — the values are measured in its own coordinate space and feed back into themselves; transform a CHILD (the compiler warns)',
        'Treating `e.scale` / `e.dx` as a per-frame DELTA — they are cumulative since the gesture began; multiply/add your committed base, and commit it on `phase === "end"`',
        'Using `<Press onSwipeLeft>` for free dragging — swipe is a discrete end-of-gesture verdict; `<Gesture onPan>` reports the live translation',
        'Expecting pinch/rotate from one pointer — they begin only once two pointers are down',
      ],
      seeAlso: ['Press', 'Stack', 'Canvas'],
    },
    {
      name: 'Canvas',
      kind: 'component',
      signature:
        '(props: { width: number; height: number; background?: ColorToken; children }) => VNode — children: CanvasRect { x, y, width, height, radius? } · CanvasCircle { cx, cy, r } · CanvasLine { x1, y1, x2, y2 } · CanvasPath { d } · CanvasText { x, y, size? }, each with fill?/stroke?/strokeWidth? (token or #hex)',
      summary:
        'A fixed-size, clipped vector drawing surface. Children are the shape primitives, drawn in source order (later on top) in the canvas coordinates: (0,0) top-left, y down, px/pt/dp. Shapes are ordinary JSX children, so `<For>`, `<Show>` and signal-driven props (`d={trail()}`, `width={w()}`) work inside. Paint: `fill`/`stroke` take a colour token or a `#hex` literal; with neither, a shape is filled with `text`; `<CanvasLine>` is stroke-only (default `text`, width 1). `<CanvasPath d>` takes full SVG path data (M L H V C S Q T A Z, absolute + relative). `<CanvasText>` places the TOP-LEFT of its text at (x, y) on every target. Web: one absolutely positioned `<svg>` layer per shape; iOS: `PyreonCanvas { PyreonShape(PyreonCanvasPath.rect(…)) }` (a runtime SVG parser for `d`); Android: `PyreonCanvas { PyreonShape(PyreonShapeSpec.Rect(…)) }` (androidx `PathParser` for `d`). Pair with `<Gesture>` + transform props for a pannable / zoomable plan.',
      example: `<Canvas width={200} height={120} background="surface">
  <CanvasRect x={10} y={10} width={80} height={50} radius={6} fill="primary" />
  <CanvasCircle cx={150} cy={40} r={20} fill="#16a34a" stroke="text" strokeWidth={2} />
  <CanvasPath d="M10 100 L190 100" stroke="text" strokeWidth={2} />
  <CanvasText x={110} y={80} size={14}>Hall A</CanvasText>
</Canvas>`,
      mistakes: [
        'Using a shape outside a `<Canvas>` — shapes draw in the canvas coordinate space and fill its frame on native',
        'Passing a CSS colour name (`fill="tomato"`) — only colour tokens and `#hex` literals resolve on native (the compiler warns)',
        'Expecting `<CanvasText y>` to be the BASELINE — it is the top-left of the text on every target',
        'Reaching for lowercase `<svg>`/`<path>` for cross-platform drawing — those are DOM elements; the Canvas shapes are the multiplatform vocabulary',
      ],
      seeAlso: ['Gesture', 'Image'],
    },
    {
      name: 'Link',
      kind: 'component',
      signature: '(props: { to: string; external?: boolean; children }) => VNode',
      summary:
        'Navigation link. Web → a real `<a href>`; the package has NO router dependency, so call `init({ navigate })` once and plain left-clicks route through your handler (modifier-clicks stay with the browser; without `init` it is a full-page link). iOS/Android → `PyreonLink(to)`, which pushes `to` onto the native router (`@pyreon/native-router-swift` / `-kotlin`). `external` renders `target="_blank" rel="noopener noreferrer"` on web.',
      example: `<Link to="/profile">Profile</Link>`,
      mistakes: [
        'Hardcoding an href for internal routes — use `to` so it routes natively too',
        'Relying on `external` natively — it is IGNORED on iOS and Android (the compiler warns) and the URL is pushed onto the in-app router; open websites with `useLinking().openUrl(url)`',
        'Expecting SPA navigation on web without calling `init({ navigate })` — the link then does a full page load',
      ],
      seeAlso: ['Button'],
    },
    {
      name: 'Field',
      kind: 'component',
      signature:
        "(props: { value: string | (() => string); onChangeText: (next: string) => void; placeholder?: string; disabled?: boolean } & ({ multiline?: false; kind?: 'text'|'number'|'password'|'email'|'search'|'tel'|'url'; onSubmit?: () => void } | { multiline: true; lines?: number } | { kind: 'date'|'time'|'datetime'; min?: string; max?: string })) => VNode",
      summary:
        'Text input. Web `<input>` with a 1px grey rounded border; iOS `TextField` / `SecureField` with `.textFieldStyle(.roundedBorder)`; Android a filled single-line `TextField`. An inline `style` (or `background` prop) that draws a background or border replaces the default box on web and iOS. Handler is `onChangeText(next)` (NOT `onInput`/`onChange`). `value` accepts a signal accessor for two-way binding. `multiline` makes it a text area on every target — web `<textarea rows>`, iOS `TextField(axis: .vertical)` + `.lineLimit(lines, reservesSpace: true)`, Android `minLines`/`maxLines` — exactly `lines` rows tall (default 3) and scrolling past them. `kind="date" | "time" | "datetime"` makes it the platform picker (web `<input type=date|time|datetime-local>`, iOS `DatePicker`, Android Material 3 date/time dialogs) over the web\'s zone-free wall-clock STRING — `YYYY-MM-DD` / `HH:mm` / `YYYY-MM-DDTHH:mm`, `\'\'` = no value — bounded by `min`/`max` in the same format. `multiline` and a date `kind` are mutually exclusive.',
      example: `<Field value={draft()} onChangeText={(t) => draft.set(t)} placeholder="Search…" onSubmit={search} />
<Field multiline lines={5} value={bio()} onChangeText={(t) => bio.set(t)} placeholder="About you" />
<Field kind="date" min="2026-01-01" value={due()} onChangeText={(d) => due.set(d)} />`,
      mistakes: [
        'Using `onChange`/`onInput` — the canonical handler is `onChangeText(next: string)`',
        'Forgetting `value` is the source of truth — write back via `onChangeText` → signal.set',
        'A dynamic `multiline={cond()}` — it is structural (a different element / initializer), so only a static value lowers natively; branch the element instead',
        'Expecting `onSubmit` or a keyboard `kind` on a `multiline` field — Return inserts a newline (as in a `<textarea>`), so neither applies; the types reject both and the native compiler warns',
        'Expecting a `multiline` field to grow with its content — it is a fixed `lines` rows tall on every target and scrolls',
        'Passing a `Date` or epoch number as a date kind\'s `value` — it is the wall-clock STRING (`"2026-10-22"`, `"09:30"`, `"2026-10-22T09:30"`), with no time zone',
        'A `min`/`max` in another format (`"22/10/2026"`, `"9:00"`) — a browser ignores it, so native drops it too (named warning)',
        '`onSubmit` on a date kind — a picker has no keyboard submit; the types forbid it and native ignores it with a warning',
        'Combining `multiline` with a date `kind` — a picker is never multi-line; the types reject it',
        'Expecting Android to stop the time wheel at a time bound — Material\'s TimePicker cannot disable hours, so the bound is applied on confirm (snaps to it)',
      ],
      seeAlso: ['Toggle'],
    },
    {
      name: 'Toggle',
      kind: 'component',
      signature:
        '(props: { value: boolean | (() => boolean); onChange: (next: boolean) => void; disabled?: boolean }) => VNode',
      summary:
        'Boolean switch/checkbox. Web checkbox; iOS `Toggle`; Android `Switch`. `onChange(next: boolean)`.',
      example: `<Toggle value={enabled()} onChange={(v) => enabled.set(v)} />`,
      mistakes: ['Using `onPress`/`onClick` — Toggle uses `onChange(next: boolean)`'],
      seeAlso: ['Field'],
    },
    {
      name: 'Select',
      kind: 'component',
      signature:
        "(props: { value: string | (() => string); options: SelectOption[] | (() => SelectOption[]); onChange: (next: string) => void; placeholder?: string; disabled?: boolean }) => VNode",
      summary:
        "Single choice from a list with the platform's own picker: web `<select>`, iOS a menu-style `Picker`, Android a Material 3 `ExposedDropdownMenuBox` (the runtimes' `PyreonSelect`). `options` is `{ value, label, disabled? }[]` (`SelectOption`); `value` is the chosen option's `value`, and `''` — or any value no option has — selects nothing, which shows the `placeholder`. A disabled option is listed but not selectable, and the placeholder can never be chosen again. Every user choice goes through `onChange`.",
      example: `const fruit = signal('')
<Select value={fruit()} options={[{ value: 'apple', label: 'Apple' }, { value: 'pear', label: 'Pear', disabled: true }]} onChange={(v) => fruit.set(v)} placeholder="Pick a fruit" />`,
      mistakes: [
        'Using `onChangeText` or `onInput` — Select reports a choice with `onChange(next: string)`',
        'Numeric option values — a `<select>` value is a string on every target; convert at the edges',
        'A renamed type import (`import type { SelectOption as Opt }`) — the native runtimes name the type `SelectOption`, so the compiler warns',
        "Building options natively from objects with other field names — a native picker reads `value`, `label` and `disabled`; map to that shape (`xs.map((x) => ({ value: x.id, label: x.name }))`)",
      ],
      seeAlso: ['Field', 'Toggle'],
    },
    {
      name: 'Modal',
      kind: 'component',
      signature:
        '(props: { open: boolean | (() => boolean); onClose: () => void; children }) => VNode',
      summary:
        'Modal/sheet. Web → native `<dialog>` opened with `showModal()` (focus trap, backdrop, top layer); Escape and backdrop clicks call `onClose` instead of closing the dialog themselves, so `open` stays the source of truth. iOS `.sheet(isPresented:)`; Android `Dialog(onDismissRequest)`. Drive `open` with a signal; `onClose` fires on dismiss.',
      example: `<Modal open={showSheet()} onClose={() => showSheet.set(false)}><Stack>{/* sheet body */}</Stack></Modal>`,
      mistakes: [
        'Forgetting `onClose` — needed so the platform dismiss gesture updates your signal',
      ],
      seeAlso: ['Layer'],
    },
    {
      name: 'Tabs',
      kind: 'component',
      signature:
        '(props: { value: string | (() => string); onChange: (next: string) => void; children: <Tab> elements } | { router: TabsRouter; children: <Tab> elements }) => VNode',
      summary:
        'Top-level tab navigation; children are literal `<Tab value label icon?>` entries whose children are the tab content. Web: the WAI-ARIA tabs pattern (tablist / tab / tabpanel, roving tabindex, arrow keys + Home/End) as a bottom bar below 600px of viewport width and a side rail at 600px+. iOS: `TabView(selection:)` (iOS 18+ `.sidebarAdaptable`, a sidebar on iPad). Android: Material `BottomNavigation` below 600dp of window width, `NavigationRail` at 600dp+ (the `useSizeClass()` breakpoint). A visited tab stays MOUNTED while hidden on every target, so its local state, typed text and scroll position survive switching away and back. Router-agnostic: the selection is your signal; a string-literal-union signal lowers to the native enum. OR router-bound: `<Tabs router={router}>` with a `createRouter({ tabs })` router gives every tab its own back stack — the selection is `router.activeTab()`, a tap goes through `router.selectTab` (re-tapping the active tab pops it to its root), and a `<RouterView />` in each `<Tab>` shows THAT tab\'s stack. iOS: one `NavigationStack` per tab inside the `TabView` (a push stays inside its tab, the bar stays visible); Android: per-tab stacks, the system Back pops the active tab first.',
      example: `const tab = signal('feed')
<Tabs value={tab} onChange={(v) => tab.set(v)}>
  <Tab value="feed" label="Feed" icon="home"><FeedScreen /></Tab>
  <Tab value="me" label="Me" icon="person"><ProfileScreen /></Tab>
</Tabs>`,
      mistakes: [
        'Generating the `<Tab>`s with `<For>` or a helper — native targets build the tab bar at compile time, so each `<Tab>` must be written out (anything else is dropped with a warning)',
        'A computed `<Tab value>` / `label` icon — `value` and `icon` must be string literals (the `value` is the native `case` / `when` branch)',
        'Expecting `data-testid` on a `<Tab>` to identify the iOS tab bar button — SwiftUI gives tab bar items no identifier; query them by label (it lands on the web button and the Android bar item)',
        'Using a SIGNAL-bound `<Tabs>` around routed screens and expecting each tab to keep its own route stack — the router has ONE stack, so on iOS/Android a push from inside a tab covers the TabView. Configure `createRouter({ tabs })` and bind `<Tabs router={router}>` instead',
        'A `<Tabs router>` `<Tab value>` that names no tab of `createRouter({ tabs })` — it has no stack, so native drops it with a warning',
        'Passing both `router` and `value`/`onChange` — `router` wins; the selection is the router\'s active tab',
      ],
      seeAlso: ['Split', 'Link'],
    },
    {
      name: 'Split',
      kind: 'component',
      signature:
        '(props: { sidebar: VNodeChild; showDetail: boolean | (() => boolean); onBack: () => void; backLabel?: string; children }) => VNode',
      summary:
        'Adaptive list/detail layout: `sidebar` is the list, the children are the detail. At 600px/dp of window width and wider both panes show side by side; below it ONE pane shows — the sidebar, or the detail while `showDetail` — and going back calls `onBack` (web back button, iOS navigation back button / swipe-back, Android system back via BackHandler). iOS uses `NavigationSplitView` in a regular-width window and pushes the detail on a compact one, reusing the router\'s NavigationStack when inside one (never nesting a second). Both panes stay mounted on web/Android, so the list keeps its state across a detail visit.',
      example: `const picked = signal<string | null>(null)
<Split sidebar={<MessageList onPick={(id) => picked.set(id)} />} showDetail={picked() !== null} onBack={() => picked.set(null)}>
  <MessageView id={picked()} />
</Split>`,
      mistakes: [
        'Omitting `onBack` — the platform back gesture cannot clear your selection (Android then falls through to the activity and closes the app)',
        'Leaving the detail empty when nothing is selected — a wide window always shows BOTH panes, so render a placeholder',
        'Passing a non-JSX `sidebar` (a variable holding a view) — only a JSX literal or an accessor returning one lowers natively',
      ],
      seeAlso: ['Tabs'],
    },
    {
      name: 'Transition',
      kind: 'component',
      signature:
        "(props: { show: boolean | (() => boolean); name?: 'fade' | 'scale-in' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right'; duration?: number; easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'; enterDuration?: number; leaveDuration?: number; enterEasing?: TransitionEasing; leaveEasing?: TransitionEasing; children }) => VNode",
      summary:
        'The MULTIPLATFORM animation vocabulary — animate a subtree in and out of view. Web renders a wrapper div driven by real CSS transitions; iOS emits `ZStack { if show { … .transition(…) } }.animation(…, value: show)`; Android emits `AnimatedVisibility(visible = show, enter =, exit =)`. `name` picks a preset every target translates natively (camelCase AND kebab-case both accepted — `slideUp` === `slide-up`), and direction is the direction of TRAVEL, so a slide-up rises INTO place from below. `duration`/`easing` are symmetric; `enterDuration`/`leaveDuration`/`enterEasing`/`leaveEasing` override one side and fall back to the symmetric value, which is how "quick in, slow out" is spelled. Import it from HERE, not from `@pyreon/runtime-dom` — that package is web-only and warns on native.',
      example: `<Transition name="slide-up" show={isOpen()} enterDuration={200} leaveDuration={400}><Panel /></Transition>`,
      mistakes: [
        'Importing `Transition` from `@pyreon/runtime-dom` — it lowers fine, but the package is WEB-ONLY so PMTC warns; `@pyreon/primitives` is the import that resolves on all three targets',
        'Passing a non-literal `duration` (a signal read, a computed value) — the native emitters require a static number of milliseconds and warn + fall back to the default otherwise',
        'Expecting the children to UNMOUNT on web when `show` is false — the wrapper goes `display:none` and keeps them mounted, so an animation wrapper never gates content out of SSR (it also contributes no flex `gap` while hidden)',
        'Expecting an enter animation on the FIRST render — mounting with `show` already true paints at rest, matching `AnimatedVisibility(visible = true)` and SwiftUI `.animation(_:value:)`',
        'Reaching for a custom `name` — the preset set is closed on purpose; an unlisted name has no native translation and falls back to a fade',
      ],
      seeAlso: ['TransitionGroup'],
    },
    {
      name: 'TransitionGroup',
      kind: 'component',
      signature: '(props: { children }) => VNode',
      summary:
        'A container that animates its own SIZE as rows enter and leave the keyed list inside it. Web measures the content with `ResizeObserver` and transitions the outer height; iOS emits `VStack { … }.animation(.default, value: <list>.count)`; Android emits `Column(modifier = Modifier.animateContentSize())`. Children-only by design — neither native emitter reads any other attribute, so a `duration`/`easing` prop here would be web-only decoration on a primitive whose whole purpose is parity. Wrap a `<For>` in it.',
      example: `<TransitionGroup><For each={rows()} by={(r) => r.id}>{(r) => <Text>{r.label}</Text>}</For></TransitionGroup>`,
      mistakes: [
        'Expecting per-ROW enter/leave animation — this animates the CONTAINER; wrap an individual row in `<Transition>` for that',
        "Relying on it in a no-JS / server-rendered snapshot — the height is only ever driven from a measurement, so SSR output has no inline height and lays out at the content's natural size",
      ],
      seeAlso: ['Transition'],
    },
    {
      name: 'WebView',
      kind: 'component',
      signature:
        '(props: { html?: string; src?: string; data?: unknown; onMessage?: (message: string) => void; domStorage?: boolean; grow?: boolean }) => VNode',
      summary:
        'Host a web page/component natively (WKWebView on iOS, Android WebView; `<iframe srcdoc>` on web). THE escape hatch for web-only packages (flow/code/document) on native — they run inside the WebView. Bidirectional bridge: `data` is pushed in as `window.__pyreonData` (+ a `pyreondata` event, live, no reload); the page calls `window.pyreonPostMessage(payload)` → your `onMessage` closure. `domStorage` (default true, native-only literal) keeps `localStorage` available in the hosted page (Android disables it by default; `false` opts out). SIZING: unsized it is the `<iframe>` default on every target — full width, 150 high; `grow` (literal, native) takes the free main-axis space of its parent `<Stack>`/`<Inline>` (`Modifier.weight(1f)` / a greedy SwiftUI frame / `flex: 1 1 150px`), fills a non-stack parent, and keeps 150 inside a `<Scroll>` (warned + dropped on native). BROWSER CHROME works natively: `<input type=file>` (picker, or camera for `capture` via the app\'s FileProvider), `alert`/`confirm`/`prompt` as native dialogs, geolocation / camera / microphone after a per-site consent AND only for permissions the app declares (AndroidManifest / Info.plist usage string), `window.open` / `target=_blank` handed to the system browser for http(s)/mailto/tel/sms. ORIGIN SCOPE (native): the host pins the origin its own load lands on (`file://` for `html`/bundled `src`, else the remote origin after redirects); the main frame stays on it (a tapped off-origin link opens in the system browser, other off-origin navigations are cancelled) and `data`/`onMessage` reach only the MAIN frame of that origin — never an iframe — matching the web host. Bundled `src` names with `..` are refused; a non-bundled `src` must be http(s).',
      example: `<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />`,
      mistakes: [
        'Using it for core UI (nav/forms/lists) — pays WebView boot + bundle cost; use native primitives there. Reserve <WebView> for self-contained web-island panes (editors/diagrams)',
        'Expecting native look-and-feel — content renders as a web view, not native widgets',
        'Expecting an unsized WebView to fill the screen — it is 150 high on every target (the iframe default); pass `grow` as a direct child of the `<Stack>` whose remaining space it should take',
        'Putting `grow` inside a `<Scroll>` — there is no free space to fill; native drops it with a warning and the view stays 150 high',
        'Expecting a hosted page to read the location or camera without declaring it — add the permission (AndroidManifest) / usage string (Info.plist); an undeclared one is denied and logged',
        'Expecting `target="_blank"` to open inside the view — it hands the URL to the system browser (http(s)/mailto/tel/sms only), keeping the hosted page in place',
      ],
      seeAlso: ['Web', 'connectWebHost'],
    },
    {
      name: 'connectWebHost',
      kind: 'function',
      signature:
        'connectWebHost<T>() => { data(): T | undefined; onData(cb: (data: T | undefined) => void): () => void; emit(message: string): void; joinGroup(group: string): void; leaveGroup(): void; relay(message: string): void; onRelay(cb: (message: string) => void): () => void }',
      summary:
        'The guest-side glue for the `<WebView>` bridge — the reusable OTHER half of the WebView-host pattern. A web-only-rich component (flow diagram, editor) built as a self-contained bundle runs `connectWebHost()` INSIDE the hosted page (an `<iframe srcdoc>` on web, a WKWebView on iOS, an Android WebView) to read host-pushed props (`data()` / `onData(cb)` fires on every `pyreondata` push) and send events back (`emit(msg)` → the host `onMessage`). Same code on every platform, so a webview-hosted panel is truly 1:1. HOST GROUPS: `joinGroup(name)` puts the page in a group; `relay(msg)` reaches every OTHER hosted page of that group (a sibling iframe on web, a sibling WKWebView / Android WebView natively — the host does the fan-out, since separate pages can never see each other) and `onRelay(cb)` receives what siblings relay; this is how separate hosted pages mirror shared state (a viewport, a selection) with each other. Guest-only: every method is an inert no-op off-browser, so importing it can never crash a build.',
      example: `const host = connectWebHost<{ rows: number[] }>()
host.onData((d) => renderChart(root, d?.rows ?? []))
bar.onclick = () => host.emit(String(bar.dataset.id))`,
      mistakes: [
        'Hand-rolling `window.__pyreonData` / `window.pyreonPostMessage` in the bundle instead of this helper — the two ends can silently drift and the panel stops updating.',
        'Calling it in the HOST component (the one rendering `<WebView>`) — it runs in the GUEST bundle inside the WebView, not the host.',
      ],
      seeAlso: ['WebView', 'webHostDocument', 'Web / NativeIOS / NativeAndroid'],
    },
    {
      name: 'webHostDocument',
      kind: 'function',
      signature:
        'webHostDocument(options: { script: string; css?: string; rootId?: string; title?: string }) => string',
      summary:
        'Build the self-contained HTML page a `<WebView html={…}>` hosts — the document shell for the guest side of the WebView-host pattern. Pairs with `connectWebHost`: bundle a web-only component to an IIFE that calls `connectWebHost()`, wrap it with `webHostDocument({ script })`, pass the result as `<WebView html={…}>`. Everything is INLINED (no external `<script>`/`<link>`) so the same page works as `<iframe srcdoc>` on web and `loadHTMLString` on a WKWebView / Android WebView — truly 1:1, no network, no CSP surprises.',
      example: `const html = webHostDocument({ script: BUNDLED_EDITOR_IIFE, css: editorCss })
// <WebView html={html} data={metrics()} onMessage={(m) => selected.set(m)} />`,
      mistakes: [
        'Passing a module (import/export) as `script` — the guest page runs it as a plain inline `<script>`; build to a self-contained IIFE first.',
        'Referencing an external asset (CDN font, remote image) — a WKWebView `loadHTMLString` page has no base URL; inline everything (data: URIs, `css`).',
      ],
      seeAlso: ['connectWebHost', 'WebView'],
    },
    {
      name: 'Web / NativeIOS / NativeAndroid',
      kind: 'component',
      signature:
        'Web(props: { children }) => VNodeChild · NativeIOS(props: { children }) => VNodeChild · NativeAndroid(props: { children }) => VNodeChild',
      summary:
        "The Layer-4 per-platform escape hatch — one source carries a platform-specific subtree and exactly ONE branch renders per target. `<Web>` renders its children on WEB only (a layout-transparent Fragment, no wrapper element); `<NativeIOS>` / `<NativeAndroid>` render NOTHING on web (they return null — their children are emitted only on the iOS / Android target by PMTC). Reach for these for the rare genuinely-per-platform UI branch the canonical primitives can't express (a web-only-rich chart/flow/table view vs a native equivalent or a `<WebView>` embed).",
      example: `<Web>{/* web-only-rich: <Chart>, <Flow>, <Table> */}</Web>
<NativeIOS>{/* Swift Charts, or a <WebView> embed */}</NativeIOS>
<NativeAndroid>{/* Compose chart, or a <WebView> embed */}</NativeAndroid>`,
      mistakes: [
        'Overusing them — defeats the one-source model; reach for them only when a target genuinely needs different UI.',
        'Putting web-visible content in `<NativeIOS>` / `<NativeAndroid>` — both render NOTHING on web (they are no-ops there); only `<Web>` content reaches the browser.',
      ],
      seeAlso: ['WebView', 'init / resetPrimitivesConfig', 'defineNativeModule / useNativeModule'],
    },
    {
      name: 'defineNativeModule / useNativeModule',
      kind: 'function',
      signature:
        'defineNativeModule<T>(name: string, webImpl: T) => T · useNativeModule<T>(name: string) => T · hasNativeModule(name: string) => boolean',
      summary:
        "The Layer-4 FFI escape hatch — how an APP adds a platform capability the framework does not ship (Bluetooth, ARKit, a payments/analytics SDK). PMTC lowers `useNativeModule('X')` to an instance of a class YOU provide (`X()` on iOS, `X(context)` on Android) and passes member calls through verbatim, so the platform compiler type-checks the surface; on web the same call resolves the `defineNativeModule` registration, keeping one source running on all three targets. `await mod.method()` composes with the async lowering with no extra machinery. This is distinct from `<NativeIOS>`/`<NativeAndroid>`, which only BRANCH between canonical-primitive subtrees — they cannot host raw platform code.",
      example: `type Bluetooth = { connect(id: string): Promise<boolean> }

// web implementation (native targets never run this)
defineNativeModule<Bluetooth>('Bluetooth', { connect: async () => false })

function Pairing() {
  const bt = useNativeModule<Bluetooth>('Bluetooth')
  return <Button onPress={() => { void bt.connect('cuff') }}>Connect</Button>
}`,
      mistakes: [
        'Passing a non-literal module name (`useNativeModule(NAME)`) — it is emitted verbatim as the native class name and PMTC resolves one file at a time, so only a STRING LITERAL at the call site works; anything else warns and the declaration is skipped on native.',
        'Forgetting `defineNativeModule` — native targets compile the call away, so a missing registration only surfaces on WEB, where `useNativeModule` throws.',
        'Giving the Android class a no-arg constructor — the Compose emit injects `LocalContext.current`, so it must take a SINGLE `Context` parameter (ignore it if unused); iOS is the opposite (no-argument initialiser).',
        'Declaring the Kotlin class in a different package from the generated sources — the emit references it UNQUALIFIED, so it must live in the `--kotlin-package` package.',
        'Expecting reactive re-render for free — mark the Swift class `@Observable` / back Kotlin state with `mutableStateOf` if its state should drive the view.',
        'Writing a method-bearing `type`/`interface` and expecting a struct — a method-only contract type is intentionally not lowered to a native struct (its methods live on the platform class); a MIXED data+method type emits the data fields and warns about the dropped methods.',
      ],
      seeAlso: ['Web / NativeIOS / NativeAndroid', 'WebView'],
    },
    {
      name: 'init / resetPrimitivesConfig',
      kind: 'function',
      signature:
        'init(options: { navigate?: (to: string) => void }) => void · resetPrimitivesConfig() => void',
      summary:
        'One-time app-boot configuration for `@pyreon/primitives`. The package is deliberately router-AGNOSTIC (a consumer using only `<Stack>`/`<Text>` never pulls a router into their graph), so `<Link>` needs a navigation handler supplied ONCE via `init({ navigate })`. With it, `<Link>` intercepts plain left-clicks and routes via `navigate` (SPA — no full reload); WITHOUT it, `<Link>` is a plain `<a href>` that does a normal full-page navigation — so links always WORK, `init` only UPGRADES them to SPA. `init` merges with any previous config (later calls override the keys they set). `resetPrimitivesConfig()` clears it back to defaults (primarily for tests / teardown). The config is a module-level singleton and SSR-safe (the server renders a static `<a href>`; `navigate` is read only inside a client click handler).',
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
