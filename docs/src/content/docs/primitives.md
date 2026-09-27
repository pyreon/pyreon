---
title: '@pyreon/primitives'
description: 'The canonical multi-platform UI vocabulary — 17 primitives plus Transition, TransitionGroup, WebView and per-platform escape hatches, each compiled to DOM, SwiftUI and Compose from one source.'
---

# @pyreon/primitives

One vocabulary, three outputs. Write a component once with these primitives: on
the **web** they render real DOM; on **iOS** and **Android** the PMTC compiler
reads the same `.tsx` and emits SwiftUI and Jetpack Compose. On native targets
the import is only there for TypeScript, and the web implementation is never
called.

```sh
bun add @pyreon/primitives @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
```

## What is in the package

| Group | Components | Lowers natively via |
| --- | --- | --- |
| **Layout** | [`Stack`](#stack), [`Inline`](#inline), [`Layer`](#layer), [`Scroll`](#scroll), [`Spacer`](#spacer) | dedicated emitters |
| **Content** | [`Text`](#text), [`Heading`](#heading), [`Image`](#image), [`Audio`](#audio), [`Video`](#video), [`Icon`](#icon) | dedicated emitters |
| **Interaction** | [`Button`](#button), [`Press`](#press), [`Link`](#link) | dedicated emitters |
| **Input** | [`Field`](#field), [`Toggle`](#toggle), [`Modal`](#modal) | dedicated emitters |
| **Animation** | [`Transition`](#transition), [`TransitionGroup`](#transitiongroup) | dedicated emitters |
| **Web content** | [`WebView`](#webview) | native web host |
| **Escape hatches** | [`Web`, `NativeIOS`, `NativeAndroid`](#escape-hatches) | per-target branch |

The first four groups are the **17 canonical primitives**, the UI vocabulary
the compiler treats as its own. The compiler's list lives in
`packages/native/compiler/src/canonical-primitives.ts` (`CANONICAL_PRIMITIVES`),
and a test checks that it matches what this package exports. The animation
wrappers, `WebView` and the escape hatches also compile to all three targets,
but each has its own emitter, so they are listed separately.

The package also exports `init` (router wiring for `<Link>`, see below),
`defineNativeModule` / `useNativeModule` (add your own Swift/Kotlin code, see
[Multiplatform → escape hatches](/docs/multiplatform#layer-4--platform-escape-hatches))
and `connectWebHost` (the page-side half of `<WebView>`).

## Shared props

### Tokens instead of pixels

Layout primitives (`Stack`, `Inline`, `Layer`, `Scroll`) take token values, and
every target resolves them to the same numbers:

| Prop | Values | Resolves to |
| --- | --- | --- |
| `padding` `paddingX` `paddingY` `margin` `marginX` `marginY` (and `gap` on `Stack`/`Inline`) | `0`–`9` or `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | index `0 1 2 3 4 5 6 7 8 9` → `0 4 8 12 16 20 24 32 40 48`; names → `xs 4, sm 8, md 12, lg 16, xl 24` (px on web, pt on iOS, dp on Android) |
| `background`, and `color` on `Text`/`Heading`/`Icon` | `'text' \| 'surface' \| 'primary' \| 'secondary' \| 'success' \| 'warning' \| 'danger' \| 'muted'` | `#111827 #ffffff #2563eb #6b7280 #16a34a #d97706 #dc2626 #9ca3af` |
| `radius` | `'none' \| 'sm' \| 'md' \| 'lg' \| 'full'` | `0 4 8 16 9999` |

Raw pixel values are not accepted. For a one-off value use `style` on the web,
or a platform branch.

### Accessibility, test ids and HTML attributes

Every primitive except `WebView` accepts these, and each target converts them:

| Prop | Web | iOS | Android |
| --- | --- | --- | --- |
| `accessibilityLabel` | `aria-label` | `.accessibilityLabel(…)` | `semantics { contentDescription = … }` |
| `accessibilityHidden` | `aria-hidden="true"` | `.accessibilityHidden(true)` | `clearAndSetSemantics { }` |
| `accessibilityRole` (`'button' \| 'image' \| 'header'`) | `role` | `.accessibilityAddTraits(.isButton / .isImage / .isHeader)` | `semantics { role = … }` / `heading()` |
| `data-testid` | attribute | `.accessibilityIdentifier(…)` | `Modifier.testTag(…)` |
| other `data-*`, `aria-*`, `id`, `class`, `style` | forwarded to the element | ignored | ignored |

Prefer the three `accessibility*` props over raw `aria-*`, because only they
reach the native accessibility trees.

### Signals

Pass signal reads directly, as you would anywhere else in Pyreon:
`value={name()}`, `open={isOpen()}`, `disabled={busy()}`. The compiler keeps
them reactive on every target. Handlers write back with `.set(...)`.

## Layout

### Stack

A flex container. Children run top to bottom by default.

| Prop | Type | Default |
| --- | --- | --- |
| `direction` | `'column' \| 'row'` | `'column'` |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` (cross axis) | — |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | — |
| `gap` | space token | — |
| `wrap` | `boolean` | `false` |
| layout props | `padding`, `margin`, `background`, `radius`, … | — |

```tsx
// @check
import { Stack, Text } from '@pyreon/primitives'

export function Card() {
  return (
    <Stack gap="md" padding={4} background="surface" radius="md" align="start">
      <Text weight="bold">Title</Text>
      <Text color="muted">Body copy</Text>
    </Stack>
  )
}
```

- **Web**: `<div>` with `display:flex; flex-direction: column | row`.
- **iOS**: `VStack` (or `HStack` for `direction="row"`) with
  `alignment:`/`spacing:`, then `.padding` / `.background` / `.cornerRadius`
  modifiers. `margin` becomes an outer `.padding`.
- **Android**: `Column` / `Row` with `Arrangement.spacedBy(…)` and an
  `Alignment`, then `Modifier.padding` / `.background` / `.clip(RoundedCornerShape)`.
- **Not on native**: `justify` and `wrap` are ignored on iOS and Android, and
  the compiler warns about it. SwiftUI stacks have no distribution setting and
  no wrapping. Use `<Spacer />` between children to push them apart.

### Inline

A horizontal `Stack`. It takes the same props as `Stack` except `direction`.

```tsx
// @check
import { Inline, Button, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function Toolbar() {
  const count = signal(0)
  return (
    <Inline gap="sm" align="center">
      <Text>Count: {count()}</Text>
      <Button onPress={() => count.set(count() + 1)}>+1</Button>
    </Inline>
  )
}
```

- **Web**: `<div style="display:flex; flex-direction:row">`.
- **iOS**: `HStack`. **Android**: `Row`.
- Same native limits as `Stack`: `justify` and `wrap` are ignored with a warning.

### Layer

Stacks its children on top of each other; later children are in front.

| Prop | Type |
| --- | --- |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` |
| layout props | `padding`, `margin`, `background`, `radius`, … |

```tsx
// @check
import { Layer, Image, Text } from '@pyreon/primitives'

export function Poster() {
  return (
    <Layer align="center">
      <Image src="https://picsum.photos/320/180" alt="Background" width={320} height={180} />
      <Text color="surface" weight="bold">On top</Text>
    </Layer>
  )
}
```

- **Web**: `<div style="position:relative; display:grid">`, with `align` mapped
  to `place-items`.
- **iOS**: `ZStack(alignment:)`. **Android**: `Box(contentAlignment = …)`.
- **Differs on web**: native children overlap automatically. On the web, two
  ordinary children sit in separate grid rows. To overlap them on the web, give
  the front child `position: absolute` (the Layer is its positioning parent).

### Scroll

A scrollable area, vertical unless you say otherwise.

| Prop | Type | Default |
| --- | --- | --- |
| `axis` | `'vertical' \| 'horizontal'` | `'vertical'` |
| layout props | `padding`, `margin`, `background`, `radius`, … | — |

```tsx
// @check
import { Scroll, Stack, Text } from '@pyreon/primitives'

export function LongList() {
  return (
    <Scroll>
      <Stack gap="sm" padding={4}>
        <Text>Row 1</Text>
        <Text>Row 2</Text>
        <Text>Row 3</Text>
      </Stack>
    </Scroll>
  )
}
```

- **Web**: `<div>` with `overflow-y:auto` (or `overflow-x:auto` for
  `axis="horizontal"`).
- **iOS**: `ScrollView` / `ScrollView(.horizontal)`.
- **Android**: `Column(Modifier.verticalScroll(rememberScrollState()))` or
  `Row(Modifier.horizontalScroll(…))`.
- For long, data-driven lists use `<For each by>`, which lowers to a lazy list
  on native.

### Spacer

Takes up the remaining space along the parent's direction. It has no props of
its own.

```tsx
// @check
import { Inline, Spacer, Text } from '@pyreon/primitives'

export function Header() {
  return (
    <Inline padding={3}>
      <Text weight="bold">Inbox</Text>
      <Spacer />
      <Text color="muted">12 unread</Text>
    </Inline>
  )
}
```

- **Web**: `<div style="flex:1 1 auto">`.
- **iOS**: `Spacer()`. **Android**: `Spacer(Modifier.weight(1f))`.

## Content

### Text

Inline text.

| Prop | Type | Notes |
| --- | --- | --- |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'` | `12 14 16 20 24` px/pt/sp |
| `weight` | `'regular' \| 'medium' \| 'bold'` | web `400 / 500 / 700` |
| `color` | color token | |
| `truncate` | `boolean` | one line with an ellipsis |
| `font` | `string` | name of a font bundled by the native assets step |

```tsx
// @check
import { Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function Greeting() {
  const name = signal('Ada')
  return (
    <Text size="lg" weight="bold" color="primary" truncate>
      Hello, {name()}
    </Text>
  )
}
```

- **Web**: `<span>` with inline styles.
- **iOS**: `Text(…)` with `.font(.system(size:weight:))`, `.foregroundColor`,
  and `.lineLimit(1).truncationMode(.tail)` for `truncate`. Text containing a
  value uses `Text(verbatim:)`, so numbers are not reformatted per locale.
- **Android**: `Text(text = …, fontSize = …sp, fontWeight = …, color = …,
  maxLines = 1, overflow = TextOverflow.Ellipsis)`.
- `font` needs the font bundled by the native assets step. Without it iOS
  falls back to the system font and the compiler warns.

### Heading

A heading. `level` sets both the size and, on the web, the tag.

| Prop | Type | Default |
| --- | --- | --- |
| `level` | `1`–`6` | `1` |
| `color` | color token | — |

```tsx
// @check
import { Stack, Heading, Text } from '@pyreon/primitives'

export function Section() {
  return (
    <Stack gap="sm">
      <Heading level={2}>Settings</Heading>
      <Text>Change how the app behaves.</Text>
    </Stack>
  )
}
```

| Level | Web | iOS | Android (Material 2 typography) |
| --- | --- | --- | --- |
| 1 | `<h1>` 32px | `.largeTitle` | `h4` |
| 2 | `<h2>` 24px | `.title` | `h5` |
| 3 | `<h3>` 20px | `.title2` | `h6` |
| 4 | `<h4>` 18px | `.title3` | `subtitle1` |
| 5 | `<h5>` 16px | `.headline` | `body1` |
| 6 | `<h6>` 14px | `.subheadline` | `body2` |

iOS adds `.bold()`; the web uses `font-weight: 700`. On native the heading is a
styled `Text`. If assistive tech should announce it as a heading, add
`accessibilityRole="header"`.

### Image

A bitmap image.

| Prop | Type | Default |
| --- | --- | --- |
| `src` | `string` (required) | — |
| `alt` | `string` (required) | — |
| `fit` | `'cover' \| 'contain' \| 'fill' \| 'none'` | `'cover'` |
| `width`, `height` | `number \| string` | — |

```tsx
// @check
import { Image } from '@pyreon/primitives'

export function Avatar() {
  return <Image src="https://picsum.photos/96" alt="Profile photo" fit="cover" width={96} height={96} />
}
```

`src` means the same thing on every target: an `http(s)://` URL is loaded
remotely, and a bare name like `logo.png` is a bundled asset.

- **Web**: `<img>` with `object-fit`. Bare names are served from `/assets/`.
- **iOS**: remote → `AsyncImage(url:)` with a clear placeholder; bundled →
  `Image("logo")` from the asset catalog. `cover` → `.scaledToFill()`,
  `contain` → `.scaledToFit()`, `fill` → `.resizable()`, `none` → natural size.
  `alt` becomes `.accessibilityLabel`.
- **Android**: remote → Coil `AsyncImage(model = …)`; bundled →
  `Image(painterResource(pyreonDrawable("logo")))`. `fit` → `ContentScale.Crop /
  Fit / FillBounds / None`. `alt` becomes `contentDescription`.

### Audio

Sound playback. It has no visible UI: build your own controls from other
primitives and drive them with these props.

| Prop | Type | Default |
| --- | --- | --- |
| `src` | `string` (required) | — |
| `autoPlay` | `boolean` | `false` |
| `loop` | `boolean` | `false` |
| `muted` | `boolean` | `false` |
| `volume` | `number` (0–1, clamped) | — |
| `onStatusChange` | `(status: 'waiting' \| 'playing' \| 'paused') => void` | — |

```tsx
// @check
import { Audio, Text, Stack } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function Chime() {
  const status = signal('waiting')
  return (
    <Stack>
      <Audio src="https://example.com/chime.mp3" autoPlay muted onStatusChange={(s) => status.set(s)} />
      <Text>Audio is {status()}</Text>
    </Stack>
  )
}
```

- **Web**: `<audio>` without `controls`. Bare names are served from `/assets/`.
- **iOS**: `PyreonAudioPlayer(url:…, engine: AVFoundationAudioEngine())`.
- **Android**: `PyreonAudioPlayer(url = …, engine = Media3AudioEngine(…))`.
- On native, `autoPlay`, `loop`, `muted` and `volume` must be literal values.
  A value that changes at runtime is dropped with a warning, and a `src` that
  isn't a literal string is not lowered.

### Video

Video playback.

| Prop | Type | Default |
| --- | --- | --- |
| `src` | `string` (required) | — |
| `autoPlay`, `loop`, `muted` | `boolean` | `false` |
| `controls` | `boolean` | `true` |
| `width`, `height` | `number \| string` | — |
| `onStatusChange` | `(status: 'waiting' \| 'playing' \| 'paused') => void` | — |

```tsx
// @check
import { Video } from '@pyreon/primitives'

export function Clip() {
  return (
    <Video
      src="https://example.com/clip.mp4"
      autoPlay
      muted
      loop
      controls={false}
      width={320}
      height={180}
    />
  )
}
```

- **Web**: `<video>`. Browsers only allow muted autoplay reliably, so pair
  `autoPlay` with `muted`.
- **iOS**: `PyreonVideoPlayer(url:)`, which wraps AVKit's `VideoPlayer`, plus a
  `.frame` for the size.
- **Android**: `PyreonVideoPlayer(url = …)`, which wraps a Media3 ExoPlayer.
- The same literal-value rule as `Audio` applies on native.

### Icon

A named icon. The name is the same on every platform; each target maps it to
its own icon set.

| Prop | Type | Default |
| --- | --- | --- |
| `name` | `string` (required) | — |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `color` | color token | inherits the text colour on web |

```tsx
// @check
import { Inline, Icon, Text } from '@pyreon/primitives'

export function Rating() {
  return (
    <Inline gap="xs" align="center">
      <Icon name="star" color="warning" size="sm" />
      <Text>4.8</Text>
    </Inline>
  )
}
```

- **Web**: `<svg><use href="#star" /></svg>`, sized 16 / 20 / 24 px. The
  package ships **no icon set**: add an SVG sprite with `<symbol id="star">`
  to your page once. Icons are `aria-hidden` unless you pass an `aria-*` attribute.
- **iOS**: an SF Symbol, `Image(systemName:)`, with `.imageScale(.small /
  .medium / .large)`.
- **Android**: a Material icon, `Icon(imageVector = Icons.Filled.…)`, sized
  16 / 20 / 24 dp.
- The names with an entry on both platforms: `add`, `arrow-back`, `arrow-down`,
  `arrow-forward`, `arrow-up`, `account`, `calendar`, `cart`, `check`,
  `check-circle`, `close`, `delete`, `edit`, `email`, `exit`, `face`,
  `favorite`, `favorite-outline`, `home`, `info`, `list`, `location`, `lock`,
  `menu`, `more`, `notifications`, `person`, `phone`, `play`, `refresh`,
  `search`, `send`, `settings`, `share`, `star`, `thumb-up`, `warning`. Any
  other name is passed to iOS as a raw SF Symbol name and shows a warning
  placeholder on Android, and the compiler warns.

## Interaction

### Button

A button with the platform's own styling.

| Prop | Type | Default |
| --- | --- | --- |
| `onPress` | `() => void` (required) | — |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` |
| `disabled` | `boolean` | `false` |

```tsx
// @check
import { Inline, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function Actions() {
  const saving = signal(false)
  return (
    <Inline gap="sm">
      <Button onPress={() => saving.set(true)} disabled={saving()}>Save</Button>
      <Button variant="ghost" onPress={() => saving.set(false)}>Cancel</Button>
    </Inline>
  )
}
```

| Variant | Web | iOS | Android |
| --- | --- | --- | --- |
| `primary` | filled blue `<button>` | default `Button` | `Button` |
| `secondary` | white with a grey border | `.buttonStyle(.bordered)` | `OutlinedButton` |
| `ghost` | text only | `.buttonStyle(.plain)` | `TextButton` |
| `danger` | filled red | `.buttonStyle(.borderedProminent).tint(.red)` | `Button` in `colors.error` |

`disabled` becomes the `disabled` attribute on web, `.disabled(…)` on iOS and
`enabled = !…` on Android. Note that `primary` on iOS is SwiftUI's default
button, which is tinted text rather than a filled button.

### Press

Makes anything tappable, with no button styling of its own. Use it for
clickable cards and custom controls.

| Prop | Type |
| --- | --- |
| `onPress` | `() => void` (required) |
| `onLongPress` | `() => void` |
| `onSwipeLeft`, `onSwipeRight` | `() => void` |
| `disabled` | `boolean` |

```tsx
// @check
import { Press, Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function SwipeCard() {
  const last = signal('none')
  return (
    <Press
      onPress={() => last.set('tap')}
      onLongPress={() => last.set('long press')}
      onSwipeLeft={() => last.set('swipe left')}
      onSwipeRight={() => last.set('swipe right')}
    >
      <Stack padding={4} background="surface" radius="md">
        <Text>Last gesture: {last()}</Text>
      </Stack>
    </Press>
  )
}
```

- **Web**: `<div role="button" tabindex="0">`. Enter and Space trigger
  `onPress`. A long press fires after holding for 500ms. A swipe is a mostly
  horizontal drag of at least 40px, and a swipe does not also count as a tap.
- **iOS**: `Button(action:) { … }.buttonStyle(.plain)`, plus a
  `LongPressGesture(minimumDuration: 0.5)` and a high-priority `DragGesture`
  for the swipes (same 40pt rule).
- **Android**: `Box(Modifier.combinedClickable(onClick, onLongClick))` (or
  `Modifier.clickable`) plus `detectHorizontalDragGestures` for the swipes
  (same 40dp rule).

### Link

Navigation to another route.

| Prop | Type |
| --- | --- |
| `to` | `string` (required) |
| `external` | `boolean` |

```tsx
// @check
import { Link, Text, init } from '@pyreon/primitives'

// Once, at app start: send internal links through your router.
init({ navigate: (to) => history.pushState(null, '', to) })

export function Nav() {
  return (
    <Link to="/about">
      <Text color="primary">About us</Text>
    </Link>
  )
}
```

- **Web**: a real `<a href>`, so it works without JavaScript and can be opened
  in a new tab. This package does not depend on a router: call
  `init({ navigate })` once and ordinary left clicks go through your
  `navigate` function instead. Clicks with a modifier key are left to the
  browser. `external` renders `target="_blank" rel="noopener noreferrer"`.
- **iOS**: `PyreonLink("/about") { … }`, a button that pushes the path onto the
  app's native router (`@pyreon/native-router-swift`, iOS 17+).
- **Android**: `PyreonLink("/about") { navigate -> Box(Modifier.clickable { navigate() }) { … } }`
  from `@pyreon/native-router-kotlin`.
- **Not on native**: `external` is ignored on iOS and Android, and the compiler
  warns. The link still pushes the URL onto the in-app router. To open a
  website, call `useLinking().openUrl(url)` from `@pyreon/hooks` instead.

## Input

### Field

A single-line text input.

| Prop | Type | Default |
| --- | --- | --- |
| `value` | `string` (or a signal read) (required) | — |
| `onChangeText` | `(next: string) => void` (required) | — |
| `kind` | `'text' \| 'number' \| 'password' \| 'email' \| 'search' \| 'tel' \| 'url'` | `'text'` |
| `placeholder` | `string` | — |
| `disabled` | `boolean` | `false` |
| `onSubmit` | `() => void` | — |

```tsx
// @check
import { Stack, Field, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function EmailForm() {
  const email = signal('')
  const sent = signal(false)
  return (
    <Stack gap="sm">
      <Field
        kind="email"
        placeholder="you@example.com"
        value={email()}
        onChangeText={(t) => email.set(t)}
        onSubmit={() => sent.set(true)}
      />
      <Text>{sent() ? 'Sent!' : ''}</Text>
    </Stack>
  )
}
```

| `kind` | Web `type` | iOS | Android |
| --- | --- | --- | --- |
| `text` | `text` | `TextField` | `TextField` |
| `password` | `password` | `SecureField` | `PasswordVisualTransformation()` |
| `email` | `email` | `.keyboardType(.emailAddress)` | `KeyboardType.Email` |
| `number` | `number` | `.numberPad` | `KeyboardType.Number` |
| `tel` | `tel` | `.phonePad` | `KeyboardType.Phone` |
| `url` | `url` | `.URL` | `KeyboardType.Uri` |
| `search` | `search` | `.webSearch` | `KeyboardType.Text` |

`onSubmit` runs on Enter on the web, `.onSubmit` on iOS, and the keyboard's
Done action on Android (`ImeAction.Done`). **Both `value` and `onChangeText`
are required on native.** Without them the element can't be lowered and the
compiler warns.

### Toggle

An on/off switch.

| Prop | Type |
| --- | --- |
| `value` | `boolean` (or a signal read) (required) |
| `onChange` | `(next: boolean) => void` (required) |
| `disabled` | `boolean` |

```tsx
// @check
import { Inline, Toggle, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function WifiSetting() {
  const on = signal(true)
  return (
    <Inline gap="sm" align="center">
      <Toggle value={on()} onChange={(v) => on.set(v)} accessibilityLabel="Wi-Fi" />
      <Text>Wi-Fi is {on() ? 'on' : 'off'}</Text>
    </Inline>
  )
}
```

- **Web**: `<input type="checkbox" role="switch">`.
- **iOS**: `Toggle("", isOn: Binding(…))`. **Android**: `Switch(checked = …, onCheckedChange = …)`.

### Modal

A dialog shown over the page.

| Prop | Type |
| --- | --- |
| `open` | `boolean` (or a signal read) (required) |
| `onClose` | `() => void` (required) |

```tsx
// @check
import { Stack, Button, Modal, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function ConfirmDelete() {
  const open = signal(false)
  return (
    <Stack>
      <Button variant="danger" onPress={() => open.set(true)}>Delete</Button>
      <Modal open={open()} onClose={() => open.set(false)}>
        <Stack gap="md" padding={4}>
          <Text>Delete this item?</Text>
          <Button onPress={() => open.set(false)}>Cancel</Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
```

- **Web**: the browser's `<dialog>`, opened with `showModal()`. That gives you
  focus trapping, a backdrop and top-layer stacking for free. Pressing Escape
  or clicking the backdrop calls `onClose`; the dialog does not close itself,
  so your `open` signal stays accurate.
- **iOS**: a `.sheet(isPresented:)` attached to an invisible anchor view.
  Swiping the sheet down calls `onClose`.
- **Android**: `if (open) { Dialog(onDismissRequest = onClose) { … } }`.

## Animation

Import both from `@pyreon/primitives`. The versions in `@pyreon/runtime-dom`
are web-only and the native compiler flags them.

### Transition

Animates its children in and out as `show` changes.

| Prop | Type | Default |
| --- | --- | --- |
| `show` | `boolean` (or a signal read) (required) | — |
| `name` | `'fade' \| 'scale' \| 'scaleIn' \| 'slideUp' \| 'slideDown' \| 'slideLeft' \| 'slideRight'` (kebab-case such as `'slide-up'` also works) | `'fade'` |
| `duration` | `number` (ms) | `300` |
| `easing` | `'linear' \| 'ease-in' \| 'ease-out' \| 'ease-in-out'` | `'ease-in-out'` |
| `enterDuration`, `leaveDuration` | `number` (ms) | `duration` |
| `enterEasing`, `leaveEasing` | easing | `easing` |

```tsx
// @check
import { Stack, Button, Text, Transition } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function Toast() {
  const visible = signal(false)
  return (
    <Stack gap="sm">
      <Button onPress={() => visible.set(!visible())}>Toggle</Button>
      <Transition show={visible()} name="slideUp" enterDuration={150} leaveDuration={400}>
        <Text>Saved</Text>
      </Transition>
    </Stack>
  )
}
```

- **Web**: a wrapper `<div>` whose `opacity` and `transform` use CSS transitions.
- **iOS**: `ZStack { if show { Group { … }.transition(…) } }` with
  `.animation(…, value: show)`. `slideUp` is `.move(edge: .bottom)` combined
  with a fade. Separate enter/leave settings use `.asymmetric(insertion:removal:)`.
- **Android**: `AnimatedVisibility(visible = show, enter = …, exit = …)` with
  `tween` specs.
- On native, the durations must be literal numbers. Other values fall back to
  the default, and the compiler warns.

### TransitionGroup

Animates its own height when the list inside it grows or shrinks. It takes
only children.

```tsx
// @check
import { For } from '@pyreon/core'
import { Stack, Button, Text, TransitionGroup } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function GrowingList() {
  const items = signal<string[]>([])
  return (
    <Stack gap="sm">
      <Button onPress={() => items.set([...items(), `Item ${items().length + 1}`])}>Add</Button>
      <TransitionGroup>
        <For each={items()} by={(i) => i}>
          {(i) => <Text>{i}</Text>}
        </For>
      </TransitionGroup>
    </Stack>
  )
}
```

- **Web**: a wrapper whose height is measured with `ResizeObserver` and
  animated over 300ms.
- **iOS**: `VStack { … }.animation(.default, value: items.count)`.
- **Android**: `Column(Modifier.animateContentSize())`.

## WebView

Shows web content inside a native app: an inline HTML string or a page. This is
how a native app can use web-only components (ECharts, code editors, rich
tables). `data` is sent into the page and `onMessage` receives strings the
page sends back.

| Prop | Type |
| --- | --- |
| `html` | `string` (takes precedence over `src`) |
| `src` | bundled asset name, or an `http(s)` URL |
| `data` | any JSON value, re-sent when it changes |
| `onMessage` | `(message: string) => void` |

```tsx
// @check
import { WebView } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function ChartHost() {
  const points = signal([3, 1, 4, 1, 5])
  const clicked = signal('')
  return (
    <WebView
      src="chart.html"
      data={points()}
      onMessage={(m) => clicked.set(m)}
      data-testid="chart"
    />
  )
}
```

- **Web**: an `<iframe>` (`srcdoc` for `html`), full width and height.
- **iOS**: `PyreonWebView(…)` on `WKWebView`. **Android**: `PyreonWebView(…)`
  on Android's `WebView`. On both, `data` is JSON-encoded and pushed into the
  page without reloading it.
- Inside the page, `connectWebHost()` from this package reads the data
  (`window.__pyreonData`, updated on each `pyreondata` event) and sends messages
  back. See the [multiplatform guide](/docs/multiplatform) for the full pattern.

## Escape hatches

`<Web>`, `<NativeIOS>` and `<NativeAndroid>` render their children on one target
only. Use them when one platform needs a different arrangement.

```tsx
// @check
import { Stack, Text, Web, NativeIOS, NativeAndroid } from '@pyreon/primitives'

export function PlatformNote() {
  return (
    <Stack>
      <Web><Text>Running in a browser</Text></Web>
      <NativeIOS><Text>Running on iOS</Text></NativeIOS>
      <NativeAndroid><Text>Running on Android</Text></NativeAndroid>
    </Stack>
  )
}
```

- **Web**: `<Web>` renders its children without a wrapper element; the other
  two render nothing.
- **iOS** keeps only the `<NativeIOS>` branch, and **Android** only the
  `<NativeAndroid>` branch.
- The children are still ordinary primitives. You cannot write raw Swift or
  Kotlin here. For that, use
  [`useNativeModule`](/docs/multiplatform#layer-4--platform-escape-hatches).

## When to use `@pyreon/elements` instead

`@pyreon/primitives` is deliberately small and uses fixed tokens. Choose
[`@pyreon/elements`](/docs/elements) when the app is **web-only** and needs
responsive breakpoints, theme-aware CSS, pseudo-state styles or
rocketstyle-style components. Those are not available on native.

## See also

- [Multiplatform overview](/docs/multiplatform): how the compiler works, what
  runs on native, and device-test status.
- [Multiplatform pattern](/docs/patterns/multiplatform): the TypeScript subset
  that compiles to native.
- [`@pyreon/create-multiplatform`](/docs/create-multiplatform): start a new
  multiplatform app.
- [API reference](/docs/reference/primitives): the generated reference, with
  common mistakes for each API.
