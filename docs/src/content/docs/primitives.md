---
title: '@pyreon/primitives'
description: 'Canonical multi-platform UI primitives — semantic vocabulary that compiles to DOM, SwiftUI, and Compose from one source.'
---

# @pyreon/primitives

Canonical multi-platform UI primitives — semantic vocabulary that compiles to DOM (web), SwiftUI (iOS), and Compose (Android). Same `.tsx` source, three idiomatic outputs.

:::warning{title="Experimental"}
All 17 canonical primitives now ship with real web implementations, and 16 of them (everything except `<Audio>`) also lower to native SwiftUI/Compose via PMTC's `canonical-primitives` table. Still marked experimental while the API surface stabilizes from real-app usage. See the [multiplatform overview](/docs/multiplatform) for the full PMTC roadmap.
:::

## Install

```sh
bun add @pyreon/primitives @pyreon/runtime-dom
```

`@pyreon/runtime-dom` is a peer dep — the web implementations emit `_tpl()` calls that need the runtime.

## Quick start

```tsx
import { Stack, Inline, Text, Button, Field } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

function TodoApp() {
  const draft = signal('')
  const todos = signal<string[]>([])

  return (
    <Stack gap="md" padding="md">
      <Text size="lg" weight="bold">Todos</Text>
      <Field
        value={() => draft()}
        onChangeText={(t) => draft.set(t)}
        placeholder="Add..."
      />
      <Inline gap="sm" align="center">
        <Text>Total: {() => todos().length}</Text>
        <Button
          onPress={() => {
            todos.update((xs) => [...xs, draft()])
            draft.set('')
          }}
        >
          Add
        </Button>
      </Inline>
    </Stack>
  )
}
```

<Example file="./examples/primitives/todo-app" title="Quick start — live" />

- **Web target** — compiles via `@pyreon/runtime-dom` to DOM (the implementations in `src/web/`).
- **iOS / Android via PMTC** — the compiler intercepts JSX BEFORE the runtime is invoked and emits SwiftUI / Compose. The import is type-anchor only on native targets; `Stack` is never actually called.

## Why this exists

The competing alternatives all force a choice:

- **React Native** — separate JS runtime, separate ecosystem, no real SwiftUI/Compose output.
- **`react-strict-dom`** — close to canonical but DOM-first vocabulary leaks (`<div>`, `style={{}}`).
- **Compose Multiplatform / Flutter** — leave the web behind.

Pyreon's split: `@pyreon/elements` stays web-only-rich (rocketstyle/styler-coupled, full responsive design). `@pyreon/primitives` is the canonical multiplatform layer — minimal vocabulary, fixed token-based style props, no responsive arrays. Different architectural tiers; no naming collision because imports are explicit.

## All 17 primitives ship with real web runtime

| Primitive | DOM shape | Native lowering (PMTC) | Notes |
|-----------|-----------|-------------------------|-------|
| `<Stack>` | `<div style="display:flex">` | SwiftUI `VStack` / Compose `Column` | Default `direction="column"`; `direction="row"` switches the emitted native container too. |
| `<Inline>` | `<div style="display:flex;flex-direction:row">` | SwiftUI `HStack` / Compose `Row` | Sugar for `<Stack direction="row">`. |
| `<Layer>` | `<div style="position:relative; display:grid">` | SwiftUI `ZStack` / Compose `Box` | Stacked/overlapping children. |
| `<Scroll>` | `<div style="overflow-y:auto">` (or `overflow-x`) | SwiftUI `ScrollView` / Compose `Column` + `verticalScroll` | |
| `<Spacer>` | `<div>` | SwiftUI `Spacer` | Flexible gap-filler. |
| `<Text>` | `<span>` | SwiftUI `Text` / Compose `Text` | Tokenized color / size / weight / truncate. |
| `<Heading>` | `<h1>`–`<h6>` (explicit size + weight, not the browser's inconsistent defaults) | SwiftUI `Text` (`.font(.largeTitle)` etc. at emit time) | |
| `<Image>` | `<img>` | SwiftUI `Image` / Compose `Image` | |
| `<Video>` | `<video>` | SwiftUI `PyreonVideoPlayer` | |
| `<Audio>` | `<audio>` | — (web-only; no native lowering yet) | |
| `<Icon>` | `<svg><use href="#name" /></svg>` | SwiftUI `Image` (`systemName:` from `name`) | Semantic name, per-platform icon system. |
| `<Button>` | `<button>` | SwiftUI `Button` / Compose (canonical primitives table) | 4 variants — `primary` / `secondary` / `ghost` / `danger`. |
| `<Press>` | `<div role="button" tabindex="0">` | SwiftUI `Button` (chrome-less, trailing-closure form) | ARIA-button keyboard contract + long-press polyfill. |
| `<Link>` | `<a href>` (+ SPA-nav click interception when wired) | SwiftUI `NavigationLink` | Router-agnostic — plain anchor until `init({ navigate })`. |
| `<Field>` | `<input>` | SwiftUI `TextField` (`SecureField` when `kind="password"`) | `kind` prop selects `type` (`text` / `email` / `password` / `number` / `search`). |
| `<Toggle>` | `<input type="checkbox" role="switch">` | SwiftUI `Toggle` / Compose `Switch` | |
| `<Modal>` | `<dialog>` via `showModal()` / `close()` | SwiftUI `.sheet(isPresented:)` | |

`<Audio>` is the one primitive with no PMTC native lowering yet — every other primitive above lowers to both SwiftUI and Compose via `canonical-primitives.ts` (`packages/native/compiler/src/canonical-primitives.ts`).

## Design principles

1. **Semantic names, not platform names** — `<Stack>` not `<View>` / `<VStack>` / `<div>`. Name describes intent.
2. **One canonical event name per concept** — `onPress` everywhere (not `onClick` on web + `action:` on iOS).
3. **Tokens-first styling** — `padding={4}` / `gap="md"` resolve via theme. No raw pixels in source.
4. **Pyreon idioms preserved** — existing `<For>` / `<Show>` / `<Match>` control flow stays.
5. **Minimal first; expand from real-world usage** — 17 primitives shipped so far; more when demanded.

## Style props (v1)

Tokens-first. No responsive arrays. No animation primitives. Apps needing rich responsive web layouts use [`@pyreon/elements`](/docs/elements) directly.

| Prop | Type | Example |
|------|------|---------|
| `padding` / `margin` / `gap` | `number` (theme.space index) OR `"sm" \| "md" \| "lg"` | `padding={4}` → 16px |
| `color` | `"text" \| "surface" \| "primary" \| ...` | `color="primary"` → blue-600 |
| `background` | theme key | `background="surface"` → white |
| `align` | `"start" \| "center" \| "end" \| "stretch"` | flex `alignItems` |
| `justify` | `"start" \| "center" \| "end" \| "between" \| "around" \| "evenly"` | flex `justifyContent` |
| `radius` | `"none" \| "sm" \| "md" \| "lg" \| "full"` | border-radius |

## When to reach for `@pyreon/primitives` vs `@pyreon/elements`

Use `@pyreon/primitives` if:

- You're shipping to multiple platforms (web + iOS + Android), OR
- You want a minimal "Stack/Inline/Text/Button" vocabulary without a styling layer, OR
- You're prototyping and don't yet need rocketstyle's multi-dimensional styling.

Use [`@pyreon/elements`](/docs/elements) if:

- You're web-only AND need rich responsive props, breakpoints, design tokens, theme-aware CSS.
- You need rocketstyle-shaped components (`.attrs()` / `.theme()` / `.config()`).
- You want hover/focus/active pseudo-state CSS managed by the framework.

The two layers compose: an `@pyreon/primitives` `<Stack>` can wrap rocketstyle-styled children on the web target. PMTC will intercept the `<Stack>` JSX on native targets and emit SwiftUI/Compose; the styled children inside it would need their own multiplatform story (rocketstyle is web-only).

## See also

- [Multiplatform overview](/docs/multiplatform) — the PMTC architecture and the full 5-phase roadmap.
- [`@pyreon/elements`](/docs/elements) — web-only rich primitive layer.
- [`@pyreon/create-multiplatform`](/docs/create-multiplatform) — scaffold a multiplatform Pyreon app.
