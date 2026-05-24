# @pyreon/primitives

> Canonical multi-platform UI primitives — semantic vocabulary that compiles to DOM (web), SwiftUI (iOS), and Compose (Android). The Pyreon Multi-Target story.

**Status:** experimental. Phase A of a 5-phase rollout. 6 of 16 primitives have web implementations; the rest ship in follow-ups.

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

## Phase A scope (this package)

**6 primitives with real web implementations**:

| Primitive | DOM shape | Notes |
|-----------|-----------|-------|
| `<Stack>` | `<div style="display:flex">` | Default `direction="column"` |
| `<Inline>` | `<div style="display:flex;flex-direction:row">` | Sugar for `<Stack direction="row">` |
| `<Text>` | `<span>` | Tokenized color / size / weight / truncate |
| `<Button>` | `<button>` | 4 variants (primary/secondary/ghost/danger) |
| `<Press>` | `<div role="button" tabindex="0">` | ARIA-button keyboard contract + long-press polyfill |
| `<Field>` | `<input>` | `kind` prop selects type (text/email/password/etc.) |

**10 more primitives** have type definitions but no web runtime yet (`<Layer>`, `<Scroll>`, `<Spacer>`, `<Heading>`, `<Image>`, `<Icon>`, `<Link>`, `<Toggle>`, `<Modal>`). They ship in follow-up PRs as real apps demand each.

## Design principles

1. **Semantic names, not platform names.** `<Stack>` not `<View>` / `<VStack>` / `<div>`. Name describes intent.
2. **One canonical event name per concept.** `onPress` everywhere (not `onClick` on web + `action:` on iOS).
3. **Tokens-first styling.** `padding={4}` / `gap="md"` resolve via theme. No raw pixels.
4. **Pyreon idioms preserved.** Existing `<For>` / `<Show>` / `<Match>` control flow stays.
5. **Minimal first; expand from real-world usage.** 16 primitives; more when demanded.

## Per-platform import resolution

`import { Stack } from '@pyreon/primitives'`:

- **Web**: real package, real `ComponentFn`, renders DOM.
- **iOS / Android (via PMTC)**: compiler intercepts the JSX call site BEFORE the runtime is invoked. The import is type-anchor only — `Stack` is never actually called on native targets.

Same source. Three idiomatic outputs.

## Style system (v1 scope)

Tokens-first. No responsive props in v1. No animation primitives in v1. Apps that need rich responsive web layouts use `@pyreon/elements` directly.

| Prop | Type | Example |
|------|------|---------|
| `padding` / `margin` / `gap` | `number` (theme.space index) OR `"sm"\|"md"\|"lg"` | `padding={4}` → 16px |
| `color` | `"text"\|"surface"\|"primary"\|...` | `color="primary"` → blue-600 |
| `background` | theme key | `background="surface"` → white |
| `align` | `"start"\|"center"\|"end"\|"stretch"` | flex `alignItems` |
| `justify` | `"start"\|"center"\|"end"\|"between"\|"around"\|"evenly"` | flex `justifyContent` |
| `radius` | `"none"\|"sm"\|"md"\|"lg"\|"full"` | border-radius |

## Tests

```bash
cd packages/core/primitives
bun run test            # happy-dom unit tests (token resolution)
bun run test:browser    # real-Chromium browser smoke (6 primitives end-to-end)
```

## Related

- **Full architectural plan**: [`.claude/plans/multiplatform-architecture.md`](../../../.claude/plans/multiplatform-architecture.md)
- **End-user docs**: [`docs/docs/multiplatform.md`](../../../docs/docs/multiplatform.md)
- **CLAUDE.md** "PMTC Multi-Target Architecture" section
- **Phase B PRs** (PMTC emit) — extend `packages/native/compiler/src/canonical-primitives.ts` mapping table
- **`@pyreon/elements`** — web-only rich primitive layer (rocketstyle/styler-coupled). Stays as-is.

## License

MIT — see [LICENSE](../../../LICENSE) at repo root.
