---
title: Kinetic
description: CSS-transition-based animation components for Pyreon — enter/leave transitions, staggered groups, height collapse, and keyed list animations.
---

`@pyreon/kinetic` is a CSS-transition animation engine for Pyreon. A single factory — `kinetic(tag)` — produces a renderable, chainable component that animates an element as it enters and leaves the DOM. There are no JavaScript animation loops: kinetic applies CSS classes or inline styles at the right frames of the transition lifecycle and lets the browser do the work.

<PackageBadge name="@pyreon/kinetic" href="/docs/kinetic" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/kinetic
```

```bash [bun]
bun add @pyreon/kinetic
```

```bash [pnpm]
pnpm add @pyreon/kinetic
```

```bash [yarn]
yarn add @pyreon/kinetic
```

:::

## Quick Start

`kinetic(tag)` returns a component. Configure it by chaining, then render it with a reactive `show` accessor:

```tsx
import { kinetic, fade } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'

// Define once — chaining is immutable, so FadeBox is reusable.
const FadeBox = kinetic('div').preset(fade)

function App() {
  const visible = signal(true)

  return (
    <div>
      <button onClick={() => visible.update((v) => !v)}>Toggle</button>
      <FadeBox show={() => visible()}>
        <p>I fade in and out.</p>
      </FadeBox>
    </div>
  )
}
```

<Example file="./examples/kinetic/animated-transition-opacity-transform" title="Animated transition — opacity + transform" />

## Why Kinetic?

Most animation libraries ship a keyframe runtime, a timeline scheduler, or a `requestAnimationFrame` loop. Kinetic ships none of that — it leans entirely on native CSS transitions:

```tsx
// ❌ JS-driven animation — a rAF loop ticking every frame, allocating per instance
let raf
function animate() {
  el.style.opacity = String(progress)
  raf = requestAnimationFrame(animate)
}

// ✅ kinetic — apply the start + end CSS, let the compositor interpolate
const FadeBox = kinetic('div').preset(fade)
;<FadeBox show={() => visible()}>…</FadeBox>
```

What kinetic does instead:

- Drives visibility from a reactive `show: () => boolean` accessor — flip the signal, kinetic runs the enter or leave phase.
- Applies your enter/leave **classes** (utility-class workflows) **or** inline **style objects** (zero-CSS workflows) across a precise double-`requestAnimationFrame` so the transition actually triggers.
- Listens for `transitionend` / `animationend` to know when the animation is done, with a safety timeout so a never-firing event can't strand the element forever.
- Unmounts (or hides) the element after the leave phase completes — no manual cleanup.
- Renders structural content on the server even when `show` is `false` at SSR time (see [SSR Behavior](#ssr-behavior)).

## The Four Modes

`kinetic(tag)` starts in **transition** mode. Chain methods switch it into one of the other three. Each mode renders `tag` as the container and accepts a different prop set.

| Mode | Created via | Animates | Required props |
| --- | --- | --- | --- |
| `transition` | `kinetic('div')` (default) | A single element entering/leaving | `show`, `children` (one child) |
| `collapse` | `.collapse()` | Height between `0` and `auto` | `show`, `children` |
| `stagger` | `.stagger()` | A list of children, sequenced | `show`, `children` (array) |
| `group` | `.group()` | A keyed list — adds/removes animate | `children` (keyed array) — **no `show`** |

```tsx
import { kinetic, fade, slideUp } from '@pyreon/kinetic'

const FadeBox = kinetic('div').preset(fade) //              → transition
const Accordion = kinetic('div').collapse() //              → collapse
const StaggerList = kinetic('ul').preset(slideUp).stagger() // → stagger
const AnimatedList = kinetic('ul').preset(fade).group() //   → group
```

:::note{title="Chaining is immutable"}
Every chain method returns a **new** component with merged config — the original is untouched. Define your animated components once at module scope (or once per definition) and reuse them; building a fresh `kinetic('div').preset(...)` inside a render body re-creates the component on every call.
:::

## Transition Mode

The default mode wraps a single child and runs an enter animation when `show` becomes `true`, a leave animation when it becomes `false`.

### Style-based transitions

Inline style objects are the zero-CSS path — no stylesheet or utility classes required. Provide a start state, an end state, and a CSS `transition` shorthand for each phase:

```tsx
const FadeBox = kinetic('div')
  .enter({ opacity: 0 })
  .enterTo({ opacity: 1 })
  .enterTransition('opacity 300ms ease-out')
  .leave({ opacity: 1 })
  .leaveTo({ opacity: 0 })
  .leaveTransition('opacity 200ms ease-in')

;<FadeBox show={() => visible()}>
  <div>Fading content</div>
</FadeBox>
```

The chain methods map directly onto the transition fields:

| Method | Field set | Applied |
| --- | --- | --- |
| `.enter(styles)` | `enterStyle` | First frame of the enter phase |
| `.enterTo(styles)` | `enterToStyle` | Second frame of enter, kept until complete |
| `.enterTransition(value)` | `enterTransition` | CSS `transition` shorthand during enter |
| `.leave(styles)` | `leaveStyle` | First frame of the leave phase |
| `.leaveTo(styles)` | `leaveToStyle` | Second frame of leave, kept until complete |
| `.leaveTransition(value)` | `leaveTransition` | CSS `transition` shorthand during leave |

### Class-based transitions

For utility-class CSS (Tailwind, UnoCSS, or hand-written classes), use `.enterClass()` / `.leaveClass()`. Each takes `{ active, from, to }`:

```tsx
const FadeBox = kinetic('div')
  .enterClass({
    active: 'transition-opacity duration-300',
    from: 'opacity-0',
    to: 'opacity-100',
  })
  .leaveClass({
    active: 'transition-opacity duration-200',
    from: 'opacity-100',
    to: 'opacity-0',
  })

;<FadeBox show={() => visible()}>
  <div>Animated content</div>
</FadeBox>
```

The `{ active, from, to }` shape maps onto the underlying class fields:

| `.enterClass()` key | Field | When it is applied |
| --- | --- | --- |
| `active` | `enter` | Whole enter phase |
| `from` | `enterFrom` | First frame, removed on the next frame |
| `to` | `enterTo` | Second frame, kept until the animation completes |

`.leaveClass()` maps `active`/`from`/`to` onto `leave` / `leaveFrom` / `leaveTo` the same way.

### Presets

`.preset(p)` merges a preset's fields into the config in one call. It is equivalent to spreading the preset's `enterStyle`/`enterToStyle`/`enterTransition`/… onto the chain, so you can override individual phases afterward:

```tsx
import { kinetic, fade, slideUp } from '@pyreon/kinetic'

const FadeBox = kinetic('div').preset(fade)

// Start from a preset, then customize one phase
const SlowSlide = kinetic('section').preset(slideUp).enterTransition('opacity 600ms ease, transform 600ms ease')
```

Six presets ship from `@pyreon/kinetic` directly — `fade`, `scaleIn`, `slideUp`, `slideDown`, `slideLeft`, `slideRight` — plus the aggregate `presets` object (`presets.fade`, `presets.slideUp`, …). For the full library of parameterized factories and composition helpers, see [`@pyreon/kinetic-presets`](/docs/kinetic-presets) (120+ presets); a `@pyreon/kinetic-presets` factory result is just a `Preset` object you pass to `.preset(...)`.

```tsx
import { kinetic } from '@pyreon/kinetic'
import { fadeUp } from '@pyreon/kinetic-presets'

const Hero = kinetic('div').preset(fadeUp())
```

### Lifecycle callbacks

`.on()` attaches callbacks fired across the transition lifecycle (callbacks can also be passed as props on the rendered component):

```tsx
const Notice = kinetic('div')
  .preset(slideUp)
  .on({
    onEnter: () => console.log('entering'),
    onAfterEnter: () => console.log('entered'),
    onLeave: () => console.log('leaving'),
    onAfterLeave: () => console.log('left'),
  })
```

| Callback | Fires |
| --- | --- |
| `onEnter` | Immediately when the enter phase begins |
| `onAfterEnter` | When the enter animation completes |
| `onLeave` | Immediately when the leave phase begins |
| `onAfterLeave` | When the leave animation completes (right before unmount) |

### Unmount vs. hide

By default a transition-mode component **unmounts** its child after the leave animation finishes. Pass `unmount={false}` (or `.config({ unmount: false })`) to keep the element in the DOM with `display: none` instead — useful when you need to preserve scroll position or focus state across a hide/show cycle:

```tsx
const Panel = kinetic('div').preset(fade).config({ unmount: false })
```

:::note{title="unmount only applies to transition mode"}
`unmount` is a transition-mode option. Collapse keeps its content in the DOM and animates height; stagger and group manage their own per-child lifecycle.
:::

## Collapse Mode

`.collapse()` switches to a height animation between `0` and `auto`, ideal for accordions and disclosure widgets. The `tag` becomes an `overflow: hidden` wrapper; kinetic measures the content's `scrollHeight` to compute the target height, animates to it, then sets `height: auto` so the content stays responsive.

```tsx
const Accordion = kinetic('div').collapse()

function FAQ() {
  const open = signal(false)
  return (
    <div>
      <button onClick={() => open.update((v) => !v)}>Toggle answer</button>
      <Accordion show={() => open()}>
        <p>Collapsible content that can be any height.</p>
      </Accordion>
    </div>
  )
}
```

Tune the height transition either on the chain or as a prop:

```tsx
// On the chain
const SlowAccordion = kinetic('div').collapse({ transition: 'height 500ms ease-in-out' })

// As a prop
;<Accordion show={() => open()} transition="height 500ms ease-in-out">
  …
</Accordion>
```

| Prop / option | Type | Default | Description |
| --- | --- | --- | --- |
| `show` | `() => boolean` | — | Reactive accessor for expanded/collapsed state |
| `transition` | `string` | `"height 300ms ease"` | CSS transition for the height animation |
| `appear` | `boolean` | `false` | Animate open on initial mount |
| `timeout` | `number` | `5000` | Safety timeout (ms) for the animation-end fallback |

## Stagger Mode

`.stagger()` sequences a list of children — each child's animation starts `interval` ms after the previous one. The `tag` wraps the children as a container; each child is animated individually.

```tsx
const StaggerList = kinetic('ul')
  .preset(slideUp)
  .stagger({ interval: 80, reverseLeave: true })

function Menu() {
  const open = signal(true)
  return (
    <StaggerList show={() => open()}>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </StaggerList>
  )
}
```

`interval` and `reverseLeave` can be set on the chain (`.stagger({ interval, reverseLeave })`) or as props on the rendered component:

| Prop / option | Type | Default | Description |
| --- | --- | --- | --- |
| `show` | `() => boolean` | — | Reactive accessor controlling all children |
| `interval` | `number` | `50` | Delay (ms) between each child's animation start |
| `reverseLeave` | `boolean` | `false` | Reverse the stagger order on leave (last in, first out) |
| `appear` | `boolean` | `false` | Animate on initial mount |
| `timeout` | `number` | `5000` | Safety timeout (ms) per child |

Each child also receives the CSS custom properties `--stagger-index` and `--stagger-interval`, plus a computed `transition-delay`, so you can reference the stagger position from your own CSS if needed.

:::note{title="Stagger snapshots its children once"}
Stagger reads its children at render time and builds one animated item per child — it does not observe later changes to the child list. For a list whose entries are **added and removed at runtime**, use [Group Mode](#group-mode) instead, which is built for keyed enter/exit.
:::

## Group Mode

`.group()` animates a **keyed** list as entries are added and removed. Unlike the other modes there is **no `show` prop** — visibility is driven by which keys are present. A child with a new key animates in; a child whose key disappears stays mounted through its leave animation, then unmounts.

Because Pyreon components run once, pass the children as a **reactive accessor** `() => VNode[]` so the group can re-evaluate and diff the keys when your data changes:

```tsx
const AnimatedList = kinetic('ul').preset(fade).group()

function TodoList() {
  const todos = signal([
    { id: 1, text: 'Buy milk' },
    { id: 2, text: 'Walk the dog' },
  ])

  return (
    <AnimatedList>
      {() => todos().map((t) => <li key={t.id}>{t.text}</li>)}
    </AnimatedList>
  )
}
```

Every child **must carry a unique `key`** — group mode keys its enter/exit diff on it. Children without a key are skipped.

| Prop / option | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `VNode[] \| (() => VNode[])` | — | Keyed children, or an accessor returning them |
| `appear` | `boolean` | `false` | Animate the initial children on first mount |
| `timeout` | `number` | `5000` | Safety timeout (ms) per child |

:::tip
Group mode is the runtime-list analog of stagger mode. Reach for **stagger** when the list is fixed and you want a sequenced reveal; reach for **group** when items come and go and each addition/removal should animate.
:::

## Reactive `show` and Reduced Motion

Across transition, collapse, and stagger modes, `show` is a **reactive accessor** — `show={() => signal()}` — not a static boolean. kinetic subscribes to it and runs the enter phase when it flips `true`, the leave phase when it flips `false`.

kinetic also respects the user's motion preference. When `(prefers-reduced-motion: reduce)` matches, enter and leave **skip the transition** and jump to the final state immediately — your lifecycle callbacks (`onEnter` → `onAfterEnter`, `onLeave` → `onAfterLeave`) still fire so dependent logic stays correct. This is automatic; you don't configure it.

## SSR Behavior

kinetic follows the ecosystem norm (Framer Motion, react-transition-group, react-spring): **content is structural, animation is visual.** A transition that is hidden at server-render time still emits its children into the HTML.

Concretely, a component whose `show` evaluates to `false` during SSR renders its children with the **hidden-state class/style inlined** — `leaveTo` if you defined it, otherwise `enterFrom` (which covers the common scroll-reveal pattern that only configures the enter side). This matters for the canonical reveal-on-scroll setup, where an `IntersectionObserver` can't fire on the server:

```tsx
// `revealed` is false during SSR (no IntersectionObserver on the server),
// so without structural SSR the section would be ABSENT from the prerendered
// HTML — bad for SEO, social scrapers, and no-JS users.
const Reveal = kinetic('section').preset(slideUp)

;<Reveal show={() => revealed()}>
  <h2>Section heading</h2>
  <p>Important indexable content.</p>
</Reveal>
```

The prerendered HTML contains the heading and paragraph (with the hidden-state class/style applied); when the client hydrates and `show` flips `true`, the enter animation plays on the same element. The internal `applyEnter` clears the SSR-baked hidden class first so it can't fight the enter-to state.

:::warning{title="Initially-hidden transitions don't unmount on a later leave"}
For a component that starts **hidden** at SSR/mount, `unmount: true` no longer triggers a true DOM removal after a subsequent leave animation — the element stays in the DOM with the leave-to class applied (same trade-off as Framer Motion / react-transition-group). An **initially-visible** transition keeps the full unmount semantic for the visible → hidden transition. If you need a started-hidden element to be genuinely removed, drive its mount/unmount yourself outside kinetic.
:::

## Reactive Children and the Compiler

The Pyreon compiler may rewrite `<KineticList>{children}</KineticList>` so `children` arrives as a deferred accessor function rather than a plain `VNode[]`. kinetic handles this internally (via `resolveChildren`) — its renderers unwrap the accessor before iterating, so the documented APIs above work whether the compiler wraps children or not. kinetic deliberately **snapshots** children at render time for stagger and transition modes (animation state is built once per item); for a list that changes at runtime, use [group mode](#group-mode) with an accessor as shown above.

## Hooks

These two low-level hooks power the renderers and are exported for advanced use — building a custom animated primitive, or driving an animation lifecycle by hand. Most apps never need them.

### `useTransitionState`

Owns the enter/leave **state machine** that the transition renderer consumes. It returns the current `stage` (a signal), a `ref` callback to attach to the transitioning element, a reactive `shouldMount` accessor, and a `complete()` function to call when the current animation finishes.

```tsx
import { useTransitionState } from '@pyreon/kinetic'

const { stage, ref, shouldMount, complete } = useTransitionState({
  show: () => visible(),
  appear: true,
})

// stage()        → 'hidden' | 'entering' | 'entered' | 'leaving'
// shouldMount()  → false only while 'hidden'
// ref            → attach to your element so appear can fire once wired
// complete()     → entering → entered, leaving → hidden
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `show` | `() => boolean` | — | Reactive accessor controlling visibility |
| `appear` | `boolean` | `false` | Run the enter animation on initial mount |

### `useAnimationEnd`

Listens for `transitionend` / `animationend` on an element while `active` is true, and calls `onEnd` exactly once when the animation finishes — or after `timeout` ms as a safety fallback if the event never fires. It ignores events bubbling from child elements.

```tsx
import { useAnimationEnd } from '@pyreon/kinetic'

useAnimationEnd({
  ref: elementRef, // a Ref<HTMLElement>
  active: () => stage() === 'entering' || stage() === 'leaving',
  timeout: 5000,
  onEnd: () => complete(),
})
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `ref` | `Ref<HTMLElement>` | — | Ref to the element to watch |
| `active` | `() => boolean` | — | Reactive accessor — listen only while true |
| `onEnd` | `() => void` | — | Called once when the animation finishes (or on timeout) |
| `timeout` | `number` | `5000` | Safety timeout (ms) — guards against a never-firing event |

## Transition Stages

Every transition moves through four stages, exposed as the `stage` signal from `useTransitionState`:

| Stage | Description |
| --- | --- |
| `hidden` | Element is not mounted (or has `display: none` when `unmount={false}`) |
| `entering` | Enter class/style applied, animation in progress |
| `entered` | Enter animation complete, element fully visible |
| `leaving` | Leave class/style applied, animation in progress |

## API Reference

### `kinetic(tag)`

Creates a renderable, chainable kinetic component in **transition** mode.

```ts
function kinetic<Tag extends string>(tag: Tag): KineticComponent<Tag, 'transition'>
```

`tag` is the HTML tag rendered as the container (`'div'`, `'ul'`, `'section'`, …). The returned value is both a component (render it with JSX) and a chain object (call the methods below — each returns a new component).

### Chain methods

| Method | Returns | Description |
| --- | --- | --- |
| `.preset(preset)` | same mode | Merge a `Preset`'s style/class fields into the config |
| `.enter(styles)` | same mode | Set the enter start style (`enterStyle`) |
| `.enterTo(styles)` | same mode | Set the enter end style (`enterToStyle`) |
| `.enterTransition(value)` | same mode | Set the enter CSS transition shorthand |
| `.leave(styles)` | same mode | Set the leave start style (`leaveStyle`) |
| `.leaveTo(styles)` | same mode | Set the leave end style (`leaveToStyle`) |
| `.leaveTransition(value)` | same mode | Set the leave CSS transition shorthand |
| `.enterClass({ active, from, to })` | same mode | Set enter classes (`enter` / `enterFrom` / `enterTo`) |
| `.leaveClass({ active, from, to })` | same mode | Set leave classes (`leave` / `leaveFrom` / `leaveTo`) |
| `.on(callbacks)` | same mode | Attach lifecycle callbacks |
| `.config(opts)` | same mode | Set mode-specific options (`appear`, `unmount`, `timeout`, `transition`, `interval`, `reverseLeave`) |
| `.collapse(opts?)` | `'collapse'` mode | Switch to collapse mode; `opts.transition` sets the height transition |
| `.stagger(opts?)` | `'stagger'` mode | Switch to stagger mode; `opts.interval`, `opts.reverseLeave` |
| `.group()` | `'group'` mode | Switch to keyed-list group mode |

`.config(opts)` accepts only the options valid for the current mode — `{ appear, unmount, timeout }` in transition mode, `{ appear, timeout, transition }` in collapse, `{ appear, timeout, interval, reverseLeave }` in stagger, `{ appear, timeout }` in group.

### Component props

The props a kinetic component accepts depend on its mode:

| Prop | transition | collapse | stagger | group | Description |
| --- | :-: | :-: | :-: | :-: | --- |
| `show` | ✓ | ✓ | ✓ | — | Reactive `() => boolean` visibility accessor |
| `children` | one child | content | array | keyed array / accessor | The content to animate |
| `appear` | ✓ | ✓ | ✓ | ✓ | Animate on initial mount (default `false`) |
| `timeout` | ✓ | ✓ | ✓ | ✓ | Safety timeout in ms (default `5000`) |
| `unmount` | ✓ | — | — | — | Unmount on leave vs. `display:none` (default `true`) |
| `transition` | — | ✓ | — | — | Height transition (default `"height 300ms ease"`) |
| `interval` | — | — | ✓ | — | Delay between children in ms (default `50`) |
| `reverseLeave` | — | — | ✓ | — | Reverse stagger order on leave (default `false`) |
| `onEnter` / `onAfterEnter` / `onLeave` / `onAfterLeave` | ✓ | ✓ | ✓ | ✓ | Lifecycle callbacks |

Props passed on the rendered component override the same field set on the chain. Any other prop (`class`, `style`, `id`, event handlers, …) is forwarded to the rendered `tag` element with full reactivity preserved.

### Presets

```ts
import { fade, scaleIn, slideUp, slideDown, slideLeft, slideRight, presets } from '@pyreon/kinetic'
import type { Preset } from '@pyreon/kinetic'
```

| Export | Type | Description |
| --- | --- | --- |
| `fade` | `Preset` | Opacity 0 → 1 |
| `scaleIn` | `Preset` | Opacity + `scale(0.95)` → `scale(1)` |
| `slideUp` | `Preset` | Opacity + `translateY(16px)` → `0` |
| `slideDown` | `Preset` | Opacity + `translateY(-16px)` → `0` |
| `slideLeft` | `Preset` | Opacity + `translateX(16px)` → `0` |
| `slideRight` | `Preset` | Opacity + `translateX(-16px)` → `0` |
| `presets` | `Record<string, Preset>` | Object of all six (`presets.fade`, …) |
| `Preset` | type | `StyleTransitionProps & ClassTransitionProps` |

For the full library see [`@pyreon/kinetic-presets`](/docs/kinetic-presets).

### Hooks

| Export | Signature | Description |
| --- | --- | --- |
| `useTransitionState` | `({ show, appear? }) => { stage, ref, shouldMount, complete }` | Enter/leave state machine |
| `useAnimationEnd` | `({ ref, active, onEnd, timeout? }) => void` | One-shot transition/animation-end listener with timeout fallback |

### Types

| Type | Description |
| --- | --- |
| `KineticComponent<Tag, Mode>` | A renderable + chainable kinetic component |
| `Preset` | A preset object (`StyleTransitionProps & ClassTransitionProps`) |
| `TransitionStage` | `'hidden' \| 'entering' \| 'entered' \| 'leaving'` |
| `ClassTransitionProps` | The `enter` / `enterFrom` / `enterTo` / `leave` / `leaveFrom` / `leaveTo` class fields |
| `StyleTransitionProps` | The `enterStyle` / `enterToStyle` / `enterTransition` / `leaveStyle` / `leaveToStyle` / `leaveTransition` style fields |
| `TransitionCallbacks` | `onEnter` / `onAfterEnter` / `onLeave` / `onAfterLeave` |
| `TransitionStateResult` | Return shape of `useTransitionState` |
| `UseTransitionState` | Signature type of `useTransitionState` |
| `UseAnimationEnd` | Signature type of `useAnimationEnd` |
