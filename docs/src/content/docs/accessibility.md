---
title: Accessibility
---

# Accessibility

Pyreon is built so that **accessible UI is the default, not an afterthought**. Most of the work — label/error wiring, focus management, keyboard navigation, correct ARIA serialization — happens automatically when you use the framework's primitives. Where it can't be automatic, it's a one-line opt-in.

This page is the map: what you get for free, and how to reach for the rest.

## What you get out of the box

| Concern | How it's covered | Where |
| --- | --- | --- |
| Form labels / errors / `aria-describedby` | Auto-wired by `useField` / `<Form>` | `@pyreon/form` |
| Modal focus trap + restore | Automatic for modal overlays | `@pyreon/elements`, `@pyreon/ui-primitives` |
| Keyboard navigation | Built into every interactive headless primitive | `@pyreon/ui-primitives` |
| Reduced motion | Animations auto-respect `prefers-reduced-motion` | `@pyreon/kinetic` |
| Correct ARIA serialization | Boolean `aria-*` render as `"true"`/`"false"`, not presence-only | `@pyreon/runtime-dom`, `@pyreon/runtime-server` |
| Typed `role` | `AriaRole` autocomplete on every element | `@pyreon/core` |
| Live-region announcements | `announce()` — zero setup | `@pyreon/a11y` |
| SPA route announcements | `<RouteAnnouncer>` — one line | `@pyreon/a11y/router` |
| Multi-platform a11y | `accessibilityLabel` / `accessibilityHidden` → web + iOS + Android | `@pyreon/primitives` |

## Forms — automatic label, error, and description wiring

`@pyreon/form`'s `useField` / `<Form>` generate the ARIA relationships every accessible form needs — you don't hand-wire `id` / `for` / `aria-describedby` / `aria-invalid`:

```tsx
import { Form, useField } from '@pyreon/form'

function EmailField() {
  // register() returns a stable id + reactive aria-invalid / aria-describedby
  const { inputProps, labelProps, errorProps, showError } = useField('email')
  return (
    <div>
      <label {...labelProps}>Email</label>
      <input {...inputProps} />
      {() => showError() && <span {...errorProps()}>Enter a valid email</span>}
    </div>
  )
}
```

The label is associated with the input, the error is linked via `aria-describedby`, and `aria-invalid` flips reactively — all from `useField('email')`.

## Screen-reader announcements

### `announce()` — status & errors, zero setup

`announce(message)` speaks to screen-reader users through an `aria-live` region that's created lazily on first call. No provider, no component to mount, SSR-safe (a no-op on the server):

```ts
import { announce } from '@pyreon/a11y'

announce('Settings saved')                          // polite (default)
announce('Connection lost', { politeness: 'assertive' }) // interrupts
announce('Copied to clipboard', { clearAfter: 1000 })
```

Use it for things sighted users perceive visually but assistive-tech users need spoken: a saved toast, a validation error, a "5 results" count.

### `<RouteAnnouncer>` — single-page navigations

Client-side navigations change the URL and DOM but fire no page-load event, so screen readers never announce the new page. Drop one `<RouteAnnouncer>` near your router root to close that gap:

```tsx
import { RouteAnnouncer } from '@pyreon/a11y/router'

<RouterProvider router={router}>
  <RouteAnnouncer />
  <RouterView />
</RouterProvider>
```

It announces each route's `meta.title` (or `"Navigated to <path>"`) to a polite live region. Customise with `format`, or use the `useRouteAnnouncer()` hook form. The router dependency lives only in the `@pyreon/a11y/router` subpath, so importing just `announce` / `VisuallyHidden` from the main entry stays router-free.

### `<LiveRegion>` — declarative status

`announce()` is fire-and-forget; `<LiveRegion>` is the declarative complement for status that lives somewhere specific in your layout — a form's validation summary, a "Saving…" → "Saved" indicator, an async result count. Place it once and drive its children with a signal; the browser announces every change automatically — no `announce()` call, no effect:

```tsx
import { LiveRegion } from '@pyreon/a11y'

<LiveRegion>{() => status()}</LiveRegion>                    // polite (default → role="status")
<LiveRegion politeness="assertive">{() => error()}</LiveRegion> // interrupts (→ role="alert")
<LiveRegion visible>{() => saveState()}</LiveRegion>         // also shown on screen
```

Screen-reader-only by default (it reuses `VisuallyHidden`'s clipping), `visible` opts into on-screen text, and `politeness="off"` silences it without unmounting. It renders on the server too, so the region exists at hydration and the very first reactive update is announced. Read it inside the accessor (`{() => status()}`) so the region tracks the signal.

## Visually-hidden content & stable IDs

```tsx
import { VisuallyHidden, createA11yId } from '@pyreon/a11y'

// Off-screen but in the accessibility tree (unlike display:none):
<button><SearchIcon /><VisuallyHidden>Search</VisuallyHidden></button>

// Stable, SSR-safe ids for ARIA relationships (no hydration mismatch):
const hintId = createA11yId('hint')
<input aria-describedby={hintId} />
<span id={hintId}>Must be at least 8 characters</span>
```

## Skip to content (WCAG 2.4.1)

Render `<SkipLink>` as the first focusable element on the page. It's clipped out of view until a keyboard user presses Tab, then appears at the top-left; activating it moves **both scroll and keyboard focus** to your main landmark, so the next Tab continues from the content — past the repeated nav.

```tsx
import { SkipLink } from '@pyreon/a11y'

<body>
  <SkipLink href="#main">Skip to content</SkipLink>
  <nav>…</nav>
  <main id="main">…</main>
</body>
```

It adds a programmatic-focus `tabindex` to the target automatically when it isn't natively focusable, so a plain `<main id="main">` just works. Restyle the focused appearance by passing a `style` object (it merges over the built-in reveal styles); the hide-until-focus behavior stays intact.

## Focus management — modals trap & restore automatically

A modal that doesn't trap focus lets keyboard and screen-reader users tab out to the inert background. Pyreon's modal surfaces handle the full WAI-ARIA dialog focus lifecycle for you:

- **`<Overlay type="modal">`** (`@pyreon/elements`) and the headless **`ModalBase`** (`@pyreon/ui-primitives`) move focus **into** the dialog on open, **trap** Tab / Shift+Tab within it while open, and **restore** focus to the opener on close.
- The canonical multi-platform **`<Modal>`** (`@pyreon/primitives`) renders a native `<dialog>` on web, getting the trap + inert background from the platform.

No wiring required — open a modal and focus is managed correctly.

For a modal that interrupts with an urgent, response-requiring message (a confirmation, a destructive-action warning, an error), pass `alert` to `ModalBase` — it switches `role="dialog"` to `role="alertdialog"`, which screen readers announce more assertively. General dialogs leave it off. Pair it with `initialFocus={() => cancelRef()}` so focus lands on the **safe** choice (Cancel) on open — an accidental Enter then can't confirm the destructive action. By default the dialog focuses its first focusable descendant.

## Keyboard navigation — built into the primitives

Every interactive headless primitive in `@pyreon/ui-primitives` ships full keyboard support, so a keyboard user can operate it the moment you render it:

- **Calendar** — Arrow keys move by day / week, Home/End to week edges, PageUp/PageDown by month (Shift = year), with WAI-ARIA grid roving focus.
- **Color picker** — Arrow keys step the hue / saturation-brightness / alpha sliders, PageUp/Down for large steps, Home/End to min/max.
- **Tabs**, **Radio group**, **Combobox**, **Tree** — arrow-key navigation between items per their ARIA roles.
- **File upload** — the drop zone is a real `role="button"` tab stop: Enter/Space (or a click) opens the native file picker, with `aria-label`, `aria-disabled`, and `aria-busy` carried automatically.

Pair the primitive's `getDayProps` / slider props / item props / `dropZoneProps` (which already carry `onKeyDown` + `tabIndex` + the right ARIA) onto your elements and the keyboard model comes with them.

## Multi-platform accessibility

The canonical primitives in `@pyreon/primitives` carry a **platform-neutral** a11y vocabulary — write it once, each target emits its native model:

| Prop | Web | iOS (SwiftUI) | Android (Compose) |
| --- | --- | --- | --- |
| `accessibilityLabel="…"` | `aria-label` | `.accessibilityLabel(…)` | `.semantics { contentDescription = … }` |
| `accessibilityHidden` | `aria-hidden="true"` | `.accessibilityHidden(true)` | `.clearAndSetSemantics { }` |

```tsx
import { Button } from '@pyreon/primitives'

<Button onPress={addToCart} accessibilityLabel="Add to cart">
  <CartIcon />
</Button>
```

Prefer these over raw `aria-*` (which is web-only) so the same component is accessible on every target.

## Reduced motion

`@pyreon/kinetic` animations (`<Transition>`, `<Collapse>`, the `kinetic()` wrapper) automatically respect the user's `prefers-reduced-motion` setting — when reduced motion is requested, transitions resolve instantly instead of animating. No configuration needed.

## Correct ARIA by construction

- **Boolean ARIA attributes serialize correctly.** `aria-checked={true}` renders as `aria-checked="true"`, not the presence-only `aria-checked=""` that assistive tech ignores — on both the client renderer and SSR.
- **`role` is typed.** The `role` attribute is `AriaRole`, so you get autocomplete for the ~70 valid roles and a type error on a typo, while still accepting any string for forward-compatibility.

## Linting for the rest

Some accessibility checks are project conventions rather than framework behaviour — `@pyreon/lint` ships them as **opt-in** best-practice rules (off by default, no noise):

- `pyreon/require-img-alt` — every `<img>` needs `alt`
- `pyreon/primitive-media-needs-label` — the multi-platform analog: a canonical `<Image>` / `<Icon>` from `@pyreon/primitives` needs an `accessibilityLabel` (or `alt`/`aria-label`), or `accessibilityHidden` if decorative — so a label-less media primitive is caught on web, iOS, and Android alike (auto-gated on the `@pyreon/primitives` dependency)
- `pyreon/img-requires-dimensions` — intrinsic `width`/`height` to avoid layout shift
- `pyreon/no-positive-tabindex`, `pyreon/no-autofocus`, `pyreon/no-redundant-role`, `pyreon/anchor-is-valid`, `pyreon/heading-order`, `pyreon/color-contrast`, …

Enable the whole set with the `best-practices` preset, or per-rule in `.pyreonlintrc.json`:

```json
{
  "rules": {
    "pyreon/require-img-alt": "error",
    "pyreon/no-positive-tabindex": "error"
  }
}
```

Several are auto-fixable (`pyreon-lint --fix`), and each carries a prescriptive message so AI assistants and humans alike get the fix, not just the flag.

## Summary

Reach for the framework primitives — `@pyreon/form`, `@pyreon/elements` / `@pyreon/ui-primitives`, `@pyreon/primitives`, `@pyreon/kinetic` — and accessibility comes with them. Add `announce()`, `<LiveRegion>`, and a `<RouteAnnouncer>` for the dynamic bits, turn on the opt-in lint rules to guard the conventions, and you have an accessible app by default.
