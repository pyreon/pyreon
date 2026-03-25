---
title: Hooks
description: Collection of reactive hooks for DOM interactions, media queries, focus management, and more.
---

`@pyreon/hooks` provides a comprehensive set of reactive hooks built on Pyreon's signal-based reactivity system. Each hook returns reactive signals that automatically update your UI when values change. All hooks that attach DOM listeners use `onMount`/`onUnmount` for proper lifecycle management, so they must be called inside a Pyreon component.

<PackageBadge name="@pyreon/hooks" href="/docs/hooks" />

## Installation

::: code-group
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

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `initial` | `boolean` | `false` | Initial toggle state |

### Returns: `UseToggleResult`

| Property | Type | Description |
| --- | --- | --- |
| `value` | `() => boolean` | Reactive boolean getter |
| `toggle` | `() => void` | Flip the current value |
| `setTrue` | `() => void` | Set to `true` |
| `setFalse` | `() => void` | Set to `false` |

### Example

```ts
import { useToggle } from '@pyreon/hooks'

const { value, toggle, setTrue, setFalse } = useToggle(false)

value()    // false
toggle()
value()    // true
setFalse()
value()    // false
setTrue()
value()    // true
```

### Disclosure Pattern

```tsx
import { defineComponent } from '@pyreon/core'
import { useToggle } from '@pyreon/hooks'

const Accordion = defineComponent<{ title: string }>((props) => {
  const { value: isOpen, toggle } = useToggle(false)

  return () => (
    <div class="accordion">
      <button
        onClick={toggle}
        aria-expanded={isOpen()}
      >
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

## usePrevious

Track the previous value of a reactive getter. Returns `undefined` on the first read, then returns the prior value each time the source changes.

### Signature

```ts
function usePrevious<T>(getter: () => T): () => T | undefined
```

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `getter` | `() => T` | A reactive getter (signal or function that reads signals) |

### Returns

`() => T | undefined` -- a reactive getter returning the previous value, or `undefined` before the first change.

### Example

```ts
import { usePrevious } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

const count = signal(0)
const prev = usePrevious(count)

prev()  // undefined (no previous value yet)
count.set(1)
prev()  // 0
count.set(5)
prev()  // 1
count.set(5)  // same value
prev()  // 5 (tracks every call, even if value doesn't change)
```

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
      <button onClick={() => currentSlide.update(n => n - 1)}>Prev</button>
      <button onClick={() => currentSlide.update(n => n + 1)}>Next</button>
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
      <textarea
        value={text()}
        onInput={(e) => text.set(e.target.value)}
      />
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

| Parameter | Type | Description |
| --- | --- | --- |
| `getter` | `() => T` | A reactive getter to debounce |
| `delayMs` | `number` | Debounce delay in milliseconds |

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
        {results().map((r) => <li key={r.id}>{r.title}</li>)}
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

| Property | Type | Description |
| --- | --- | --- |
| `hovered` | `() => boolean` | Reactive hover state |
| `props.onMouseEnter` | `() => void` | Handler to set hovered to true |
| `props.onMouseLeave` | `() => void` | Handler to set hovered to false |

### Example

```ts
import { useHover } from '@pyreon/hooks'
import { h } from '@pyreon/core'

const { hovered, props } = useHover()

<div
  {...props}
  class={() => hovered() ? 'bg-blue-100' : 'bg-gray-100'}
>Hover me</div>
```

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
        boxShadow: hovered()
          ? '0 8px 24px rgba(0,0,0,0.15)'
          : '0 2px 8px rgba(0,0,0,0.08)',
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

| Property | Type | Description |
| --- | --- | --- |
| `focused` | `() => boolean` | Reactive focus state |
| `props.onFocus` | `() => void` | Handler to set focused to true |
| `props.onBlur` | `() => void` | Handler to set focused to false |

### Example

```ts
import { useFocus } from '@pyreon/hooks'
import { h } from '@pyreon/core'

const { focused, props } = useFocus()

<input
  {...props}
  class={() => focused() ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-300'}
/>
```

### Focus Ring with Label

```tsx
const FloatingLabelInput = defineComponent<{ label: string }>((props) => {
  const { focused, props: focusProps } = useFocus()

  return () => (
    <div class={`input-wrapper ${focused() ? 'focused' : ''}`}>
      <label class={focused() ? 'label-float' : 'label-default'}>
        {props.label}
      </label>
      <input {...focusProps} />
    </div>
  )
})
```

## useClickOutside

Call a handler function when a click (or touch) occurs outside the referenced element. Listens on both `mousedown` and `touchstart` in the capture phase for reliable detection.

### Signature

```ts
function useClickOutside(
  getEl: () => HTMLElement | null,
  handler: () => void,
): void
```

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `getEl` | `() => HTMLElement \| null` | Getter returning the target element |
| `handler` | `() => void` | Called when a click occurs outside the element |

### Example

```ts
import { useClickOutside } from '@pyreon/hooks'

let dropdownEl: HTMLElement | null = null

useClickOutside(
  () => dropdownEl,
  () => { /* close the dropdown */ }
)
```

### Dropdown Menu Example

```tsx
const DropdownMenu = defineComponent(() => {
  const { value: isOpen, toggle, setFalse: close } = useToggle()
  let menuEl: HTMLElement | null = null

  useClickOutside(() => menuEl, close)

  return () => (
    <div ref={(el) => (menuEl = el)} class="dropdown">
      <button onClick={toggle}>
        Menu {isOpen() ? '▲' : '▼'}
      </button>
      {isOpen() && (
        <ul class="dropdown-menu">
          <li><a href="/profile">Profile</a></li>
          <li><a href="/settings">Settings</a></li>
          <li><button onClick={() => { logout(); close(); }}>Logout</button></li>
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

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `string` | (required) | The `KeyboardEvent.key` value to match (e.g., `"Escape"`, `"Enter"`, `"ArrowDown"`) |
| `handler` | `(event: KeyboardEvent) => void` | (required) | Called when the key matches |
| `options.event` | `'keydown' \| 'keyup'` | `'keydown'` | Which keyboard event to listen for |
| `options.target` | `EventTarget` | `document` | The target to attach the listener to |

### Example

```ts
import { useKeyboard } from '@pyreon/hooks'

// Close modal on Escape
useKeyboard('Escape', () => {
  closeModal()
})

// Submit on Enter with keyup
useKeyboard('Enter', (e) => {
  e.preventDefault()
  submitForm()
}, { event: 'keyup' })
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
    activeIndex.update(i => Math.min(i + 1, items.length - 1))
  })

  useKeyboard('ArrowUp', (e) => {
    e.preventDefault()
    activeIndex.update(i => Math.max(i - 1, 0))
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

Trap Tab and Shift+Tab navigation within a container element. When the user tabs past the last focusable element, focus wraps to the first, and vice versa. Essential for accessible modals and dialogs.

Focusable elements include: `a[href]`, `button:not([disabled])`, `textarea:not([disabled])`, `input:not([disabled])`, `select:not([disabled])`, and `[tabindex]:not([tabindex="-1"])`.

### Signature

```ts
function useFocusTrap(getEl: () => HTMLElement | null): void
```

### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `getEl` | `() => HTMLElement \| null` | Getter returning the container element |

### Example

```ts
import { useFocusTrap } from '@pyreon/hooks'

let modalEl: HTMLElement | null = null

useFocusTrap(() => modalEl)
```

### Accessible Modal Example

```tsx
const Modal = defineComponent<{ onClose: () => void }>((props) => {
  let modalEl: HTMLElement | null = null

  useFocusTrap(() => modalEl)
  useKeyboard('Escape', props.onClose)

  const { lock, unlock } = useScrollLock()

  // Lock scroll when modal opens, unlock when it closes
  onMount(() => { lock() })
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

| Parameter | Type | Description |
| --- | --- | --- |
| `getEl` | `() => HTMLElement \| null` | Getter returning the element to observe |

### Returns

`() => Size` where `Size` is `&#123; width: number; height: number &#125;`. Returns `&#123; width: 0, height: 0 &#125;` before mount or if the element is null.

### Example

```ts
import { useElementSize } from '@pyreon/hooks'

let containerEl: HTMLElement | null = null

const size = useElementSize(() => containerEl)

// In a reactive context:
size().width   // current width in pixels
size().height  // current height in pixels
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
      <p class="debug">Container: {size().width}x{size().height}px ({columns()} columns)</p>
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

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `throttleMs` | `number` | `200` | Throttle interval in milliseconds |

### Returns

`() => WindowSize` where `WindowSize` is `&#123; width: number; height: number &#125;`. Initializes with the current window dimensions (or `&#123; width: 0, height: 0 &#125;` on the server).

### Example

```ts
import { useWindowResize } from '@pyreon/hooks'

const windowSize = useWindowResize(200)

windowSize().width   // window.innerWidth
windowSize().height  // window.innerHeight
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
        <p>Window: {windowSize().width} x {windowSize().height}</p>
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

| Parameter | Type | Description |
| --- | --- | --- |
| `query` | `string` | A CSS media query string (e.g., `"(min-width: 768px)"`) |

### Returns

`() => boolean` -- reactive getter that reflects the current match state.

### Example

```ts
import { useMediaQuery } from '@pyreon/hooks'

const isWide = useMediaQuery('(min-width: 1024px)')
isWide()  // true or false

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

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `breakpoints` | `BreakpointMap` | `&#123; xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 &#125;` | Map of breakpoint names to minimum widths in pixels |

### Returns

`() => string` -- reactive getter returning the name of the currently active breakpoint.

### Default Breakpoints

| Name | Min Width |
| --- | --- |
| `xs` | 0px |
| `sm` | 576px |
| `md` | 768px |
| `lg` | 992px |
| `xl` | 1200px |
| `xxl` | 1400px |

### Example

```ts
import { useBreakpoint } from '@pyreon/hooks'

const bp = useBreakpoint()
bp()  // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
```

### Custom Breakpoints

```ts
const bp = useBreakpoint({
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
})
bp()  // 'mobile' | 'tablet' | 'desktop' | 'wide'
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
      case 'xl': return 4
      case 'lg': return 3
      case 'md': return 2
      default: return 1
    }
  }

  return () => (
    <div style={{ gridTemplateColumns: `repeat(${columns()}, 1fr)` }}>
      {products.map((p) => <ProductCard product={p} />)}
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
scheme()  // 'light' or 'dark'
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
    htmlAttrs: { "data-theme": activeTheme() },
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

  return () => (
    <img
      src={scheme() === 'dark' ? '/logo-light.svg' : '/logo-dark.svg'}
      alt="Logo"
    />
  )
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
prefersReduced()  // true or false
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
        transition: prefersReduced()
          ? 'none'
          : 'transform 0.3s ease, box-shadow 0.3s ease',
        transform: hovered() && !prefersReduced()
          ? 'scale(1.05)'
          : 'scale(1)',
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

| Property | Type | Description |
| --- | --- | --- |
| `lock` | `() => void` | Lock scrolling (increments lock count) |
| `unlock` | `() => void` | Unlock scrolling (decrements lock count) |

### Example

```ts
import { useScrollLock } from '@pyreon/hooks'

const { lock, unlock } = useScrollLock()

lock()    // body overflow set to 'hidden'
unlock()  // body overflow restored
```

Multiple calls to `lock()` from the same hook instance are idempotent -- calling `lock()` when already locked is a no-op. The same applies to `unlock()`.

### Modal Overlay Example

```tsx
const FullScreenOverlay = defineComponent<{ onClose: () => void }>((props) => {
  const { lock, unlock } = useScrollLock()

  onMount(() => { lock() })
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

| Parameter | Type | Description |
| --- | --- | --- |
| `getEl` | `() => HTMLElement \| null` | Getter returning the element to observe |
| `options` | `IntersectionObserverInit` | Standard IntersectionObserver options (`root`, `rootMargin`, `threshold`) |

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
      {loaded()
        ? <img src={props.src} alt={props.alt} />
        : <div class="placeholder" />
      }
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
      {items().map((item) => <ItemCard item={item} key={item.id} />)}
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
    <section
      ref={(el) => (sectionEl = el)}
      class={hasAppeared() ? 'animate-in' : 'animate-hidden'}
    >
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
  onMount(() => { lock() })
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
            {windowSize().width}x{windowSize().height} |
            {bp()} | {scheme()} |
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
      {debouncedHover() && (
        <div class="tooltip">{props.text}</div>
      )}
    </span>
  )
})
```

## API Reference

| Hook | Signature | Description |
| --- | --- | --- |
| `useToggle` | `(initial?) => UseToggleResult` | Boolean toggle with `toggle`, `setTrue`, `setFalse` |
| `usePrevious` | `(getter) => () => T \| undefined` | Track the previous value of a reactive getter |
| `useDebouncedValue` | `(getter, delayMs) => () => T` | Debounce a reactive value |
| `useHover` | `() => UseHoverResult` | Track hover state with spreadable props |
| `useFocus` | `() => UseFocusResult` | Track focus/blur state with spreadable props |
| `useClickOutside` | `(getEl, handler) => void` | Call handler on clicks outside an element |
| `useKeyboard` | `(key, handler, options?) => void` | Listen for specific key presses |
| `useFocusTrap` | `(getEl) => void` | Trap Tab focus within a container |
| `useElementSize` | `(getEl) => () => Size` | Observe element dimensions via ResizeObserver |
| `useWindowResize` | `(throttleMs?) => () => WindowSize` | Track window size with throttling |
| `useMediaQuery` | `(query) => () => boolean` | Subscribe to a CSS media query |
| `useBreakpoint` | `(breakpoints?) => () => string` | Get the active breakpoint name |
| `useColorScheme` | `() => () => 'light' \| 'dark'` | Detect light/dark mode preference |
| `useReducedMotion` | `() => () => boolean` | Detect reduced-motion preference |
| `useScrollLock` | `() => &#123; lock, unlock &#125;` | Lock/unlock page scrolling |
| `useIntersection` | `(getEl, options?) => () => IntersectionObserverEntry \| null` | Observe element intersection |

## Type Exports

| Type | Description |
| --- | --- |
| `UseToggleResult` | `&#123; value: () => boolean; toggle: () => void; setTrue: () => void; setFalse: () => void &#125;` |
| `UseHoverResult` | `&#123; hovered: () => boolean; props: &#123; onMouseEnter, onMouseLeave &#125; &#125;` |
| `UseFocusResult` | `&#123; focused: () => boolean; props: &#123; onFocus, onBlur &#125; &#125;` |
| `Size` | `&#123; width: number; height: number &#125;` |
| `WindowSize` | `&#123; width: number; height: number &#125;` |
| `BreakpointMap` | `Record<string, number>` |
