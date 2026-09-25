# @pyreon/primitives

> Canonical multi-platform UI primitives — semantic vocabulary that compiles to DOM (web), SwiftUI (iOS), and Compose (Android). The Pyreon Multi-Target story.

**Status:** experimental, and further along than this line used to say. All **20** primitives now have real web implementations, and PMTC emits them for iOS + Android: the **17** canonical UI primitives, the two animation wrappers (`<Transition>` / `<TransitionGroup>`) and `<WebView>`. Per-capability native maturity (what is device-proven vs merely emitted) lives in the multiplatform tier table, not here — it moves per release and a copy in this file would go stale, which is exactly what happened to the sentence this replaced.

## What this is

`@pyreon/primitives` is the canonical UI vocabulary for Pyreon apps that target multiple platforms (web + iOS + Android). Same source. Three idiomatic outputs.

```tsx
import { Stack, Inline, Text, Button, Field } from '@pyreon/primitives'

function TodoApp() {
  return (
    <Stack gap="md" padding="md">
      <Text size="lg" weight="bold">Todos</Text>
      <Field value={draft} onChangeText={(t) => draft.set(t)} placeholder="Add..." />
      <Inline gap="sm" align="center">
        <Text>Total: {todos().length}</Text>
        <Button onPress={addTodo}>Add</Button>
      </Inline>
    </Stack>
  )
}
```

On the **web target** this compiles via `@pyreon/runtime-dom` to DOM (the implementations in `src/web/`). On **iOS** + **Android** via PMTC, the compiler intercepts JSX at compile time and emits SwiftUI / Compose primitives — the imports here are type-anchor only on native targets.

## The primitives

All 20 have a real web implementation in `src/web/` — there is no
type-definition-only tier any more. The 17 canonical UI primitives are listed
below (the compiler's `CANONICAL_PRIMITIVES` set, drift-locked against this
package's exports); the other three are `<WebView>` and the animation
wrappers `<Transition>` / `<TransitionGroup>` (see [Animation](#animation)).
Every one is documented with props, an example and web/iOS/Android notes on
the [primitives docs page](../../../docs/src/content/docs/primitives.md).

| Primitive | DOM shape | Notes |
|-----------|-----------|-------|
| `<Stack>` | `<div style="display:flex">` | Default `direction="column"` |
| `<Inline>` | `<div style="display:flex;flex-direction:row">` | Sugar for `<Stack direction="row">` |
| `<Layer>` | `<div style="position:relative;display:grid">` | Overlay container; on web, overlap needs `position:absolute` children |
| `<Scroll>` | `<div style="overflow-y:auto">` | Scrollable region; `axis="horizontal"` scrolls sideways |
| `<Spacer>` | `<div style="flex:1 1 auto">` | Fills the remaining space; no props |
| `<Text>` | `<span>` | Tokenized color / size / weight / truncate |
| `<Heading>` | `<h1>`–`<h6>` | `level` selects the tag |
| `<Image>` | `<img>` | Tokenized sizing + fit |
| `<Audio>` | `<audio>` | Sound playback; no visible UI and no `controls` prop |
| `<Video>` | `<video>` | AV playback; device-proven on both native targets |
| `<Icon>` | `<svg><use href="#name">` | Named icon, tokenized size; bring your own SVG sprite on web |
| `<Button>` | `<button>` | 4 variants (primary/secondary/ghost/danger) |
| `<Press>` | `<div role="button" tabindex="0">` | ARIA-button keyboard contract + long-press polyfill |
| `<Link>` | `<a href>` | Router-agnostic: `init({ navigate })` upgrades internal links to SPA navigation |
| `<Field>` | `<input>` | `kind` prop selects type (text/email/password/etc.) |
| `<Toggle>` | `<input type="checkbox" role="switch">` | Switch semantics |
| `<Modal>` | `<dialog>` via `showModal()` | Focus trap, backdrop and Escape from the browser; closing always goes through `onClose` |

Also exported: `<WebView>` (`<iframe>` on web, `WKWebView` / Android `WebView` natively — embedded web content with a data bridge).

Plus the escape hatches — `<Web>` / `<NativeIOS>` / `<NativeAndroid>` — for the
cases a canonical primitive deliberately does not cover.

## Animation

| Wrapper | DOM shape | iOS | Android |
|---------|-----------|-----|---------|
| `<Transition>` | `<div>` + CSS transition longhands | `.transition(…)` + `.animation(_:value:)` | `AnimatedVisibility(enter =, exit =)` |
| `<TransitionGroup>` | `<div>` + measured height transition | `.animation(.default, value: list.count)` | `Modifier.animateContentSize()` |

```tsx
import { Transition } from '@pyreon/primitives'

<Transition name="slide-up" show={isOpen()} enterDuration={200} leaveDuration={400}>
  <Panel />
</Transition>
```

`name` picks a preset every target translates natively — `fade`, `scale-in`,
`slide-up`, `slide-down`, `slide-left`, `slide-right` (camelCase spellings
accepted too). Direction is the direction of **travel**, so a `slide-up` rises
*into* place from below. `duration` / `easing` are symmetric;
`enterDuration` / `leaveDuration` / `enterEasing` / `leaveEasing` override one
side and fall back to the symmetric value.

Import them from **here**, not from `@pyreon/runtime-dom`: that package is
web-only, so PMTC warns on it even though the tag itself lowers fine.

Two web behaviours worth knowing. The hidden state is `display:none` on the
wrapper rather than an unmount, so an animation wrapper never gates its children
out of SSR and a hidden `<Transition>` contributes no flex `gap`. And only
transition *longhands* are ever assigned, so a consumer's own
`transition-delay` survives.

## Design principles

1. **Semantic names, not platform names.** `<Stack>` not `<View>` / `<VStack>` / `<div>`. Name describes intent.
2. **One canonical event name per concept.** `onPress` everywhere (not `onClick` on web + `action:` on iOS).
3. **Tokens-first styling.** `padding={4}` / `gap="md"` resolve via theme. No raw pixels.
4. **Pyreon idioms preserved.** Existing `<For>` / `<Show>` / `<Match>` control flow stays.
5. **Minimal first; expand from real-world usage.** 17 canonical primitives; more when demanded.

## Per-platform import resolution

`import { Stack } from '@pyreon/primitives'`:

- **Web**: real package, real `ComponentFn`, renders DOM.
- **iOS / Android (via PMTC)**: compiler intercepts the JSX call site BEFORE the runtime is invoked. The import is type-anchor only — `Stack` is never actually called on native targets.

Same source. Three idiomatic outputs.

## Style system (v1 scope)

Tokens-first. No responsive props in v1 (animation is `<Transition>` / `<TransitionGroup>`, above). Apps that need rich responsive web layouts use `@pyreon/elements` directly.

| Prop | Type | Example |
|------|------|---------|
| `padding` / `margin` / `gap` | `number` (theme.space index 0–9) OR `"xs"\|"sm"\|"md"\|"lg"\|"xl"` | `padding={4}` → 16px |
| `color` | `"text"\|"surface"\|"primary"\|...` | `color="primary"` → blue-600 |
| `background` | theme key | `background="surface"` → white |
| `align` | `"start"\|"center"\|"end"\|"stretch"` | flex `alignItems` |
| `justify` | `"start"\|"center"\|"end"\|"between"\|"around"\|"evenly"` | flex `justifyContent` |
| `radius` | `"none"\|"sm"\|"md"\|"lg"\|"full"` | border-radius |

## Tests

```bash
cd packages/core/primitives
bun run test            # happy-dom unit tests (token resolution)
bun run test:browser    # real-Chromium browser smoke
```

## Related

- **End-user docs**: [`docs/src/content/docs/multiplatform.md`](../../../docs/src/content/docs/multiplatform.md)
- **`.agents/guides/multiplatform/README.md`** — the PMTC multi-target architecture
- **Phase B PRs** (PMTC emit) — extend `packages/native/compiler/src/canonical-primitives.ts` mapping table
- **`@pyreon/elements`** — web-only rich primitive layer (rocketstyle/styler-coupled). Stays as-is.

## License

MIT — see [LICENSE](../../../LICENSE) at repo root.
