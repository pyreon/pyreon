# @pyreon/hooks

16 signal-based reactive utilities for Pyreon UI interactions, DOM observation, accessibility, and theming.

All hooks use `signal()` for internal state and return reactive getters. Components are plain functions that run once — no `useCallback`/`useMemo` needed.

## Installation

```bash
bun add @pyreon/hooks
```

## Hooks

### Interaction

#### useHover

Tracks hover state via mouse enter/leave events.

```ts
import { useHover } from '@pyreon/hooks'

const { hover, onMouseEnter, onMouseLeave } = useHover()
```

#### useFocus

Tracks focus state via focus/blur events.

```ts
import { useFocus } from '@pyreon/hooks'

const { focused, onFocus, onBlur } = useFocus()
```

#### useClickOutside

Calls handler when a click occurs outside the referenced element.

```ts
import { useClickOutside } from '@pyreon/hooks'

useClickOutside(elementRef, () => setOpen(false))
```

#### useScrollLock

Locks page scroll by setting `overflow: hidden` on `document.body`.

```ts
import { useScrollLock } from '@pyreon/hooks'

useScrollLock(isModalOpen)
```

#### useKeyboard

Listens for a specific keyboard key.

```ts
import { useKeyboard } from '@pyreon/hooks'

useKeyboard('Escape', () => setOpen(false))
```

#### useFocusTrap

Traps Tab/Shift+Tab focus within a container. Essential for modals and dialogs.

```ts
import { useFocusTrap } from '@pyreon/hooks'

useFocusTrap(containerRef, isOpen)
```

### DOM & Observers

#### useElementSize

Tracks element `width` and `height` via `ResizeObserver`.

```ts
import { useElementSize } from '@pyreon/hooks'

const { ref, width, height } = useElementSize()
```

#### useIntersection

`IntersectionObserver` wrapper for visibility detection.

```ts
import { useIntersection } from '@pyreon/hooks'

const { ref, entry } = useIntersection({ threshold: 0.5 })
const isVisible = entry?.isIntersecting
```

#### useWindowResize

Tracks viewport dimensions with throttled updates.

```ts
import { useWindowResize } from '@pyreon/hooks'

const { width, height } = useWindowResize({ throttleDelay: 300 })
```

### Responsive

#### useMediaQuery

Subscribes to a CSS media query and returns whether it matches.

```ts
import { useMediaQuery } from '@pyreon/hooks'

const isDesktop = useMediaQuery('(min-width: 1024px)')
```

#### useBreakpoint

Returns the currently active breakpoint name from the theme context.

```ts
import { useBreakpoint } from '@pyreon/hooks'

const bp = useBreakpoint() // "xs" | "sm" | "md" | "lg" | "xl" | undefined
```

#### useColorScheme

Returns the user's preferred color scheme. Pairs with rocketstyle's `mode`.

```ts
import { useColorScheme } from '@pyreon/hooks'

const scheme = useColorScheme() // "light" | "dark"
```

#### useReducedMotion

Returns `true` when the user prefers reduced motion.

```ts
import { useReducedMotion } from '@pyreon/hooks'

const reduced = useReducedMotion()
const duration = reduced ? 0 : 300
```

### State

#### useToggle

Boolean state with `toggle`, `setTrue`, and `setFalse` helpers.

```ts
import { useToggle } from '@pyreon/hooks'

const { value, toggle, setTrue, setFalse } = useToggle(false)
```

#### usePrevious

Returns the value from the previous evaluation.

```ts
import { usePrevious } from '@pyreon/hooks'

const prev = usePrevious(count)
```

#### useDebouncedValue

Returns a debounced version of the value that only updates after `delay` ms of inactivity.

```ts
import { useDebouncedValue } from '@pyreon/hooks'

const debouncedSearch = useDebouncedValue(searchTerm, 300)
```

## Gotchas

- Every hook returns `Signal<T>` / `Computed<T>` / accessor objects — never plain values. Read by calling: `size().width`, `bp().md`, `online()`.
- Every hook is SSR-safe — browser API access is guarded inside `onMount`. Do NOT wrap hook calls in `typeof window !== 'undefined'`; the hook does it for you.
- Never reach for `addEventListener` / `removeEventListener` directly — use `useEventListener`. Same for observers and timers.
- `useControllableState` is the canonical controlled/uncontrolled pattern. Every `@pyreon/ui-primitives` component uses it. Pass `value` and `defaultValue` as FUNCTIONS.
- `useFocusTrap` requires a reactive `active` boolean — a static `true` traps focus forever. Always pass `() => isOpen()`.
- `useBreakpoint` reads theme breakpoints; `useMediaQuery` is the raw escape hatch for one-off queries.
- `useInfiniteScroll` sentinel must be inside the scrollable container — `overflow: hidden` with no scroll means IntersectionObserver never fires.
- `useDialog` — the `<dialog>` must be in the initial render (not behind `<Show>`) so the ref callback fires before `dialog.open()`.
- `useDebouncedValue` — the debounced signal holds the OLD value during the debounce window.

## Peer Dependencies

| Package            | Version  |
| ------------------ | -------- |
| @pyreon/core       | >= 0.0.1 |
| @pyreon/reactivity | >= 0.0.1 |
| @pyreon/styler     | >= 0.0.1 |
| @pyreon/ui-core    | >= 0.0.1 |

## License

MIT
