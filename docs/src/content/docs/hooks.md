---
title: Hooks
description: Collection of reactive hooks for DOM interactions, media queries, focus management, and more.
---

`@pyreon/hooks` provides a comprehensive set of reactive hooks built on Pyreon's signal-based reactivity system. Each hook returns reactive signals that automatically update your UI when values change. All hooks that attach DOM listeners use `onMount`/`onUnmount` for proper lifecycle management, so they must be called inside a Pyreon component.

<PackageBadge name="@pyreon/hooks" href="/docs/hooks" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/hooks
```

```bash [bun]
bun add @pyreon/hooks
```

```bash [pnpm]
pnpm add @pyreon/hooks
```

```bash [yarn]
yarn add @pyreon/hooks
```

:::

## useToggle

A simple boolean toggle with convenience methods. Useful for disclosure patterns, visibility toggles, and binary UI state.

### Signature

```ts
function useToggle(initial?: boolean): UseToggleResult
```

### Parameters

| Parameter | Type      | Default | Description          |
| --------- | --------- | ------- | -------------------- |
| `initial` | `boolean` | `false` | Initial toggle state |

### Returns: `UseToggleResult`

| Property   | Type            | Description             |
| ---------- | --------------- | ----------------------- |
| `value`    | `() => boolean` | Reactive boolean getter |
| `toggle`   | `() => void`    | Flip the current value  |
| `setTrue`  | `() => void`    | Set to `true`           |
| `setFalse` | `() => void`    | Set to `false`          |

### Example

```ts
// @check
import { useToggle } from '@pyreon/hooks'

const { value, toggle, setTrue, setFalse } = useToggle(false)

value() // false
toggle()
value() // true
setFalse()
value() // false
setTrue()
value() // true
```

<Example file="./examples/hooks/usetoggle-disclosure-pattern" title="useToggle — disclosure pattern" />

### Disclosure Pattern

```tsx
import { defineComponent } from '@pyreon/core'
import { useToggle } from '@pyreon/hooks'

const Accordion = defineComponent<{ title: string }>((props) => {
  const { value: isOpen, toggle } = useToggle(false)

  return () => (
    <div class="accordion">
      <button onClick={toggle} aria-expanded={isOpen()}>
        {props.title}
        <span class={isOpen() ? 'arrow-up' : 'arrow-down'} />
      </button>
      {isOpen() && (
        <div class="accordion-content" role="region">
          {props.children}
        </div>
      )}
    </div>
  )
})
```

### Modal Visibility

```tsx
const ModalTrigger = defineComponent(() => {
  const { value: isOpen, setTrue: open, setFalse: close } = useToggle()

  return () => (
    <div>
      <button onClick={open}>Open Modal</button>
      {isOpen() && <Modal onClose={close} />}
    </div>
  )
})
```

## useCounter

The numeric companion to `useToggle`. Returns a reactive `count` signal plus `inc` / `dec` / `set` / `reset` helpers; when `min` / `max` are given, every write (including the initial value) is clamped into range.

### Signature

```ts
function useCounter(
  initial?: number,
  options?: { min?: number; max?: number },
): {
  count: Signal<number>
  inc: (delta?: number) => void
  dec: (delta?: number) => void
  set: (value: number) => void
  reset: () => void
}
```

### Example

<Example file="./examples/hooks/usecounter-clamped" title="useCounter — clamped counter" />

```tsx
import { useCounter } from '@pyreon/hooks'

function Quantity() {
  const { count, inc, dec } = useCounter(1, { min: 1, max: 99 })
  return (
    <div>
      <button onClick={() => dec()}>−</button>
      <span>{count}</span>
      <button onClick={() => inc()}>+</button>
    </div>
  )
}
```

## usePrevious

Track the previous value of a reactive getter. Returns `undefined` on the first read, then returns the prior value each time the source changes.

### Signature

```ts
function usePrevious<T>(getter: () => T): () => T | undefined
```

### Parameters

| Parameter | Type      | Description                                               |
| --------- | --------- | --------------------------------------------------------- |
| `getter`  | `() => T` | A reactive getter (signal or function that reads signals) |

### Returns

`() => T | undefined` -- a reactive getter returning the previous value, or `undefined` before the first change.

### Example

```ts
import { usePrevious } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

const count = signal(0)
const prev = usePrevious(count)

prev() // undefined (no previous value yet)
count.set(1)
prev() // 0
count.set(5)
prev() // 1
count.set(5) // same value
prev() // 5 (tracks every call, even if value doesn't change)
```

<Example file="./examples/hooks/useprevious-lag-swatches" title="usePrevious — the previous swatch lags one step" />

### Animation Direction Example

```tsx
const Carousel = defineComponent(() => {
  const currentSlide = signal(0)
  const previousSlide = usePrevious(currentSlide)

  const direction = () => {
    const prev = previousSlide()
    if (prev === undefined) return 'none'
    return currentSlide() > prev ? 'forward' : 'backward'
  }

  return () => (
    <div class={`carousel slide-${direction()}`}>
      <div class="slide">{slides[currentSlide()]}</div>
      <button onClick={() => currentSlide.update((n) => n - 1)}>Prev</button>
      <button onClick={() => currentSlide.update((n) => n + 1)}>Next</button>
    </div>
  )
})
```

### Undo Pattern

```tsx
const Editor = defineComponent(() => {
  const text = signal('')
  const previousText = usePrevious(text)

  const undo = () => {
    const prev = previousText()
    if (prev !== undefined) {
      text.set(prev)
    }
  }

  return () => (
    <div>
      <textarea value={text()} onInput={(e) => text.set(e.target.value)} />
      <button onClick={undo} disabled={previousText() === undefined}>
        Undo
      </button>
    </div>
  )
})
```

## useDebouncedValue

Return a debounced version of a reactive value. The output signal only updates after the specified delay has elapsed since the last change. The debounce timer is cleaned up on component unmount.

### Signature

```ts
function useDebouncedValue<T>(getter: () => T, delayMs: number): () => T
```

### Parameters

| Parameter | Type      | Description                    |
| --------- | --------- | ------------------------------ |
| `getter`  | `() => T` | A reactive getter to debounce  |
| `delayMs` | `number`  | Debounce delay in milliseconds |

### Returns

`() => T` -- a reactive getter that updates `delayMs` after the last change to the source.

### Example

```ts
import { useDebouncedValue } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

const search = signal('')
const debouncedSearch = useDebouncedValue(search, 300)

search.set('h')
search.set('he')
search.set('hel')
search.set('hello')
// debouncedSearch() is still '' at this point
// After 300ms with no more changes, debouncedSearch() becomes 'hello'
```

### Search Input Example

```tsx
const SearchPage = defineComponent(() => {
  const query = signal('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const results = signal<SearchResult[]>([])

  // Fetch results when the debounced query changes
  effect(async () => {
    const q = debouncedQuery()
    if (!q) {
      results.set([])
      return
    }
    const data = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
    results.set(await data.json())
  })

  return () => (
    <div>
      <input
        type="search"
        placeholder="Search..."
        value={query()}
        onInput={(e) => query.set(e.target.value)}
      />
      {query() !== debouncedQuery() && <span class="spinner" />}
      <ul>
        {results().map((r) => (
          <li key={r.id}>{r.title}</li>
        ))}
      </ul>
    </div>
  )
})
```

### Auto-Save Example

```tsx
const AutoSaveEditor = defineComponent(() => {
  const content = signal('')
  const debouncedContent = useDebouncedValue(content, 2000)

  effect(async () => {
    const text = debouncedContent()
    if (text) {
      await fetch('/api/drafts', {
        method: 'PUT',
        body: JSON.stringify({ content: text }),
      })
    }
  })

  return () => (
    <textarea
      value={content()}
      onInput={(e) => content.set(e.target.value)}
      placeholder="Start writing... (auto-saves after 2s)"
    />
  )
})
```

## useHover

Track hover state reactively. Returns a `hovered` signal and event handler props to spread onto an element.

### Signature

```ts
function useHover(): UseHoverResult
```

### Returns: `UseHoverResult`

| Property             | Type            | Description                     |
| -------------------- | --------------- | ------------------------------- |
| `hovered`            | `() => boolean` | Reactive hover state            |
| `props.onMouseEnter` | `() => void`    | Handler to set hovered to true  |
| `props.onMouseLeave` | `() => void`    | Handler to set hovered to false |

### Example

```ts
import { useHover } from '@pyreon/hooks'
import { h } from '@pyreon/core'

const { hovered, props } = useHover()

<div
  {...props}
  class={hovered() ? 'bg-blue-100' : 'bg-gray-100'}
>Hover me</div>
```

<Example file="./examples/hooks/usehover-color-tiles" title="useHover — hover to color the tiles" />

### Tooltip Example

```tsx
const TooltipTrigger = defineComponent<{ text: string }>((props) => {
  const { hovered, props: hoverProps } = useHover()

  return () => (
    <span class="tooltip-trigger" {...hoverProps}>
      {props.children}
      {hovered() && (
        <div class="tooltip" role="tooltip">
          {props.text}
        </div>
      )}
    </span>
  )
})
```

### Interactive Card

```tsx
const HoverCard = defineComponent(() => {
  const { hovered, props: hoverProps } = useHover()

  return () => (
    <div
      class="card"
      {...hoverProps}
      style={{
        transform: hovered() ? 'translateY(-4px)' : 'none',
        boxShadow: hovered() ? '0 8px 24px rgba(0,0,0,0.15)' : '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'all 0.2s ease',
      }}
    >
      <h3>Hover me</h3>
      <p>This card lifts on hover</p>
    </div>
  )
})
```

## useFocus

Track focus state reactively. Returns a `focused` signal and event handler props (`onFocus`, `onBlur`) to spread onto an element.

### Signature

```ts
function useFocus(): UseFocusResult
```

### Returns: `UseFocusResult`

| Property        | Type            | Description                     |
| --------------- | --------------- | ------------------------------- |
| `focused`       | `() => boolean` | Reactive focus state            |
| `props.onFocus` | `() => void`    | Handler to set focused to true  |
| `props.onBlur`  | `() => void`    | Handler to set focused to false |

### Example

```ts
import { useFocus } from '@pyreon/hooks'
import { h } from '@pyreon/core'

const { focused, props } = useFocus()

<input
  {...props}
  class={focused() ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-300'}
/>
```

<Example file="./examples/hooks/usefocus-ring-tiles" title="useFocus — Tab between the tiles to light them" />

### Focus Ring with Label

```tsx
const FloatingLabelInput = defineComponent<{ label: string }>((props) => {
  const { focused, props: focusProps } = useFocus()

  return () => (
    <div class={`input-wrapper ${focused() ? 'focused' : ''}`}>
      <label class={focused() ? 'label-float' : 'label-default'}>{props.label}</label>
      <input {...focusProps} />
    </div>
  )
})
```

## useClickOutside

Call a handler function when a click (or touch) occurs outside the referenced element. Listens on both `mousedown` and `touchstart` in the capture phase for reliable detection.

### Signature

```ts
function useClickOutside(getEl: () => HTMLElement | null, handler: () => void): void
```

### Parameters

| Parameter | Type                        | Description                                    |
| --------- | --------------------------- | ---------------------------------------------- |
| `getEl`   | `() => HTMLElement \| null` | Getter returning the target element            |
| `handler` | `() => void`                | Called when a click occurs outside the element |

### Example

```ts
import { useClickOutside } from '@pyreon/hooks'

let dropdownEl: HTMLElement | null = null

useClickOutside(
  () => dropdownEl,
  () => {
    /* close the dropdown */
  },
)
```

<Example file="./examples/hooks/useclickoutside-dismiss-panel" title="useClickOutside — press outside to dismiss" />

### Dropdown Menu Example

```tsx
const DropdownMenu = defineComponent(() => {
  const { value: isOpen, toggle, setFalse: close } = useToggle()
  let menuEl: HTMLElement | null = null

  useClickOutside(() => menuEl, close)

  return () => (
    <div ref={(el) => (menuEl = el)} class="dropdown">
      <button onClick={toggle}>Menu {isOpen() ? '▲' : '▼'}</button>
      {isOpen() && (
        <ul class="dropdown-menu">
          <li>
            <a href="/profile">Profile</a>
          </li>
          <li>
            <a href="/settings">Settings</a>
          </li>
          <li>
            <button
              onClick={() => {
                logout()
                close()
              }}
            >
              Logout
            </button>
          </li>
        </ul>
      )}
    </div>
  )
})
```

### Popover Example

```tsx
const Popover = defineComponent<{ content: string }>((props) => {
  const { value: isOpen, toggle, setFalse: close } = useToggle()
  let popoverEl: HTMLElement | null = null

  useClickOutside(() => popoverEl, close)

  // Also close on Escape
  useKeyboard('Escape', close)

  return () => (
    <div ref={(el) => (popoverEl = el)} class="popover-wrapper">
      <button onClick={toggle}>Info</button>
      {isOpen() && (
        <div class="popover-content" role="dialog">
          {props.content}
        </div>
      )}
    </div>
  )
})
```

## useKeyboard

Listen for a specific key press and call the handler when it fires. The listener is attached on mount and removed on unmount.

### Signature

```ts
function useKeyboard(
  key: string,
  handler: (event: KeyboardEvent) => void,
  options?: { event?: 'keydown' | 'keyup'; target?: EventTarget },
): void
```

### Parameters

| Parameter        | Type                             | Default     | Description                                                                         |
| ---------------- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `key`            | `string`                         | (required)  | The `KeyboardEvent.key` value to match (e.g., `"Escape"`, `"Enter"`, `"ArrowDown"`) |
| `handler`        | `(event: KeyboardEvent) => void` | (required)  | Called when the key matches                                                         |
| `options.event`  | `'keydown' \| 'keyup'`           | `'keydown'` | Which keyboard event to listen for                                                  |
| `options.target` | `EventTarget`                    | `document`  | The target to attach the listener to                                                |

### Example

```ts
import { useKeyboard } from '@pyreon/hooks'

// Close modal on Escape
useKeyboard('Escape', () => {
  closeModal()
})

// Submit on Enter with keyup
useKeyboard(
  'Enter',
  (e) => {
    e.preventDefault()
    submitForm()
  },
  { event: 'keyup' },
)
```

### Keyboard Shortcut Example

```tsx
const CommandPalette = defineComponent(() => {
  const { value: isOpen, toggle, setFalse: close } = useToggle()

  // Ctrl+K / Cmd+K to toggle
  useKeyboard('k', (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      toggle()
    }
  })

  // Escape to close
  useKeyboard('Escape', close)

  return () => (
    <div>
      {isOpen() && (
        <div class="command-palette">
          <input placeholder="Type a command..." />
          <div class="results">{/* ... */}</div>
        </div>
      )}
    </div>
  )
})
```

### Arrow Key Navigation

```tsx
const ListNavigator = defineComponent(() => {
  const items = ['Home', 'Products', 'About', 'Contact']
  const activeIndex = signal(0)

  useKeyboard('ArrowDown', (e) => {
    e.preventDefault()
    activeIndex.update((i) => Math.min(i + 1, items.length - 1))
  })

  useKeyboard('ArrowUp', (e) => {
    e.preventDefault()
    activeIndex.update((i) => Math.max(i - 1, 0))
  })

  useKeyboard('Enter', () => {
    navigate(items[activeIndex()])
  })

  return () => (
    <ul role="listbox">
      {items.map((item, i) => (
        <li
          role="option"
          aria-selected={activeIndex() === i}
          class={activeIndex() === i ? 'active' : ''}
        >
          {item}
        </li>
      ))}
    </ul>
  )
})
```

## useFocusTrap

Trap Tab and Shift+Tab navigation within a container element. When the user tabs past the last focusable element, focus wraps to the first, and vice versa. Essential for accessible modals and dialogs. The trap only acts while focus is actually inside its container, so nested traps do not fight each other.

The focusable query is spec-grade: it includes `a[href]`, `button`, `input`, `select`, `textarea`, `audio[controls]`, `video[controls]`, `[contenteditable]`, `details > summary`, and any `[tabindex]`; it filters out `display:none` / `visibility:hidden` / `[hidden]` / `inert` / disabled / zero-size nodes (via `Element.checkVisibility` in real browsers); and it orders positive-`tabindex` elements first (ascending) before the natural / `tabindex="0"` group.

### Signature

```ts
function useFocusTrap(
  getEl: () => HTMLElement | null,
  options?: UseFocusTrapOptions | boolean | (() => boolean),
): void

interface UseFocusTrapOptions {
  /** Arm the trap reactively — a getter arms/disarms it without unmounting. Default `true`. */
  active?: boolean | (() => boolean)
  /** Move focus into the container on activation. Default `false` (no move). */
  initialFocus?: boolean | string | HTMLElement | (() => HTMLElement | null)
}
```

### Parameters

| Parameter | Type                                                     | Description                                                                                                   |
| --------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `getEl`   | `() => HTMLElement \| null`                              | Getter returning the container element. Read live on every Tab, so the trap is inert while it returns `null`. |
| `options` | `UseFocusTrapOptions \| boolean \| (() => boolean)`      | Optional. An options object, or a plain `active` boolean / getter shorthand.                                  |

### Example

```ts
import { signal } from '@pyreon/reactivity'
import { useFocusTrap } from '@pyreon/hooks'

const modalRef = signal<HTMLElement | null>(null)

// Single-arg (unchanged): inert while the ref is null, no focus move.
useFocusTrap(() => modalRef())

// Arm reactively + move focus to the first field on open.
useFocusTrap(() => modalRef(), {
  active: () => isOpen(),
  initialFocus: true, // or a selector like '[name=email]', an element, or a getter
})

// Positional shorthand for `active`:
useFocusTrap(() => modalRef(), () => isOpen())
```

### Accessible Modal Example

```tsx
const Modal = defineComponent<{ onClose: () => void }>((props) => {
  let modalEl: HTMLElement | null = null

  useFocusTrap(() => modalEl)
  useKeyboard('Escape', props.onClose)

  const { lock, unlock } = useScrollLock()

  // Lock scroll when modal opens, unlock when it closes
  onMount(() => {
    lock()
  })
  onUnmount(unlock)

  return () => (
    <div class="modal-overlay" onClick={props.onClose}>
      <div
        ref={(el) => (modalEl = el)}
        class="modal-content"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Modal Title</h2>
        <p>Modal content here.</p>
        <div class="modal-actions">
          <button onClick={props.onClose}>Cancel</button>
          <button>Confirm</button>
        </div>
      </div>
    </div>
  )
})
```

## useElementSize

Observe an element's dimensions reactively via `ResizeObserver`. Takes an initial measurement from `getBoundingClientRect` on mount, then tracks changes through the observer.

### Signature

```ts
function useElementSize(getEl: () => HTMLElement | null): () => Size
```

### Parameters

| Parameter | Type                        | Description                             |
| --------- | --------------------------- | --------------------------------------- |
| `getEl`   | `() => HTMLElement \| null` | Getter returning the element to observe |

### Returns

`() => Size` where `Size` is `&#123; width: number; height: number &#125;`. Returns `&#123; width: 0, height: 0 &#125;` before mount or if the element is null.

### Example

```ts
import { useElementSize } from '@pyreon/hooks'

let containerEl: HTMLElement | null = null

const size = useElementSize(() => containerEl)

// In a reactive context:
size().width // current width in pixels
size().height // current height in pixels
```

### Responsive Container Example

```tsx
const ResponsiveGrid = defineComponent(() => {
  let containerEl: HTMLElement | null = null
  const size = useElementSize(() => containerEl)

  const columns = () => {
    const w = size().width
    if (w >= 1200) return 4
    if (w >= 800) return 3
    if (w >= 500) return 2
    return 1
  }

  return () => (
    <div ref={(el) => (containerEl = el)} class="grid-container">
      <div
        class="grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns()}, 1fr)`,
          gap: '16px',
        }}
      >
        {items.map((item) => (
          <div class="grid-item">{item.name}</div>
        ))}
      </div>
      <p class="debug">
        Container: {size().width}x{size().height}px ({columns()} columns)
      </p>
    </div>
  )
})
```

### Aspect Ratio Box

```tsx
const AspectRatioImage = defineComponent<{ ratio: number }>((props) => {
  let wrapperEl: HTMLElement | null = null
  const size = useElementSize(() => wrapperEl)

  return () => (
    <div ref={(el) => (wrapperEl = el)} class="aspect-wrapper">
      <img
        src="/image.jpg"
        style={{
          width: `${size().width}px`,
          height: `${size().width / props.ratio}px`,
          objectFit: 'cover',
        }}
      />
    </div>
  )
})
```

## useWindowResize

Track window dimensions reactively with built-in throttling to avoid excessive updates during resize. Uses `setTimeout`-based throttling.

### Signature

```ts
function useWindowResize(throttleMs?: number): () => WindowSize
```

### Parameters

| Parameter    | Type     | Default | Description                       |
| ------------ | -------- | ------- | --------------------------------- |
| `throttleMs` | `number` | `200`   | Throttle interval in milliseconds |

### Returns

`() => WindowSize` where `WindowSize` is `&#123; width: number; height: number &#125;`. Initializes with the current window dimensions (or `&#123; width: 0, height: 0 &#125;` on the server).

### Example

```ts
import { useWindowResize } from '@pyreon/hooks'

const windowSize = useWindowResize(200)

windowSize().width // window.innerWidth
windowSize().height // window.innerHeight
```

### Responsive Layout Example

```tsx
const ResponsiveLayout = defineComponent(() => {
  const windowSize = useWindowResize(150)

  const layout = () => {
    if (windowSize().width >= 1024) return 'desktop'
    if (windowSize().width >= 768) return 'tablet'
    return 'mobile'
  }

  return () => (
    <div class={`layout layout-${layout()}`}>
      {layout() === 'desktop' && <Sidebar />}
      <main>
        <p>
          Window: {windowSize().width} x {windowSize().height}
        </p>
        {props.children}
      </main>
    </div>
  )
})
```

## useMediaQuery

Subscribe to a CSS media query and return a reactive boolean that updates when the match state changes. Uses `window.matchMedia` and the `change` event.

### Signature

```ts
function useMediaQuery(query: string): () => boolean
```

### Parameters

| Parameter | Type     | Description                                             |
| --------- | -------- | ------------------------------------------------------- |
| `query`   | `string` | A CSS media query string (e.g., `"(min-width: 768px)"`) |

### Returns

`() => boolean` -- reactive getter that reflects the current match state.

### Example

```ts
import { useMediaQuery } from '@pyreon/hooks'

const isWide = useMediaQuery('(min-width: 1024px)')
isWide() // true or false

const isPortrait = useMediaQuery('(orientation: portrait)')
const supportsHover = useMediaQuery('(hover: hover)')
const prefersContrast = useMediaQuery('(prefers-contrast: high)')
```

### Responsive Logic Example

```tsx
const Navigation = defineComponent(() => {
  const isMobile = useMediaQuery('(max-width: 767px)')

  return () => {
    if (isMobile()) {
      return <MobileNav />
    }
    return <DesktopNav />
  }
})
```

### Responsive Image Source

```tsx
const ResponsiveImage = defineComponent<{ alt: string }>((props) => {
  const isRetina = useMediaQuery('(min-resolution: 2dppx)')
  const isWide = useMediaQuery('(min-width: 1024px)')

  const src = () => {
    const size = isWide() ? 'large' : 'small'
    const density = isRetina() ? '@2x' : ''
    return `/images/hero-${size}${density}.webp`
  }

  return () => <img src={src()} alt={props.alt} />
})
```

## useBreakpoint

Return the currently active breakpoint name as a reactive signal. Updates on window resize using `requestAnimationFrame` for smooth performance. The breakpoint is determined by comparing `window.innerWidth` against the sorted breakpoint thresholds.

### Signature

```ts
function useBreakpoint(breakpoints?: BreakpointMap): () => string
```

### Parameters

| Parameter     | Type            | Default                                                    | Description                                         |
| ------------- | --------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| `breakpoints` | `BreakpointMap` | `&#123; xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 &#125;` | Map of breakpoint names to minimum widths in pixels |

### Returns

`() => string` -- reactive getter returning the name of the currently active breakpoint.

### Default Breakpoints

| Name  | Min Width |
| ----- | --------- |
| `xs`  | 0px       |
| `sm`  | 576px     |
| `md`  | 768px     |
| `lg`  | 992px     |
| `xl`  | 1200px    |
| `xxl` | 1400px    |

### Example

```ts
import { useBreakpoint } from '@pyreon/hooks'

const bp = useBreakpoint()
bp() // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
```

### Custom Breakpoints

```ts
const bp = useBreakpoint({
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
})
bp() // 'mobile' | 'tablet' | 'desktop' | 'wide'
```

### Responsive Component Example

```tsx
const AdaptiveLayout = defineComponent(() => {
  const bp = useBreakpoint()

  return () => {
    const current = bp()

    return (
      <div class={`layout-${current}`}>
        {(current === 'lg' || current === 'xl') && <Sidebar />}
        <main>
          <p>Current breakpoint: {current}</p>
          {current === 'xs' && <MobileWarning />}
        </main>
      </div>
    )
  }
})
```

### Grid Column Adjustment

```tsx
const ProductGrid = defineComponent(() => {
  const bp = useBreakpoint()

  const columns = () => {
    switch (bp()) {
      case 'xl':
        return 4
      case 'lg':
        return 3
      case 'md':
        return 2
      default:
        return 1
    }
  }

  return () => (
    <div style={{ gridTemplateColumns: `repeat(${columns()}, 1fr)` }}>
      {products.map((p) => (
        <ProductCard product={p} />
      ))}
    </div>
  )
})
```

## useColorScheme

Return the user's OS color scheme preference as a reactive `'light'` or `'dark'` signal. Built on top of `useMediaQuery('(prefers-color-scheme: dark)')`.

### Signature

```ts
function useColorScheme(): () => 'light' | 'dark'
```

### Returns

`() => 'light' | 'dark'` -- reactive getter reflecting the current OS preference.

### Example

```ts
import { useColorScheme } from '@pyreon/hooks'

const scheme = useColorScheme()
scheme() // 'light' or 'dark'
```

### Theme Toggling Example

```tsx
const ThemeProvider = defineComponent(() => {
  const osScheme = useColorScheme()
  const manualOverride = signal<'light' | 'dark' | 'auto'>('auto')

  const activeTheme = computed(() => {
    const override = manualOverride()
    if (override !== 'auto') return override
    return osScheme()
  })

  // Sync theme to body class
  useHead(() => ({
    bodyAttrs: { class: `theme-${activeTheme()}` },
    htmlAttrs: { 'data-theme': activeTheme() },
  }))

  return () => (
    <div>
      <select
        value={manualOverride()}
        onChange={(e) => manualOverride.set(e.target.value as 'light' | 'dark' | 'auto')}
      >
        <option value="auto">System ({osScheme()})</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      {props.children}
    </div>
  )
})
```

### Conditional Styling

```tsx
const Logo = defineComponent(() => {
  const scheme = useColorScheme()

  return () => <img src={scheme() === 'dark' ? '/logo-light.svg' : '/logo-dark.svg'} alt="Logo" />
})
```

## useReducedMotion

Return `true` when the user prefers reduced motion. Built on top of `useMediaQuery('(prefers-reduced-motion: reduce)')`. Use this to respect the user's accessibility preferences by disabling or simplifying animations.

### Signature

```ts
function useReducedMotion(): () => boolean
```

### Returns

`() => boolean` -- `true` when the user prefers reduced motion.

### Example

```ts
import { useReducedMotion } from '@pyreon/hooks'

const prefersReduced = useReducedMotion()
prefersReduced() // true or false
```

### Accessible Animation Example

```tsx
const AnimatedCard = defineComponent(() => {
  const prefersReduced = useReducedMotion()
  const { hovered, props: hoverProps } = useHover()

  return () => (
    <div
      {...hoverProps}
      style={{
        transition: prefersReduced() ? 'none' : 'transform 0.3s ease, box-shadow 0.3s ease',
        transform: hovered() && !prefersReduced() ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      Content
    </div>
  )
})
```

### Conditional Animation Library

```tsx
const FadeIn = defineComponent(() => {
  const prefersReduced = useReducedMotion()

  return () => (
    <div
      class="fade-in"
      style={{
        animationDuration: prefersReduced() ? '0ms' : '500ms',
        animationName: prefersReduced() ? 'none' : 'fadeIn',
      }}
    >
      {props.children}
    </div>
  )
})
```

## useScrollLock

Lock page scrolling by setting `overflow: hidden` on `document.body`. Uses reference counting so that multiple concurrent locks (e.g., nested modals) work correctly -- scrolling is only restored when all locks are released. Automatically unlocks on component unmount.

### Signature

```ts
function useScrollLock(): { lock: () => void; unlock: () => void }
```

### Returns

| Property | Type         | Description                              |
| -------- | ------------ | ---------------------------------------- |
| `lock`   | `() => void` | Lock scrolling (increments lock count)   |
| `unlock` | `() => void` | Unlock scrolling (decrements lock count) |

### Example

```ts
import { useScrollLock } from '@pyreon/hooks'

const { lock, unlock } = useScrollLock()

lock() // body overflow set to 'hidden'
unlock() // body overflow restored
```

Multiple calls to `lock()` from the same hook instance are idempotent -- calling `lock()` when already locked is a no-op. The same applies to `unlock()`.

### Modal Overlay Example

```tsx
const FullScreenOverlay = defineComponent<{ onClose: () => void }>((props) => {
  const { lock, unlock } = useScrollLock()

  onMount(() => {
    lock()
  })
  onUnmount(unlock)

  return () => (
    <div class="overlay" onClick={props.onClose}>
      <div class="overlay-content" onClick={(e) => e.stopPropagation()}>
        {props.children}
      </div>
    </div>
  )
})
```

### Reference Counting

When multiple components lock scrolling simultaneously, the scroll is only restored when all locks are released:

```tsx
// Modal A locks scroll
const modalA = useScrollLock()
modalA.lock()

// Modal B (nested dialog) also locks scroll
const modalB = useScrollLock()
modalB.lock()

// Closing Modal B does not restore scroll (Modal A is still locked)
modalB.unlock()

// Closing Modal A restores scroll
modalA.unlock()
// Now body overflow is restored to its original value
```

## useIntersection

Observe element visibility using `IntersectionObserver`. Returns a reactive signal containing the latest `IntersectionObserverEntry`, or `null` before the first observation. The observer is disconnected on unmount.

### Signature

```ts
function useIntersection(
  getEl: () => HTMLElement | null,
  options?: IntersectionObserverInit,
): () => IntersectionObserverEntry | null
```

### Parameters

| Parameter | Type                        | Description                                                               |
| --------- | --------------------------- | ------------------------------------------------------------------------- |
| `getEl`   | `() => HTMLElement \| null` | Getter returning the element to observe                                   |
| `options` | `IntersectionObserverInit`  | Standard IntersectionObserver options (`root`, `rootMargin`, `threshold`) |

### Returns

`() => IntersectionObserverEntry | null` -- reactive getter returning the latest observation entry.

### Example

```ts
import { useIntersection } from '@pyreon/hooks'

let sectionEl: HTMLElement | null = null

const entry = useIntersection(() => sectionEl, {
  threshold: 0.5,
})

// Check visibility reactively
const isVisible = () => entry()?.isIntersecting ?? false
const ratio = () => entry()?.intersectionRatio ?? 0
```

### Lazy Loading Example

```tsx
const LazyImage = defineComponent<{ src: string; alt: string }>((props) => {
  let imgEl: HTMLElement | null = null
  const entry = useIntersection(() => imgEl, { rootMargin: '200px' })
  const loaded = signal(false)

  const shouldLoad = () => loaded() || (entry()?.isIntersecting ?? false)

  effect(() => {
    if (shouldLoad()) loaded.set(true)
  })

  return () => (
    <div ref={(el) => (imgEl = el)} class="lazy-image-wrapper">
      {loaded() ? <img src={props.src} alt={props.alt} /> : <div class="placeholder" />}
    </div>
  )
})
```

### Infinite Scroll Example

```tsx
const InfiniteList = defineComponent(() => {
  const items = signal<Item[]>([])
  const page = signal(1)
  const isLoading = signal(false)
  let sentinelEl: HTMLElement | null = null

  const entry = useIntersection(() => sentinelEl, { threshold: 0 })

  effect(async () => {
    if (entry()?.isIntersecting && !isLoading()) {
      isLoading.set(true)
      const newItems = await fetchItems(page())
      items.update((prev) => [...prev, ...newItems])
      page.update((p) => p + 1)
      isLoading.set(false)
    }
  })

  return () => (
    <div>
      {items().map((item) => (
        <ItemCard item={item} key={item.id} />
      ))}
      <div ref={(el) => (sentinelEl = el)} class="scroll-sentinel">
        {isLoading() && <Spinner />}
      </div>
    </div>
  )
})
```

### Scroll-Triggered Animations

```tsx
const AnimateOnScroll = defineComponent(() => {
  let sectionEl: HTMLElement | null = null
  const entry = useIntersection(() => sectionEl, { threshold: 0.3 })
  const hasAppeared = signal(false)

  effect(() => {
    if (entry()?.isIntersecting) hasAppeared.set(true)
  })

  return () => (
    <section ref={(el) => (sectionEl = el)} class={hasAppeared() ? 'animate-in' : 'animate-hidden'}>
      {props.children}
    </section>
  )
})
```

## Combining Multiple Hooks

Hooks compose naturally. Here are patterns that combine several hooks together.

### Accessible Modal (Full Example)

```tsx
const AccessibleModal = defineComponent<{
  title: string
  onClose: () => void
}>((props) => {
  let modalEl: HTMLElement | null = null

  // Focus trap -- keep Tab within the modal
  useFocusTrap(() => modalEl)

  // Close on Escape
  useKeyboard('Escape', props.onClose)

  // Close on click outside
  useClickOutside(() => modalEl, props.onClose)

  // Lock page scroll
  const { lock, unlock } = useScrollLock()
  onMount(() => {
    lock()
  })
  onUnmount(unlock)

  // Respect reduced motion
  const prefersReduced = useReducedMotion()

  return () => (
    <div
      class="modal-backdrop"
      style={{ animation: prefersReduced() ? 'none' : 'fadeIn 0.2s ease' }}
    >
      <div
        ref={(el) => (modalEl = el)}
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={{
          animation: prefersReduced() ? 'none' : 'slideUp 0.3s ease',
        }}
      >
        <h2 id="modal-title">{props.title}</h2>
        <div class="modal-body">{props.children}</div>
        <button onClick={props.onClose}>Close</button>
      </div>
    </div>
  )
})
```

### Responsive Dashboard

```tsx
const Dashboard = defineComponent(() => {
  const bp = useBreakpoint()
  const scheme = useColorScheme()
  const windowSize = useWindowResize()
  const prefersReduced = useReducedMotion()

  return () => {
    const isMobile = bp() === 'xs' || bp() === 'sm'

    return (
      <div class={`dashboard theme-${scheme()}`}>
        {!isMobile && <Sidebar />}
        <main>
          <p>
            {windowSize().width}x{windowSize().height} |{bp()} | {scheme()} |
            {prefersReduced() ? 'reduced motion' : 'full motion'}
          </p>
          {isMobile && <MobileNav />}
          {props.children}
        </main>
      </div>
    )
  }
})
```

### Smart Tooltip with Debounce

```tsx
const SmartTooltip = defineComponent<{ text: string }>((props) => {
  const { hovered, props: hoverProps } = useHover()
  // Only show tooltip after hovering for 500ms
  const debouncedHover = useDebouncedValue(hovered, 500)

  return () => (
    <span class="tooltip-trigger" {...hoverProps}>
      {props.children}
      {debouncedHover() && <div class="tooltip">{props.text}</div>}
    </span>
  )
})
```

## Additional hooks

The hooks below are documented in a more compact form — one description, one signature, one runnable-shaped example each. All are exported from `@pyreon/hooks` the same way as the hooks above.

### DOM

#### `useEventListener`

Register a DOM event listener with automatic cleanup on unmount. Signature is `(event, handler, options?, target?)` — event FIRST, and `target` is the optional last argument, a getter resolved ONCE at setup (defaults to `window`). Use this instead of raw `addEventListener` in primitives — never `addEventListener` / `removeEventListener` directly in component code (the cleanup is the hook's whole job). SSR-safe: no-ops on the server.

```ts
<K extends keyof WindowEventMap>(event: K, handler: (e: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions, target?: () => EventTarget | null) => void
```

```tsx
// @check
import { useEventListener } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

declare function measure(): { width: number; height: number }
declare function onDocClick(e: MouseEvent): void

const layoutSig = signal(measure())
const open = signal(false)

useEventListener('resize', () => layoutSig.set(measure()))
useEventListener('keydown', (e) => {
  if (e.key === 'Escape') open.set(false)
})
// A specific element via the 4th (target) argument, resolved once at setup:
useEventListener('click', onDocClick, {}, () => document)
```

#### `useFocusReturn`

The companion to useFocusTrap: captures the focused element (the trigger) when `isOpen()` flips true and restores focus to it when `isOpen()` flips false — so keyboard / screen-reader users return to where they were when an overlay closes, instead of the top of the page. Pass `returnTo` when the trigger may have unmounted by close time. SSR-safe (no-op on the server), self-cleaning (the watcher is removed on unmount).

```ts
(isOpen: () => boolean, options?: { returnTo?: () => HTMLElement | null }) => void
```

```tsx
const open = signal(false)
useFocusReturn(() => open())               // focus returns to the opener on close
useFocusTrap(() => dialogRef())            // focus is trapped while the dialog is present
```

#### `useInertOthers`

Apply the native `inert` attribute to everything OUTSIDE the element returned by `getEl()` — each ancestor level's sibling subtrees, from the element up to `document.body`. `aria-modal="true"` only TELLS assistive tech the background is inert; this makes it TRUE: the background becomes unfocusable, unclickable, and hidden from the accessibility tree for screen readers AND sighted keyboard users. Cleanup restores EXACTLY the prior state (an element that was already `inert` stays inert), and stacked overlays share a per-element refcount so an inner overlay's cleanup never un-inerts what the outer still needs. Application follows `getEl()` reactively — pass a signal-backed getter and it applies on mount, releases on unmount (ref → null), re-applies on identity change; `active` additionally arms/disarms without unmounting. `script`/`style`/`template`/`link`/`meta` and live regions (`[aria-live]`, `[data-live-announcer]`) are skipped so screen-reader announcements keep working while the overlay is open. Siblings mounted AFTER application (a toast portaled to body) are not retroactively inert-ed. SSR-safe, self-cleaning.

```ts
(getEl: () => HTMLElement | null, options?: { active?: boolean | (() => boolean) } | boolean | (() => boolean)) => void
```

```tsx
const dialogRef = signal<HTMLElement | null>(null)

// The dialog renders only while open, so the ref IS the lifecycle:
useInertOthers(() => dialogRef())
useFocusTrap(() => dialogRef(), { active: () => isOpen() })
useFocusReturn(() => isOpen())
```

#### `useInfiniteScroll`

`IntersectionObserver`-based infinite loading. Attach the returned `ref` to the SCROLL CONTAINER — the hook injects an invisible sentinel at the boundary; when it scrolls into view, `onLoadMore` fires. `triggered()` reflects whether the sentinel is currently visible. `loading` (skip while a load is in flight) and `hasMore` (stop once the last page is reached) are accessor guards; `threshold` is the px distance from the edge (default 100), `direction` picks the top/bottom boundary (default `down`).

```ts
(onLoadMore: () => void | Promise<void>, opts?: { threshold?: number; loading?: () => boolean; hasMore?: () => boolean; direction?: "up" | "down" }) => { ref: (el: HTMLElement | null) => void; triggered: () => boolean }
```

```tsx
const { ref, triggered } = useInfiniteScroll(loadNextPage, { threshold: 200, loading: () => loading(), hasMore: () => hasMore() })
<div ref={ref} style={{ overflowY: 'auto', height: '400px' }}>
  <For each={items()} by={(i) => i.id}>{(item) => <Row data={item} />}</For>
</div>
```

#### `useWindowScroll`

Track the window scroll offset reactively via a passive `scroll` listener (auto-removed on unmount), plus an SSR-safe imperative `scrollTo` (omitted axes keep their current value). Use for scroll-to-top buttons, scroll-progress bars, sticky-header reveal, parallax. SSR-safe: `position()` is `{ x: 0, y: 0 }` on the server.

```ts
() => { position: () => { x: number; y: number }; scrollTo: (o: { x?: number; y?: number; behavior?: ScrollBehavior }) => void }
```

```tsx
const { position, scrollTo } = useWindowScroll()
<Show when={() => position().y > 400}>
  <button onClick={() => scrollTo({ y: 0, behavior: 'smooth' })}>Top</button>
</Show>
```

### State & composition

#### `useLatest`

Wraps `value` in a `{ current }` ref object. Does NOT auto-update — it captures once (Pyreon bodies run once). The return type is `readonly`, so prefer calling `useLatest` again (or passing a reactive getter as `value`) over casting past the `readonly` to mutate `.current` by hand.

```ts
useLatest<T>(value: T) => { readonly current: T }
```

```tsx
// @check
import { useLatest } from '@pyreon/hooks'

declare const props: { onSave?: () => void }

const latest = useLatest(props.onSave)
// later, in a stale-closure-prone callback: latest.current?.()
```

#### `useControllableState`

Canonical controlled/uncontrolled state pattern. Returns a `[getValue, setValue]` tuple where the getter reads the controlled `value()` when defined, else an internal signal, and the setter mutates the internal signal when uncontrolled and always fires `onChange`. Used by every primitive in `@pyreon/ui-primitives`. Never reimplement the `isControlled + signal + getter` shape by hand. `value` MUST be a FUNCTION so the controlled prop is read reactively; `defaultValue` is a PLAIN value (captured once as the uncontrolled initial). Controlled-vs-uncontrolled is detected once at setup from whether `value()` is defined.

```ts
<T>(opts: { value: () => T | undefined; defaultValue: T; onChange?: (v: T) => void }) => [() => T, (next: T | ((prev: T) => T)) => void]
```

```tsx
// @check
import { useControllableState } from '@pyreon/hooks'

function MyToggle(props: { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  const [checked, setChecked] = useControllableState({
    value: () => props.checked,           // controlled — function so the signal read tracks
    defaultValue: props.defaultChecked ?? false,  // uncontrolled initial — plain value
    onChange: props.onChange,
  })
  return <button onClick={() => setChecked(!checked())}>{checked() ? 'on' : 'off'}</button>
}
```

#### `useMergedRef`

Combine multiple refs into a single callback ref — used when forwarding `props.ref` while also keeping a local ref to the same element. Each provided ref (callback or object) receives the element on mount and `null` on unmount.

```ts
<T>(...refs: (Ref<T> | RefCallback<T> | null | undefined)[]) => RefCallback<T>
```

```tsx
// @check
import { useMergedRef } from '@pyreon/hooks'

declare const props: { ref?: (node: HTMLDivElement | null) => void }

const localRef = { current: null as HTMLDivElement | null }
const merged = useMergedRef(localRef, props.ref)
const view = <div ref={merged}>...</div>
```

#### `useUpdateEffect`

Watch-style effect that skips the initial run — tracks `source` and fires `callback(newVal, oldVal)` only when `source`'s value changes *after* mount (`oldVal` is `undefined` on the first change). Use for "save on change but not on first render" patterns where the initial value is already persisted. Note the argument order is `(source, callback)` — NOT React's `(effect, deps)`.

```ts
<T>(source: () => T, callback: (newVal: T, oldVal: T | undefined) => void | (() => void)) => void
```

```tsx
useUpdateEffect(() => value(), (val) => api.save(val))
// Doesn't fire on initial mount — only on subsequent value changes
```

#### `useIsomorphicLayoutEffect`

Runs a layout-phase effect on the client (synchronous, before paint) and a no-op on the server. Use when you need to read DOM measurements before the next paint without triggering an SSR mismatch warning.

```ts
(fn: () => void | (() => void)) => void
```

```tsx
const ref = signal<HTMLDivElement | null>(null)
useIsomorphicLayoutEffect(() => {
  const el = ref()
  if (el) widthSig.set(el.getBoundingClientRect().width)
})
```

### Responsive

#### `useSizeClass`

Reactive size-class accessor — `computed` over `(min-width: 600px)` (wraps `useMediaQuery`), mapping wide → `'regular'`, narrow → `'compact'` (the SwiftUI/Android size-class analog for shared multi-platform code).

```ts
useSizeClass() => () => 'compact' | 'regular'
```

```tsx
// @check
import { useSizeClass } from '@pyreon/hooks'
import { Show } from '@pyreon/core'

declare function TwoColumn(): JSX.Element

const size = useSizeClass()
const view = <Show when={() => size() === 'regular'}><TwoColumn /></Show>
```

### Timing

#### `useDebouncedCallback`

Returns a debounced wrapper that resets a timer on each call and invokes `callback` after `delay`ms of quiet, plus `.cancel()` (drop the pending call) and `.flush()` (invoke now with the last args). Pending timer auto-cancelled on unmount.

```ts
useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number) => T & { cancel: () => void; flush: () => void }
```

```tsx
// @check
import { useDebouncedCallback } from '@pyreon/hooks'

declare function fetchResults(q: string): void

const onSearch = useDebouncedCallback((q: string) => fetchResults(q), 300)
const view = <input onInput={(e) => onSearch(e.currentTarget.value)} />
```

#### `useThrottledCallback`

Returns a throttled wrapper (rate-limited to once per `delay`ms; leading + trailing edge, latest-args) with a `.cancel()` method. Auto-cancelled on unmount. Use over debounce when you want steady updates during a continuous stream (scroll, drag).

```ts
useThrottledCallback<T extends (...args: any[]) => any>(callback: T, delay: number) => T & { cancel: () => void }
```

```tsx
const onScroll = useThrottledCallback(() => updateParallax(), 16)
```

#### `useInterval`

Declarative `setInterval`. A number sets a fixed interval, `null` PAUSES, and a getter `() => number | null` makes the delay REACTIVE (an effect restarts/pauses the timer when the returned value changes). Auto-cleared on unmount. Returns nothing.

```ts
useInterval(callback: () => void, delay: number | null | (() => number | null)) => void
```

```tsx
// @check
import { useInterval } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

declare function tick(): void

const paused = signal(false)
useInterval(() => tick(), () => paused() ? null : 1000)
```

#### `useTimeout`

Declarative `setTimeout` that STARTS immediately at setup (fires once after `delay`ms unless `delay` is `null`). Returns `reset` (restart with the original delay) / `clear` (stop). Auto-cleared on unmount.

```ts
useTimeout(callback: () => void, delay: number | null) => { reset: () => void; clear: () => void }
```

```tsx
// @check
import { useTimeout } from '@pyreon/hooks'

declare function hideToast(): void

const t = useTimeout(() => hideToast(), 3000)
const view = <div onMouseEnter={t.clear} onMouseLeave={t.reset}>…</div>
```

#### `useTimeAgo`

Reactive "5 minutes ago" / "in 2 hours" relative-time string. Auto-updates on a sensible interval (every minute under an hour, every hour under a day, etc.) so the UI stays accurate without manual scheduling. Cleans up the interval on unmount.

```ts
(date: Date | (() => Date), opts?: UseTimeAgoOptions) => Signal<string>
```

```tsx
// @check
import { useTimeAgo } from '@pyreon/hooks'

const message = { sentAt: new Date() }
const sent = useTimeAgo(message.sentAt)
const view = <span>{sent}</span>
```

### Device & interaction

#### `useBluetooth`

Bluetooth DISCOVERY only, on all three targets — Web Bluetooth, CoreBluetooth, and the Android adapter. GATT (connect / read / write a characteristic) is deliberately out of scope: it is where the three platforms stop resembling each other, and a surface that only half-crosses is worse than one that states what it covers. `devices` is FIRST-SEEN order deduped by id, asserted on every target rather than inherited from whatever the platform hands back.

```ts
useBluetooth() => { available: () => boolean; scanning: () => boolean; devices: () => BluetoothDevice[]; error: () => string; scan: () => void; stopScan: () => void }
```

```tsx
const bt = useBluetooth()
<Show when={() => bt.available()}>
  <Button onClick={() => bt.scan()}>Scan</Button>
  <For each={bt.devices()} by={(d) => d.id}>{(d) => <Text>{d.name}</Text>}</For>
</Show>
```

#### `useDeviceMotion`

Device motion — shake gestures, tilt controls. Has an explicit `start()` rather than listening on mount, because an always-on hook would be wrong on ALL THREE targets: iOS Safari gates `DeviceMotionEvent` behind a permission prompt that only works from a user gesture, and both native targets want an explicit start/stop so the sensor is not draining battery for a screen nobody is looking at. `start()` resolves `false` on denial rather than throwing. On engines WITHOUT `requestPermission` (everything but iOS Safari) its absence is a GRANT, not a failure.

```ts
useDeviceMotion() => { supported: () => boolean; active: () => boolean; start: () => Promise<boolean>; stop: () => void; acceleration: () => { x: number; y: number; z: number }; rotation: () => { x: number; y: number; z: number } }
```

```tsx
const motion = useDeviceMotion()
<Button onClick={() => motion.start()}>Enable tilt</Button>
<Show when={() => motion.active()}><Tilt v={motion.rotation()} /></Show>
```

#### `useSpeech`

Speak text aloud — `speechSynthesis` on the web, `AVSpeechSynthesizer` on iOS, `TextToSpeech` on Android. CANCELS before each `speak()`: queueing is the platform default on all three, so without it a second press talks OVER the first instead of replacing it, and the assertion is identical across the three arms. Rate, pitch and voice selection are deliberately out of scope — the platforms disagree on their ranges and on how voices are identified, so one name would mean three different things, or a lowest-common-denominator useless on all three. Disposal cancels: speech outlives the DOM on every browser, so an in-flight utterance would talk over the next screen.

```ts
useSpeech() => { supported: () => boolean; speaking: () => boolean; speak: (text: string) => Promise<boolean>; stop: () => void }
```

```tsx
const speech = useSpeech()
<Button onClick={() => speech.speak(article())}>Read aloud</Button>
```

#### `useDeviceInfo`

Describe the device — platform branching, real screen geometry, device context for analytics. `platform` needs no runtime on native: it is a COMPILE-TIME constant per target. `model` and `osVersion` are real on iOS/Android and deliberately EMPTY STRINGS on the web, because the browser cannot answer them reliably (navigator.platform is deprecated, UA Client Hints are Chromium-only, and UA parsing rots as browsers change their strings) — and these are the fields that end up in analytics and support tickets, where a plausible wrong answer costs more than a missing one. `screen` reads through on every access rather than caching, so a fold, rotation or Stage Manager resize is reflected instead of silently reporting the old geometry.

```ts
useDeviceInfo() => { platform: () => 'web' | 'ios' | 'android'; model: () => string; osVersion: () => string; isTouch: () => boolean; screen: () => { width: number; height: number; scale: number } }
```

```tsx
const device = useDeviceInfo()
<Show when={() => device.platform() !== 'web'}>
  <Text>{device.model()} · {device.osVersion()}</Text>
</Show>
```

#### `useAudioRecorder`

Record from the microphone — voice notes, voice messages, dictation. `start()` RESOLVES `false` on a denied permission rather than throwing: that is the single most likely outcome of the call and an ordinary branch in any UI that uses it, so callers get an `if`, not a `try` (the same contract `useWakeLock.request()` uses). `stop()` resolves a URL — an object URL on the web, a file URL on iOS/Android — because that is the one representation all three targets produce and every consumer can use; handing back a platform-shaped buffer would push the difference onto the caller. A zero-length capture resolves `null` rather than an empty URL. Disposal releases the microphone tracks, which is what turns the OS recording indicator off.

```ts
useAudioRecorder() => { supported: () => boolean; recording: () => boolean; start: () => Promise<boolean>; stop: () => Promise<string | null>; error: () => string }
```

```tsx
const rec = useAudioRecorder()
const done = async () => {
  const url = await rec.stop()
  if (url !== null) clip.set(url)
}
```

#### `useWakeLock`

Keep the screen awake — video, navigation, recipe steps. Lowers to `isIdleTimerDisabled` on iOS and `FLAG_KEEP_SCREEN_ON` on Android. The WEB arm carries a normalization the native ones do not need: a `WakeLockSentinel` is released by the browser whenever the document hides and is NOT reacquired, while the native flag survives backgrounding — so the hook listens for the sentinel's `release` event and re-acquires on `visibilitychange` unless the caller explicitly released. Without both halves the same call leaves the screen sleeping on web and lit on native.

```ts
useWakeLock() => { active: () => boolean; supported: () => boolean; request: () => Promise<boolean>; release: () => Promise<void> }
```

```tsx
// @check
import { useWakeLock } from '@pyreon/hooks'
import { onMount, Show } from '@pyreon/core'

declare function Badge(props: { children: unknown }): JSX.Element

const wake = useWakeLock()
onMount(() => { void wake.request() })
const view = <Show when={() => wake.active()}><Badge>Screen stays on</Badge></Show>
```

#### `useClipboard`

`navigator.clipboard.writeText` wrapped with a reactive `copied` flag that auto-resets after `options.timeout` ms (default 2000). `copy` resolves `true` on success / `false` on failure (never throws). `text()` is the last successfully-copied string. Use the `copied` signal to flash a "Copied!" UI cue without manual timer management.

```ts
(options?: { timeout?: number }) => { copy: (text: string) => Promise<boolean>; copied: () => boolean; text: () => string }
```

```tsx
// @check
import { useClipboard } from '@pyreon/hooks'

const token = 'invite-abc123'
const { copy, copied } = useClipboard()
const view = <button onClick={() => copy(token)}>{copied() ? 'Copied!' : 'Copy'}</button>
```

#### `useShare`

Imperative Web Share API wrapper (lowers to native `PyreonShare` under PMTC). `canShare()` feature-detects `navigator.share`; the share methods no-op where it is unavailable.

```ts
useShare() => { text: (text: string) => void; url: (url: string) => void; textUrl: (text: string, url: string) => void; canShare: () => boolean }
```

```tsx
const share = useShare()
<Show when={() => share.canShare()}>
  <button onClick={() => share.url(location.href)}>Share</button>
</Show>
```

#### `useLinking`

Imperative external-link opener. `openUrl` calls `window.open(url, "_blank", "noopener,noreferrer")` on web and lowers to native `PyreonLinking` under PMTC. SSR-safe.

```ts
useLinking() => { openUrl: (url: string) => void }
```

```tsx
const { openUrl } = useLinking()
<button onClick={() => openUrl('https://pyreon.dev')}>Docs</button>
```

#### `useNotifications`

Imperative LOCAL notifications (Web Notifications API; lowers to native `PyreonNotifications` under PMTC). `notify` auto-requests permission on first use; `requestPermission` prompts ahead of time.

```ts
useNotifications() => { requestPermission: () => void; notify: (title: string, body: string) => void }
```

```tsx
const notifications = useNotifications()
onMount(() => notifications.requestPermission())
notifications.notify('Done', 'Your export is ready')
```

#### `useBiometrics`

A biometric authentication gate — Face ID / Touch ID (iOS `LAContext`), BiometricPrompt (Android), feature-detected on the web. The FIRST @pyreon/hooks service with an ASYNC RESULT: `authenticate(reason)` returns a `Promise<boolean>` you `await`. Under PMTC this lowers to the native biometric APIs, and the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. WEB v1: a real assertion is a WebAuthn ceremony (needs a server-issued challenge + a registered credential), so the web `authenticate` resolves `false` and `isAvailable` feature-detects `window.PublicKeyCredential` — native is the primary target.

```ts
useBiometrics() => { authenticate: (reason: string) => Promise<boolean>; isAvailable: () => boolean }
```

```tsx
const bio = useBiometrics()
const status = signal<'idle' | 'unlocked' | 'denied'>('idle')

<button onClick={async () => {
  const ok = await bio.authenticate('Unlock your vault')
  status.set(ok ? 'unlocked' : 'denied')
}}>Unlock</button>
```

#### `useDialog`

Native `<dialog>` element wrapper. `open` is the reactive OPEN-STATE signal (call it to read: `dialog.open()`); `show()` opens non-modal, `showModal()` opens with backdrop + focus, `close()` closes, `toggle()` flips. Wires the native `close` event so `open` stays in sync (and fires `options.onClose`) when the user presses Escape.

```ts
(options?: { onClose?: () => void }) => { open: () => boolean; show: () => void; showModal: () => void; close: () => void; toggle: () => void; ref: (el: HTMLDialogElement | null) => void }
```

```tsx
const dialog = useDialog()
<button onClick={dialog.showModal}>Open</button>
<dialog ref={dialog.ref}><button onClick={dialog.close}>Close</button></dialog>
```

#### `useOnline`

Reactive network status accessor — seeded from `navigator.onLine` (or `true` on the server), updated by `online`/`offline` window events. SSR-safe (guards on `isClient`); listeners auto-removed via `onCleanup`.

```ts
useOnline() => () => boolean
```

```tsx
// @check
import { useOnline } from '@pyreon/hooks'
import { Show } from '@pyreon/core'

declare function OfflineBanner(): JSX.Element

const online = useOnline()
const view = <Show when={() => !online()}><OfflineBanner /></Show>
```

#### `useDocumentVisibility`

Track the Page Visibility state (`document.visibilityState`) reactively — `"hidden"` when the tab is backgrounded/minimized, `"visible"` otherwise. Use it to pause work the user can't see (polling, video, animations, expensive timers) and resume on return. SSR-safe (returns `"visible"` on the server); the `visibilitychange` listener is removed on unmount.

```ts
() => () => "visible" | "hidden"
```

```tsx
const visibility = useDocumentVisibility()
effect(() => { visibility() === 'hidden' ? pausePolling() : resumePolling() })
```

#### `useIdle`

Reactive user-idle detection — `true` once no activity event (pointer / key / scroll / wheel by default) has fired for `timeoutMs` (default 60000), back to `false` on the next interaction. Every listener and the timer are removed on unmount. Use for auto-logout, "are you still there?" prompts, presence away-status, pausing background work. SSR-safe (listeners register in `onMount`).

```ts
(timeoutMs?: number, opts?: { events?: readonly string[]; initialState?: boolean }) => () => boolean
```

```tsx
const idle = useIdle(30_000)
effect(() => { if (idle()) showAwayBanner() })
```

#### `useCamera`

Take a photo with the device camera, through the SYSTEM capture UI on every target — `<input capture>` on the web, UIImagePickerController on iOS, an image-capture intent on Android. Mirrors `useImagePicker` exactly, since the two differ only in which system flow they open: `capture()` resolves a URI or `null`, and NEVER rejects — a cancel and an unavailable camera are the same outcome to a caller (no photo). Because the system UI owns the permission prompt, there is no permission plumbing to get subtly different per platform. A CUSTOM in-app viewfinder is deliberately out of scope: an AVCaptureSession layer, a CameraX PreviewView and a `<video>` element are not one thing wearing three hats — reach for `useNativeModule` there, the same escape hatch `useBluetooth` names for GATT.

```ts
useCamera() => { capture: () => Promise<string | null>; isAvailable: () => boolean }
```

```tsx
const cam = useCamera()
const shoot = async () => {
  const uri = await cam.capture()
  if (uri !== null) photo.set(uri)
}
```

#### `useFilePicker`

Pick a document/file from the device — UIDocumentPickerViewController (iOS), the Storage Access Framework `OpenDocument` (Android), a hidden file input (web). The document sibling of `useImagePicker` (any file — a PDF, a `.csv`, a `.zip` — not just photos), and the THIRD async-result hook: `pick()` returns a `Promise<string | null>` you `await`, resolving a URI string or `null` when the user cancels; it never rejects. Under PMTC the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. Requires NO storage permission on either native platform — both system pickers run out of process and hand back only the chosen document, so there is no iOS entitlement and no Android runtime permission. Saving/exporting a file is a separate native flow and is intentionally out of scope (tracked follow-up).

```ts
useFilePicker() => { pick: () => Promise<string | null>; isAvailable: () => boolean }
```

```tsx
const files = useFilePicker()
const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

<button onClick={async () => {
  const uri = await files.pick()
  status.set(uri === null ? 'cancelled' : 'picked')
}}>Pick a file</button>
```

#### `useHaptics`

Imperative haptic feedback. Fire-and-forget methods that call `navigator.vibrate` on web (mapped patterns) and lower to native `PyreonHaptics` under PMTC. `impact` defaults to `medium`.

```ts
useHaptics() => { impact: (style?: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => void; notification: (type: 'success' | 'warning' | 'error') => void; selection: () => void }
```

```tsx
const haptics = useHaptics()
<button onClick={() => { haptics.impact('light'); submit() }}>Pay</button>
```

#### `useImagePicker`

Pick an image from the device's photo library — PHPickerViewController (iOS), the Android Photo Picker (`PickVisualMedia`), a hidden file input (web). The SECOND async-result hook (after `useBiometrics`): `pick()` returns a `Promise<string | null>` you `await`, resolving a URI string or `null` when the user cancels; it never rejects. Under PMTC the async-await lowering wraps the awaiting handler in a Swift `Task { … }` / Kotlin `pyreonAsyncScope.launch { … }`. Requires NO photo-library permission on either native platform — both system pickers run out of process and hand back only the chosen asset, so there is no Info.plist usage description and no Android runtime permission to request.

```ts
useImagePicker() => { pick: () => Promise<string | null>; isAvailable: () => boolean }
```

```tsx
const picker = useImagePicker()
const status = signal<'idle' | 'picked' | 'cancelled'>('idle')

<button onClick={async () => {
  const uri = await picker.pick()
  status.set(uri === null ? 'cancelled' : 'picked')
}}>Pick a photo</button>
```

#### `useSafeArea`

The safe-area insets of the current display — notch / Dynamic Island, home indicator, gesture bar, rounded corners. The one device fact a multiplatform app cannot work around at the app level: without it content draws under the notch, or every screen pads by a hard-coded guess that is wrong on the next device. Returns ONE accessor rather than four because the values move together on rotation and separate accessors invite a torn read. Sources: `env(safe-area-inset-*)` read off an inert probe element on the web (CSS environment variables are not exposed to script any other way — needs `viewport-fit=cover`, and reports zeros without it, which is correct rather than broken), `safeAreaInsets` on iOS, `WindowInsets` on Android.

```ts
useSafeArea() => () => { top: number; right: number; bottom: number; left: number }
```

```tsx
const safe = useSafeArea()
<Stack style={() => ({ paddingTop: \
```

#### `useScreenOrientation`

Which way the display is oriented. READ-ONLY by design: locking does not cross — `screen.orientation.lock()` is Chromium-only and fullscreen-gated on the web, and on iOS orientation is an app-level declaration (`supportedInterfaceOrientations`) rather than something a view can request. A `lock()` that silently no-ops on two of three targets is worse than a surface that states what it covers. `type` is normalised to the part that is true everywhere; the primary/secondary distinction the web exposes lives in `angle` (0 / 90 / 180 / 270), so nothing is lost.

```ts
useScreenOrientation() => { type: () => 'portrait' | 'landscape'; angle: () => number }
```

```tsx
const o = useScreenOrientation()
<Show when={() => o.type() === 'landscape'}><WideLayout /></Show>
```
### Cross-platform data hooks

These are the WEB halves of hooks the Pyreon Multi-Target Compiler already lowers natively (iOS/Compose). Import them from `@pyreon/hooks` the same way on web, iOS, and Android — one `import { useAuth } from '@pyreon/hooks'` line resolves on all three targets.

#### `useFetch`

Thin reactive JSON fetch — `{ data, error, isPending, refetch }`, all signals. Fires once at setup (client-only; SSR renders the not-yet-loaded state). Each `refetch()` aborts the previous in-flight request so a slow stale response can never clobber a fresh one; unmount aborts too. Deliberately thinner than `@pyreon/query`: no cache, no dedup, no retries — reach for `@pyreon/query` when you need those. The same call compiles to native `PyreonFetch<T>` containers on iOS/Android via PMTC.

```ts
function useFetch<T>(url: string): { data: Signal<T | undefined>; error: Signal<unknown>; isPending: Signal<boolean>; refetch: () => void }
```

```tsx
// @check
import { useFetch } from '@pyreon/hooks'
import { Show, For } from '@pyreon/core'

declare function Text(props: { children: unknown }): JSX.Element

type Quote = { id: number; text: string }
const quotes = useFetch<Quote[]>('/api/quotes.json')
const view = (
  <>
    <Show when={quotes.isPending}><Text>Loading…</Text></Show>
    <For each={() => quotes.data() ?? []} by={(q) => q.id}>{(q) => <Text>{q.text}</Text>}</For>
  </>
)
```

#### `useSecureStorage`

The imperative secret store for auth tokens / API keys / PII — use this instead of `useStorage` for secrets (`localStorage` is plaintext and same-origin-script-readable). **Key-first**: `write(key, value)`. Backed by the OS Keychain/Keystore on iOS/Android; on web, a module-scoped **in-memory** store (there is no OS secret store in a browser — persisting to `localStorage` would be the exact bug this hook prevents, so web secrets are process-lifetime only, by design). Imperative, not reactive — a secret is fetched at an auth boundary, not rendered as live UI. Inert on the server (reads return `null`, `write` returns `false`) so a value written during one SSR render can never leak into another request.

```ts
function useSecureStorage(): { write(key: string, value: string): boolean; read(key: string): string | null; remove(key: string): boolean; contains(key: string): boolean }
```

```tsx
// @check
import { useSecureStorage } from '@pyreon/hooks'

declare const api: { login(): Promise<string> }

const secrets = useSecureStorage()
const signIn = async () => {
  const token = await api.login()
  secrets.write('auth-token', token) // KEY first
}
const authed = () => fetch('/api/me', { headers: { Authorization: 'Bearer ' + (secrets.read('auth-token') ?? '') } })
const signOut = () => secrets.remove('auth-token')
```

#### `useAuth`

Shared auth-state container. `status` is `'signedOut' | 'signingIn' | 'signedIn' | 'error'`; `user` and `error` clear/persist per transition to match the native `PyreonAuth` state machine exactly (a token refresh via `beginSignIn` keeps the current `user`; only `signOut` clears it).

```ts
function useAuth<User = unknown>(): UseAuthResult<User>
```

```tsx
// @check
import { useAuth } from '@pyreon/hooks'
import { Show } from '@pyreon/core'

declare function SignInForm(props: { onSubmit: () => void }): JSX.Element
declare function Text(props: { children: unknown }): JSX.Element
declare function Button(props: { onPress: () => void; children: unknown }): JSX.Element

const auth = useAuth<{ id: string; name: string }>()

const view = (
  <Show when={() => auth.status === 'signedIn'} fallback={<SignInForm onSubmit={auth.beginSignIn} />}>
    <Text>Welcome, {auth.user?.name}</Text>
    <Button onPress={auth.signOut}>Sign out</Button>
  </Show>
)
```

#### `useDatabase`

A tiny local record store (`insert` / `get` / `all` / `delete` / `find` / `count`), backed by `localStorage` on web (namespaced, falls back to an in-memory `Map` when storage is unavailable — SSR, Safari private mode) and lowered to a native on-device store on iOS/Android.

```ts
function useDatabase(): UseDatabaseResult
```

```tsx
const db = useDatabase()
db.insert('notes', { id: '1', fields: { at: 'tap' } })
return <Text>Notes: {db.count('notes')}</Text>
```

#### `useGeolocation`

Reactive device position — `latitude` / `longitude` / `accuracy` update as signals while watching is active; `start()` / `stop()` control the underlying `watchPosition` subscription (never started automatically — a location prompt must follow a user gesture).

```ts
function useGeolocation(options?: UseGeolocationOptions): UseGeolocationResult
```

```tsx
const geo = useGeolocation()
return (
  <Stack>
    <Text>{geo.latitude}</Text>
    <Button onPress={() => geo.start()}>Locate</Button>
  </Stack>
)
```

#### `useMap`

Shared map-view state — `camera`, `markers`, and the selected marker — with imperative mutators (`setCamera`, `moveTo`, `setMarkers`, `addMarker`/`removeMarker`, `selectMarker`) that the native map view and a web map renderer both drive from the same instance.

```ts
function useMap(options?: UseMapOptions): UseMapResult
```

```tsx
const map = useMap()
map.addMarker({ id: 'pin-1', latitude: 51.5, longitude: -0.1 })
map.selectMarker('pin-1')
return <Text>Selected: {map.selectedMarker?.id ?? 'none'}</Text>
```

#### `useWebSocket`

A reactive WebSocket client — `isConnected` / `lastMessage` / `messages` / `error` track connection state; `connect()` is a no-op while already open (matches the native guard). `autoConnect` defaults to `true` so identical source behaves identically on every target.

```ts
function useWebSocket(url: string, options?: UseWebSocketOptions): UseWebSocketResult
```

```tsx
const socket = useWebSocket('wss://example.com/feed')
return <Text>{socket.isConnected ? socket.lastMessage : 'connecting…'}</Text>
```

#### `usePush`

Push-notification registration and inbox — `token` is the device/subscription token (`null` until registered), `isAuthorized` reflects the permission grant, `notifications` / `lastNotification` track inbound pushes.

```ts
function usePush(): UsePushResult
```

```tsx
const push = usePush()
return <Text>{push.isAuthorized ? `Token: ${push.token}` : 'Not authorized'}</Text>
```

#### `usePayments`

In-app purchase state — `products` (loaded catalog), `ownedProductIds`, `purchasing` (the product id mid-purchase, or `null`), and `owns(productId)` as the convenience check for gating premium content.

```ts
function usePayments(): UsePaymentsResult
```

```tsx
const payments = usePayments()
<Show when={() => payments.owns('pro')} fallback={<UpgradeButton />}>
  <ProFeatures />
</Show>
```

#### `useAppState`

Reactive foreground/background phase (`'active' | 'inactive' | 'background'`) — use it to pause work (polling, animation, media) while the app isn't visible.

```ts
function useAppState(): () => AppStatePhase
```

```tsx
const state = useAppState()
// Pause a live poll while the app isn't in the foreground:
<Show when={() => state() === 'active'}><LivePoll /></Show>
```

#### `useCrashReporter`

Records the last crash (message + stack) across app restarts and exposes `hadCrash` so the UI can show a "we're sorry" banner on the next launch. `breadcrumbs` accumulate context (route changes, key actions) that gets attached to the next reported crash.

```ts
function useCrashReporter(): UseCrashReporterResult
```

```tsx
const crash = useCrashReporter()
onMount(() => crash.start())
<Show when={() => crash.hadCrash}>
  <Banner>We're sorry — the app crashed last time.</Banner>
</Show>
```

## API Reference

| Hook                | Signature                                                      | Description                                         |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| `useToggle`         | `(initial?) => UseToggleResult`                                | Boolean toggle with `toggle`, `setTrue`, `setFalse` |
| `useCounter`        | `(initial?, opts?) => UseCounterResult`                        | Numeric counter with `inc`/`dec`/`set`/`reset`, optional `min`/`max` |
| `usePrevious`       | `(getter) => () => T \| undefined`                             | Track the previous value of a reactive getter       |
| `useDebouncedValue` | `(getter, delayMs) => () => T`                                 | Debounce a reactive value                           |
| `useHover`          | `() => UseHoverResult`                                         | Track hover state with spreadable props             |
| `useFocus`          | `() => UseFocusResult`                                         | Track focus/blur state with spreadable props        |
| `useClickOutside`   | `(getEl, handler) => void`                                     | Call handler on clicks outside an element           |
| `useKeyboard`       | `(key, handler, options?) => void`                             | Listen for specific key presses                     |
| `useFocusTrap`      | `(getEl, options?) => void`                                    | Trap Tab focus within a container; optional reactive `active` + `initialFocus` |
| `useElementSize`    | `(getEl) => () => Size`                                        | Observe element dimensions via ResizeObserver       |
| `useWindowResize`   | `(debounceMs?) => () => WindowSize`                            | Track window size with debouncing                   |
| `useWindowScroll`   | `() => UseWindowScrollResult`                                  | Reactive `{ x, y }` scroll offset + `scrollTo`      |
| `useMediaQuery`     | `(query) => () => boolean`                                     | Subscribe to a CSS media query                      |
| `useBreakpoint`     | `(breakpoints?) => () => string`                               | Get the active breakpoint name                      |
| `useColorScheme`    | `() => () => 'light' \| 'dark'`                                | Detect light/dark mode preference                   |
| `useReducedMotion`  | `() => () => boolean`                                          | Detect reduced-motion preference                    |
| `useScrollLock`     | `() => &#123; lock, unlock &#125;`                             | Lock/unlock page scrolling                          |
| `useIntersection`   | `(getEl, options?) => () => IntersectionObserverEntry \| null` | Observe element intersection                        |
| `useDocumentVisibility` | `() => () => 'visible' \| 'hidden'`                        | Track tab visibility (Page Visibility API)          |
| `useIdle`           | `(timeoutMs?, opts?) => () => boolean`                         | User-idle detection after `timeoutMs` of no activity |
| `useEventListener` | `(event, handler, options?, target?) => void` | DOM event listener, auto-cleanup — event-first |
| `useFocusReturn` | `(isOpen, options?) => void` | Restore focus to the trigger element when an overlay closes |
| `useInertOthers` | `(getEl, options?) => void` | Make everything outside an element `inert` while it is open |
| `useInfiniteScroll` | `(onLoadMore, opts?) => { ref, triggered }` | IntersectionObserver-based infinite loading sentinel |
| `useLatest` | `<T>(value: T) => { readonly current: T }` | Always-current ref to a reactive value, for stable-identity callbacks |
| `useControllableState` | `(opts) => [get, set]` | Controlled (`value`+`onChange`) / uncontrolled (`defaultValue`) state, one hook |
| `useMergedRef` | `<T>(...refs) => RefCallback<T>` | Merge multiple ref callbacks into one |
| `useUpdateEffect` | `(source, callback) => void` | Like `effect()` but skips the first (mount) run |
| `useIsomorphicLayoutEffect` | `(fn) => void` | Layout effect on the client, `effect()` on the server |
| `useSizeClass` | `() => () => 'compact' | 'regular'` | Reactive `'compact' | 'regular'` size class |
| `useDebouncedCallback` | `(callback, delay) => callback & { cancel, flush }` | Debounce a callback invocation |
| `useThrottledCallback` | `(callback, delay) => callback & { cancel }` | Throttle a callback invocation |
| `useInterval` | `(callback, delay) => void` | Reactive `setInterval` with auto-cleanup |
| `useTimeout` | `(callback, delay) => { reset, clear }` | Reactive `setTimeout` with auto-cleanup |
| `useTimeAgo` | `(date, opts?) => Signal<string>` | Reactive "3 minutes ago"-style relative time string |
| `useBluetooth` | `() => UseBluetoothResult` | Web Bluetooth device scan/connect (SSR/unsupported-safe) |
| `useDeviceMotion` | `() => UseDeviceMotionResult` | Reactive accelerometer/gyroscope readings |
| `useSpeech` | `() => UseSpeechResult` | Speech synthesis (`speak`) + recognition |
| `useDeviceInfo` | `() => UseDeviceInfoResult` | Reactive device/platform/OS info |
| `useAudioRecorder` | `() => UseAudioRecorderResult` | Microphone recording via MediaRecorder |
| `useWakeLock` | `() => UseWakeLockResult` | Keep the screen awake (Screen Wake Lock API) |
| `useClipboard` | `(options?) => UseClipboardResult` | Copy to / read from the clipboard, reactive `copied` flag |
| `useShare` | `() => UseShareResult` | Web Share API with clipboard fallback |
| `useLinking` | `() => { openUrl }` | Open external URLs / deep links |
| `useNotifications` | `() => UseNotificationsResult` | Web Notification permission + display |
| `useBiometrics` | `() => UseBiometricsResult` | Biometric auth availability + prompt (native-backed) |
| `useDialog` | `(options?) => UseDialogResult` | Native `<dialog>` open/close state + focus handling |
| `useOnline` | `() => () => boolean` | Reactive `navigator.onLine` connectivity flag |
| `useCamera` | `() => UseCameraResult` | Photo capture via an `<input type=file capture>` picker |
| `useFilePicker` | `() => UseFilePickerResult` | Open a native file picker |
| `useHaptics` | `() => UseHapticsResult` | Imperative haptic feedback |
| `useImagePicker` | `() => UseImagePickerResult` | Pick an image from the gallery/camera roll |
| `useSafeArea` | `() => () => SafeAreaInsets` | Reactive safe-area insets (notch-aware) |
| `useScreenOrientation` | `() => UseScreenOrientationResult` | Reactive orientation + angle (read-only) |
| `useFetch` | `<T>(url) => UseFetchResult<T>` | Thin reactive JSON fetch — `{ data, error, isPending, refetch }` |
| `useSecureStorage` | `() => SecureStorage` | Imperative Keychain/Keystore-backed secret store |
| `useAuth` | `<User = unknown>() => UseAuthResult<User>` | Shared auth-state container (status/user/error + transitions) |
| `useDatabase` | `() => UseDatabaseResult` | A tiny local record store (insert/get/all/delete/find/count) |
| `useGeolocation` | `(options?) => UseGeolocationResult` | Reactive device position (latitude/longitude/accuracy) |
| `useMap` | `(options?) => UseMapResult` | Shared map-view state (camera/markers/selection) |
| `useWebSocket` | `(url, options?) => UseWebSocketResult` | Reactive WebSocket client (isConnected/messages/error) |
| `usePush` | `() => UsePushResult` | Push-notification registration + inbox |
| `usePayments` | `() => UsePaymentsResult` | In-app purchase state (products/owned/purchasing) |
| `useAppState` | `() => () => AppStatePhase` | Reactive foreground/background app phase |
| `useCrashReporter` | `() => UseCrashReporterResult` | Crash record across restarts + breadcrumbs |

## Type Exports

| Type              | Description                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `UseToggleResult` | `&#123; value: () => boolean; toggle: () => void; setTrue: () => void; setFalse: () => void &#125;` |
| `UseHoverResult`  | `&#123; hovered: () => boolean; props: &#123; onMouseEnter, onMouseLeave &#125; &#125;`             |
| `UseFocusResult`  | `&#123; focused: () => boolean; props: &#123; onFocus, onBlur &#125; &#125;`                        |
| `Size`            | `&#123; width: number; height: number &#125;`                                                       |
| `WindowSize`      | `&#123; width: number; height: number &#125;`                                                       |
| `BreakpointMap`   | `Record<string, number>`                                                                            |
