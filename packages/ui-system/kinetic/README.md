# @pyreon/kinetic

CSS-transition animation library — enter/exit, stagger, collapse, list reconciliation, ~3KB.

`@pyreon/kinetic` delegates interpolation to the browser's CSS transition engine (GPU compositor thread for `transform` / `opacity`) and only handles orchestration: mount/unmount lifecycle, stagger timing, height measurement, and key-based list diffing. The result is 60/120fps animations with a 3.2KB footprint and four composable modes (transition, collapse, stagger, group) accessed through a chainable, immutable API. Pair with `@pyreon/kinetic-presets` for 120+ ready-made animations, or define your own via inline `.enter()` / `.enterTo()` styles or class-based transitions (Tailwind, CSS modules). Reduced-motion is detected automatically; SSR renders children in their hidden-state class so scroll-reveal patterns reach SEO crawlers.

## Install

```bash
bun add @pyreon/kinetic @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
```

## Quick start

```tsx
import { kinetic, fade, slideUp } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'

const FadeDiv = kinetic('div').preset(fade)
const SlideSection = kinetic('section').preset(slideUp)

const show = signal(true)
<FadeDiv show={show()}>Hello, world!</FadeDiv>
```

## How it compares

| Library                | Gzipped    | Engine              | Enter/Exit | Stagger | List Recon. | Collapse | Reduced Motion |
| ---------------------- | ---------- | ------------------- | ---------- | ------- | ----------- | -------- | -------------- |
| **@pyreon/kinetic**    | **3.2 KB** | CSS transitions     | Yes        | Yes     | Yes         | Yes      | Yes            |
| Motion (framer-motion) | ~34 KB     | JS (rAF + WAAPI)    | Yes        | Yes     | Yes         | Quirky   | Yes            |
| @react-spring/web      | ~16-24 KB  | JS (spring physics) | Yes        | Partial | Yes         | Manual   | Yes            |
| react-transition-group | ~5 KB      | CSS classes         | Yes        | No      | Yes         | No       | No             |
| AutoAnimate            | ~2.5 KB    | JS (FLIP)           | Yes        | No      | Yes         | No       | Yes            |

Key advantages: 10x smaller than Motion for CSS-transition use cases; only library combining CSS transitions + stagger + collapse + key-based list reconciliation; 120+ presets via `@pyreon/kinetic-presets`.

## `kinetic(tag)` — animated component factory

```ts
kinetic('div')           // HTML element string
kinetic('section')
kinetic(MyComponent)     // Any Pyreon component
```

Returns a renderable Pyreon component with chain methods. Default mode: **transition**.

## Chain methods

Every method returns a new component (immutable). The tag generic flows through, preserving HTML attribute types.

```ts
// Inline style-based config
.enter(styles)            // CSSProperties at enter start
.enterTo(styles)          // CSSProperties after first frame
.enterTransition(value)   // CSS transition string
.leave(styles)            // CSSProperties at leave start
.leaveTo(styles)          // CSSProperties after first frame
.leaveTransition(value)

// Class-based config (Tailwind / CSS modules friendly)
.enterClass({ active?, from?, to? })
.leaveClass({ active?, from?, to? })

// Preset (spreads style + class props)
.preset(preset)

// Behaviour
.config({ appear, unmount, timeout, ... })
.on({ onEnter, onAfterEnter, onLeave, onAfterLeave })

// Mode switches
.collapse(opts?)          // Height-animation mode
.stagger(opts?)           // Staggered-children mode
.group()                  // Key-based list reconciliation mode
```

## Four modes

### Transition (default)

Single-element enter/leave with CSS transitions.

```tsx
const FadeDiv = kinetic('div').preset(fade)
<FadeDiv show={isOpen}>Content</FadeDiv>
```

### Collapse

Height animation with `overflow: hidden`. Measures `scrollHeight` automatically.

```tsx
const Accordion = kinetic('div').collapse()
const FancyAccordion = kinetic('section').collapse({
  transition: 'height 400ms cubic-bezier(0.4, 0, 0.2, 1)',
})

<Accordion show={isExpanded}>Expandable content</Accordion>
```

### Stagger

Staggered entrance/exit for child elements.

```tsx
const StaggerList = kinetic('ul').preset(slideUp).stagger({ interval: 75 })

<StaggerList show={isVisible}>
  <li key="1">Item 1</li>
  <li key="2">Item 2</li>
  <li key="3">Item 3</li>
</StaggerList>
```

### Group

Key-based enter/exit — adding a keyed child triggers enter; removing triggers leave + unmount. No `show` prop.

```tsx
const AnimatedList = kinetic('ul').preset(fade).group()

<AnimatedList>
  {items.map((item) => <li key={item.id}>{item.text}</li>)}
</AnimatedList>
```

## Inline configuration

Build animations without presets:

```ts
const SlidePanel = kinetic('aside')
  .enter({ opacity: 0, transform: 'translateX(-100%)' })
  .enterTo({ opacity: 1, transform: 'translateX(0)' })
  .enterTransition('all 300ms ease-out')
  .leave({ opacity: 1, transform: 'translateX(0)' })
  .leaveTo({ opacity: 0, transform: 'translateX(-100%)' })
  .leaveTransition('all 200ms ease-in')
```

## Class-based transitions

Works with Tailwind CSS, CSS modules, or any class-based approach:

```ts
const TailwindFade = kinetic('div')
  .enterClass({ active: 'transition-opacity duration-300', from: 'opacity-0', to: 'opacity-100' })
  .leaveClass({ active: 'transition-opacity duration-200', from: 'opacity-100', to: 'opacity-0' })
```

## Lifecycle callbacks

```tsx
<FadeDiv
  show={isOpen}
  onEnter={() => console.log('entering')}
  onAfterEnter={() => console.log('entered')}
  onLeave={() => console.log('leaving')}
  onAfterLeave={() => console.log('left')}
>
  Content
</FadeDiv>
```

## Composition with rocketstyle

Kinetic and rocketstyle compose naturally:

```ts
import rocketstyle from '@pyreon/rocketstyle'

const Button = rocketstyle()({ component: 'button', name: 'Button' })
  .theme({ primaryColor: 'blue' })

const AnimatedButton = kinetic(Button).preset(fade)
// Has BOTH rocketstyle dimension props AND kinetic show/lifecycle props
<AnimatedButton show={isVisible} state="primary" size="large">Click me</AnimatedButton>
```

## Built-in presets

Six presets are included in the core package: `fade`, `scaleIn`, `slideUp`, `slideDown`, `slideLeft`, `slideRight`. For 120+ presets, factories, and composition utilities, add `@pyreon/kinetic-presets`.

## Low-level hooks

If you need transition state outside `kinetic()`:

```ts
import { useTransitionState, useAnimationEnd } from '@pyreon/kinetic'

const state = useTransitionState({ show: () => isOpen() })
// state.stage() → 'enter' | 'enter-active' | 'enter-to' | 'leave' | 'leave-active' | 'leave-to' | 'idle'
```

## Accessibility

Kinetic automatically detects `prefers-reduced-motion: reduce`. When enabled, animations are skipped instantly — callbacks still fire, but no visual animation occurs. No configuration needed.

## SSR / SSG

`<Transition show={() => false}>` **always renders children in SSR**, with the hidden-state class inlined (`leaveTo` if defined, else `enterFrom`). This matches Framer Motion / react-transition-group / react-spring conventions: content is structural, animation is visual.

Load-bearing for scroll-reveal on SSG sites — `useIntersection` can't fire on the server, so `show` is false at SSR. Without structural rendering, the wrapped content would be absent from prerendered HTML (bad for SEO, social scrapers, no-JS users).

```tsx
const RevealSection = kinetic('section')
  .enterClass({ active: 'transition-all duration-700', from: 'opacity-0 translate-y-8', to: 'opacity-100 translate-y-0' })

// SSR: <section class="opacity-0 translate-y-8">…full content…</section>
// Client: when scrolled into view, show flips true → enter animation runs
<RevealSection show={isInView}>
  <h2>Work Experience</h2>
  <p>…content reaches SEO crawlers and social scrapers…</p>
</RevealSection>
```

**Trade-off**: for an initially-hidden Transition, `unmount: true` (the default) no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. **Initially-visible** Transitions keep the runtime-unmount semantic unchanged. If you need true unmount on a started-hidden element, drive mount/unmount yourself outside `<Transition>`.

## Gotchas

- **Animations run on the GPU compositor thread** only when you animate `transform` / `opacity` / `filter`. Animating `width` / `height` / `top` / `left` falls back to the main thread and may jank.
- **Stagger `interval` is per-CHILD**, not total duration. Five children at 75ms = 375ms total stagger window.
- **Group mode requires keyed children.** Without `key=`, every render replaces every child and you get no animation. The compiler-suggested `<For each={items} by={i => i.id}>` is the idiomatic pattern.
- **SSR initial-hidden Transitions break true-unmount semantics.** See SSR / SSG section above — opt out by driving mount/unmount yourself.
- **Reduced-motion skips visuals but still fires callbacks.** Don't rely on the animation completing for state machine progression — use callbacks.

## Documentation

Full docs: [docs.pyreon.dev/docs/kinetic](https://docs.pyreon.dev/docs/kinetic) (or `docs/docs/kinetic.md` in this repo).

## License

MIT
