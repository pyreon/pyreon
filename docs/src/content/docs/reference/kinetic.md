---
title: "CSS-Transition Animations — API Reference"
description: "CSS-transition animations — kinetic(tag) chainable factory, 4 modes (transition/collapse/stagger/group), SSR-safe"
---

# @pyreon/kinetic — API Reference

> **Generated** from `kinetic`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [kinetic](/docs/kinetic).

CSS-transition animation engine for Pyreon. One factory — `kinetic(tag)` — produces a renderable, chainable component that animates an element as it enters and leaves the DOM. No JavaScript animation loop: kinetic applies your enter/leave classes or inline styles across a double-`requestAnimationFrame` and lets the browser's compositor interpolate, listening for `transitionend` / `animationend` (with a safety timeout) to know when it's done. Four modes: transition (single element enter/leave), collapse (height 0 ↔ auto), stagger (sequenced children), group (keyed-list enter/exit). Reduced motion is respected automatically; SSR always emits initially-hidden children with the hidden-state class inlined so scroll-reveal content reaches crawlers.

> **Peer dependencies:** `@pyreon/core`, `@pyreon/reactivity`, `@pyreon/runtime-dom` — install alongside this package.

## Features

- kinetic(tag) factory — renderable component + immutable chain in one value
- Four modes: transition (default), collapse (.collapse()), stagger (.stagger()), group (.group())
- Style-based (.enter/.enterTo/.enterTransition + leave siblings) and class-based (.enterClass/.leaveClass) config
- .preset(p) merges a Preset object — 6 built-ins here, 122 more in @pyreon/kinetic-presets
- Lifecycle callbacks via .on() or props: onEnter / onAfterEnter / onLeave / onAfterLeave
- prefers-reduced-motion respected automatically — visuals skipped, callbacks still fire
- SSR contract: initially-hidden content always emitted with hidden-state class inlined (SSG scroll-reveal safe)
- Low-level hooks exported: useTransitionState (state machine) + useAnimationEnd (end listener + timeout)

## Complete example

A full, end-to-end usage of the package:

```tsx
import { kinetic, fade, slideUp } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'

// Define once at module scope — chaining is IMMUTABLE (every method
// returns a new component), so each definition is reusable.
const FadeBox = kinetic('div').preset(fade)          // transition mode (default)
const Accordion = kinetic('div').collapse()          // collapse mode (height 0 <-> auto)
const StaggerList = kinetic('ul').preset(slideUp).stagger({ interval: 75 })
const AnimatedList = kinetic('ul').preset(fade).group() // keyed-list mode — no show prop

// Inline style-based config (zero-CSS path):
const SlidePanel = kinetic('aside')
  .enter({ opacity: 0, transform: 'translateX(-100%)' })
  .enterTo({ opacity: 1, transform: 'translateX(0)' })
  .enterTransition('all 300ms ease-out')
  .leave({ opacity: 1, transform: 'translateX(0)' })
  .leaveTo({ opacity: 0, transform: 'translateX(-100%)' })
  .leaveTransition('all 200ms ease-in')

// Class-based config (Tailwind / CSS modules):
const TailwindFade = kinetic('div')
  .enterClass({ active: 'transition-opacity duration-300', from: 'opacity-0', to: 'opacity-100' })
  .leaveClass({ active: 'transition-opacity duration-200', from: 'opacity-100', to: 'opacity-0' })

function App() {
  const visible = signal(true)
  const items = signal([{ id: 1, text: 'One' }, { id: 2, text: 'Two' }])
  return (
    <div>
      {/* show is a REACTIVE ACCESSOR, not a boolean */}
      <FadeBox show={() => visible()} onAfterEnter={() => console.warn('entered')}>
        <p>Fading content</p>
      </FadeBox>
      <Accordion show={() => visible()} transition="height 400ms ease-in-out">
        <p>Collapsible content</p>
      </Accordion>
      {/* Group mode: keyed children via an accessor — additions animate in,
          removals animate out then unmount */}
      <AnimatedList>
        {() => items().map((t) => <li key={t.id}>{t.text}</li>)}
      </AnimatedList>
    </div>
  )
}

// SSR / SSG scroll-reveal: show is false at server render (no
// IntersectionObserver on the server), yet children ARE emitted with
// the hidden-state class/style inlined — content stays indexable.
const Reveal = kinetic('section').preset(slideUp)
;<Reveal show={() => revealed()}>
  <h2>Indexable heading</h2>
</Reveal>
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`kinetic`](#kinetic) | function | Create a renderable, chainable animated component in transition mode. |
| [`presets`](#presets) | constant | The six built-in presets as one map — `fade`, `scaleIn`, `slideUp`, `slideDown`, `slideLeft`, `slideRight` — each also a |
| [`useTransitionState`](#usetransitionstate) | hook | Low-level enter/leave state machine that powers the transition renderer — exported for building custom animated primitiv |
| [`useAnimationEnd`](#useanimationend) | hook | Listens for `transitionend` / `animationend` on `ref.current` while `active()` is true and calls `onEnd` exactly once wh |
| [`KineticComponent`](#kineticcomponent) | type | The value `kinetic(tag)` returns — a renderable component intersected with the chain methods. |
| [`Preset`](#preset) | type | A plain object holding the style-form fields (`enterStyle`/`enterToStyle`/`enterTransition` + leave siblings) and/or the |
| [`StyleTransitionProps`](#styletransitionprops) | type | Style-form transition definition (the zero-CSS path). |
| [`ClassTransitionProps`](#classtransitionprops) | type | Class-form transition definition for utility-class CSS (Tailwind, CSS modules). |
| [`TransitionCallbacks`](#transitioncallbacks) | type | Lifecycle callbacks — attach via `.on(callbacks)` on the chain or pass as props on the rendered component (props overrid |

## API

### kinetic `function`

```ts
<Tag extends string>(tag: Tag) => KineticComponent<Tag, 'transition'>
```

Create a renderable, chainable animated component in transition mode. Every chain method returns a NEW component (immutable) — define once at module scope and reuse. Style methods (`.enter`/`.enterTo`/`.enterTransition` + `leave` siblings) set inline-style phases; `.enterClass`/`.leaveClass({ active, from, to })` set class phases (Tailwind-friendly); `.preset(p)` spreads a `Preset`'s fields; `.on(callbacks)` attaches lifecycle callbacks; `.config(opts)` sets mode-scoped options. Mode switches: `.collapse(opts?)` (height 0 ↔ auto, measures `scrollHeight`), `.stagger({ interval?, reverseLeave? })` (sequenced children), `.group()` (keyed-list enter/exit, no `show` prop). Rendered props: `show: () => boolean` (reactive accessor; not in group mode), `appear` (default false), `timeout` (default 5000ms), mode extras (`unmount` transition-only default true, `transition` collapse-only default "height 300ms ease", `interval` stagger-only default 50, `reverseLeave` stagger-only), the four callbacks, plus any HTML attr — forwarded to the rendered tag with reactivity preserved.

**Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `tag` | `Tag extends string` | HTML tag rendered as the container ('div', 'ul', 'section', ...). |

**Returns** `KineticComponent<Tag, 'transition'>` — A component that is both JSX-renderable and a chain object; chain methods return new components.

**Example**

```tsx
const FadeBox = kinetic('div').preset(fade)                     // transition
const Accordion = kinetic('div').collapse({ transition: 'height 400ms ease-in-out' })
const StaggerList = kinetic('ul').preset(slideUp).stagger({ interval: 80, reverseLeave: true })
const AnimatedList = kinetic('ul').preset(fade).group()          // keyed list

<FadeBox show={() => visible()} onAfterLeave={() => console.warn('gone')}>
  <p>Content</p>
</FadeBox>

// Group mode — keyed children via accessor, no show prop:
<AnimatedList>{() => todos().map((t) => <li key={t.id}>{t.text}</li>)}</AnimatedList>
```

**Common mistakes**

- Passing `show={visible()}` (a static boolean) — `show` is a reactive accessor `() => boolean`; kinetic subscribes to it and runs enter/leave on flips. Write `show={() => visible()}`
- Building `kinetic('div').preset(...)` inside a render body — chaining is immutable and re-creates the component on every call; define animated components once at module scope
- Passing a `show` prop in group mode — group has NO `show`; visibility is driven by which keys are present in the children
- Group-mode children without a unique `key` — the enter/exit diff is keyed; children without a key are skipped (no animation)
- Passing a plain snapshot `{todos().map(...)}` to a group and expecting later additions to animate — pass a reactive accessor `{() => todos().map(...)}` so the group re-evaluates and diffs keys on data change
- Using stagger mode for a list whose entries are added/removed at runtime — stagger snapshots its children once at render; use group mode for runtime add/remove
- Setting `unmount` outside transition mode — it is a transition-mode option only; collapse keeps content in the DOM and animates height, stagger/group manage per-child lifecycle
- Expecting `.config()` to accept every option in every mode — it takes only the current mode's set: `{ appear, unmount, timeout }` (transition), `{ appear, timeout, transition }` (collapse), `{ appear, timeout, interval, reverseLeave }` (stagger), `{ appear, timeout }` (group)
- Treating stagger `interval` as a total duration — it is the per-CHILD delay: five children at 75ms = 375ms stagger window
- Animating `width` / `height` / `top` / `left` in a preset — those run on the main thread and can jank; animate `transform` / `opacity` / `filter` for compositor-thread work, and use collapse mode for height
- Expecting an INITIALLY-HIDDEN transition with `unmount: true` to be removed from the DOM after a later leave — the SSR-structural contract keeps it in the DOM with the leave-to class applied; initially-visible transitions keep the true-unmount semantic (drive mount/unmount yourself if you need removal)
- Relying on the animation completing under `prefers-reduced-motion: reduce` — visuals are skipped instantly but callbacks (`onEnter` → `onAfterEnter`, `onLeave` → `onAfterLeave`) still fire; drive dependent logic from callbacks, not timing

**See also:** `KineticComponent` · `presets` · `useTransitionState` · `@pyreon/kinetic-presets`

---

### presets `constant`

```ts
Record<'fade' | 'scaleIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight', Preset>
```

The six built-in presets as one map — `fade`, `scaleIn`, `slideUp`, `slideDown`, `slideLeft`, `slideRight` — each also available as a named export. All are style-form presets (opacity/transform with 300ms ease-out enter, 200ms ease-in leave). Pass one to `.preset(...)`. For the full 122-preset catalog plus factories and composition utilities, use `@pyreon/kinetic-presets`.

**Example**

```tsx
import { kinetic, fade, presets } from '@pyreon/kinetic'

const FadeBox = kinetic('div').preset(fade)
const SlideBox = kinetic('div').preset(presets.slideUp)   // map access for dynamic selection
```

**Common mistakes**

- Looking for `fadeUp` / `bounceIn` / `zoomIn` etc. here — the core package ships only 6 presets; the 122-preset catalog is `@pyreon/kinetic-presets`

**See also:** `kinetic` · `Preset` · `@pyreon/kinetic-presets`

---

### useTransitionState `hook`

```ts
(options: { show: () => boolean; appear?: boolean }) => TransitionStateResult
```

Low-level enter/leave state machine that powers the transition renderer — exported for building custom animated primitives. Returns `stage` (a `Signal<TransitionStage>`: `hidden | entering | entered | leaving`), a `ref` callback to attach to the transitioning element (it triggers the `appear` animation once wired), a reactive `shouldMount()` accessor (false only while `hidden`), and `complete()` which advances `entering → entered` / `leaving → hidden`. Its signature type is exported as `UseTransitionState`.

**Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `{ show: () => boolean; appear?: boolean }` | Reactive visibility accessor plus `appear` (default false) to run the enter animation on initial mount. |

**Returns** `TransitionStateResult` — `{ stage, ref, shouldMount, complete }` — see the TransitionStateResult type.

**Example**

```tsx
const { stage, ref, shouldMount, complete } = useTransitionState({
  show: () => visible(),
  appear: true,
})
// stage()       -> 'hidden' | 'entering' | 'entered' | 'leaving'
// shouldMount() -> false only while 'hidden'
useAnimationEnd({ ref: elementRef, active: () => stage() === 'entering' || stage() === 'leaving', onEnd: complete })
```

**Common mistakes**

- Never calling `complete()` — the stage stays `entering`/`leaving` forever; wire `useAnimationEnd`'s `onEnd` (or your own end detection) to `complete`
- Not attaching the returned `ref` to the element — `appear` is triggered by the ref callback once the node is wired; without it the appear animation never fires
- Reading `shouldMount()` outside a reactive scope — it is an accessor; read it inside JSX expression thunks / effects to track stage changes

**See also:** `useAnimationEnd` · `TransitionStage` · `TransitionStateResult`

---

### useAnimationEnd `hook`

```ts
(options: { ref: Ref<HTMLElement>; onEnd: () => void; active: () => boolean; timeout?: number }) => void
```

Listens for `transitionend` / `animationend` on `ref.current` while `active()` is true and calls `onEnd` exactly once when the animation finishes — or after `timeout` ms (default 5000) as a safety fallback if the event never fires. Events bubbling from child elements are ignored (`e.target` must be the element itself). Listeners attach when `active` flips true and are cleaned up when it flips false. Its signature type is exported as `UseAnimationEnd`.

**Parameters**

| Parameter | Type | Description |
| --- | --- | --- |
| `options` | `{ ref: Ref<HTMLElement>; onEnd: () => void; active: () => boolean; timeout?: number }` | Element ref object, one-shot end callback, reactive listen-gate accessor, and safety timeout in ms (default 5000). |

**Returns** `void` — Registers reactive listeners; nothing to consume.

**Example**

```tsx
useAnimationEnd({
  ref: elementRef,                     // Ref<HTMLElement> object, read via .current
  active: () => stage() === 'entering' || stage() === 'leaving',
  timeout: 5000,
  onEnd: () => complete(),
})
```

**Common mistakes**

- Passing a callback ref — the option is a `Ref<HTMLElement>` OBJECT; the hook reads `ref.current` when `active` flips true
- Setting `timeout` shorter than the actual transition duration — the fallback timer calls `onEnd` early, before the animation finishes
- Expecting `onEnd` for a child element's transition — bubbled events where `e.target !== el` are deliberately ignored
- Passing a static boolean for `active` — it is a reactive accessor; the listeners attach/detach as it flips

**See also:** `useTransitionState`

---

### KineticComponent `type`

```ts
type KineticComponent<Tag extends string, Mode extends KineticMode = 'transition'> = ComponentFn<KineticComponentProps<Tag, Mode>> & KineticChain<Tag, Mode>
```

The value `kinetic(tag)` returns — a renderable component intersected with the chain methods. The `Mode` parameter switches the accepted prop set (`show`/`unmount` in transition, `transition` in collapse, `interval`/`reverseLeave` in stagger, no `show` in group) and narrows what `.config(opts)` accepts.

**Example**

```tsx
import type { KineticComponent } from '@pyreon/kinetic'

const FadeBox: KineticComponent<'div', 'transition'> = kinetic('div').preset(fade)
const List: KineticComponent<'ul', 'group'> = kinetic('ul').preset(fade).group()
```

**Common mistakes**

- Annotating a `.collapse()` / `.stagger()` / `.group()` result with the default `'transition'` mode parameter — mode switches change the type: `kinetic('ul').group()` is `KineticComponent<'ul', 'group'>`

**See also:** `kinetic`

---

### Preset `type`

```ts
type Preset = StyleTransitionProps & ClassTransitionProps
```

A plain object holding the style-form fields (`enterStyle`/`enterToStyle`/`enterTransition` + leave siblings) and/or the class-form fields (`enter`/`enterFrom`/`enterTo` + leave siblings) that `.preset(...)` spreads into the chain config. Structurally identical to the `Preset` type in `@pyreon/kinetic-presets`, so factory results from that package pass straight to `.preset(...)`.

**Example**

```tsx
import type { Preset } from '@pyreon/kinetic'

const myPreset: Preset = {
  enterStyle: { opacity: 0, transform: 'translateY(20px)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0)' },
  enterTransition: 'all 400ms ease-out',
  leaveStyle: { opacity: 1, transform: 'translateY(0)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(20px)' },
  leaveTransition: 'all 250ms ease-in',
}
const Box = kinetic('div').preset(myPreset)
```

**See also:** `StyleTransitionProps` · `ClassTransitionProps` · `@pyreon/kinetic-presets`

---

### StyleTransitionProps `type`

```ts
type StyleTransitionProps = { enterStyle?: CSSProperties; enterToStyle?: CSSProperties; enterTransition?: string; leaveStyle?: CSSProperties; leaveToStyle?: CSSProperties; leaveTransition?: string }
```

Style-form transition definition (the zero-CSS path). `enterStyle` applies on the first frame of enter, `enterToStyle` on the second frame (kept until complete), `enterTransition` is the CSS transition shorthand active during enter; the `leave*` trio mirrors it. Set via `.enter()` / `.enterTo()` / `.enterTransition()` and the leave siblings.

**Example**

```tsx
const SlidePanel = kinetic('aside')
  .enter({ opacity: 0, transform: 'translateX(-100%)' })   // enterStyle
  .enterTo({ opacity: 1, transform: 'translateX(0)' })     // enterToStyle
  .enterTransition('all 300ms ease-out')
```

**See also:** `ClassTransitionProps` · `Preset`

---

### ClassTransitionProps `type`

```ts
type ClassTransitionProps = { enter?: string; enterFrom?: string; enterTo?: string; leave?: string; leaveFrom?: string; leaveTo?: string }
```

Class-form transition definition for utility-class CSS (Tailwind, CSS modules). `enter` stays on the element for the whole enter phase, `enterFrom` applies on the first frame and is removed on the next, `enterTo` applies on the second frame and is kept until complete; the `leave*` trio mirrors it. Set via `.enterClass({ active, from, to })` / `.leaveClass(...)` — `active` maps to `enter`/`leave`, `from` to `enterFrom`/`leaveFrom`, `to` to `enterTo`/`leaveTo`. The SSR hidden-state class is `leaveTo` when defined, else `enterFrom`.

**Example**

```tsx
const TailwindFade = kinetic('div')
  .enterClass({ active: 'transition-opacity duration-300', from: 'opacity-0', to: 'opacity-100' })
  .leaveClass({ active: 'transition-opacity duration-200', from: 'opacity-100', to: 'opacity-0' })
```

**See also:** `StyleTransitionProps` · `Preset`

---

### TransitionCallbacks `type`

```ts
type TransitionCallbacks = { onEnter?: () => void; onAfterEnter?: () => void; onLeave?: () => void; onAfterLeave?: () => void }
```

Lifecycle callbacks — attach via `.on(callbacks)` on the chain or pass as props on the rendered component (props override the chain's). `onEnter` fires when the enter phase begins, `onAfterEnter` when the enter animation completes, `onLeave` / `onAfterLeave` mirror for leave. Under reduced motion the pairs fire back-to-back with no visual animation.

**Example**

```tsx
const Notice = kinetic('div').preset(fade).on({
  onEnter: () => console.warn('entering'),
  onAfterLeave: () => console.warn('left'),
})
```

**See also:** `kinetic`

---

## Package-level notes

> **SSR contract:** A transition whose `show` is false at server render still emits its children with the hidden-state class/style inlined (`leaveTo` if defined, else `enterFrom`) — content is structural, animation is visual (Framer Motion / react-transition-group norm). Load-bearing for SSG scroll-reveal where IntersectionObserver can't fire server-side. Trade-off: an INITIALLY-HIDDEN transition with `unmount: true` stays in the DOM (leave-to class applied) after a later leave; initially-visible transitions keep the true-unmount semantic.

> **Reduced motion:** `prefers-reduced-motion: reduce` is detected automatically — enter/leave skip the visual transition and jump to the final state, but lifecycle callbacks still fire so dependent logic stays correct. No configuration.

> **Children are snapshotted:** Transition/collapse/stagger renderers read children once at render time (animation state is built per item) — they do not observe later child-list changes. The compiler may wrap `{children}` in a deferred accessor; kinetic unwraps it internally (`resolveChildren`). For lists that change at runtime, use group mode with accessor children: `{() => items().map((t) => <li key={t.id}>...</li>)}`.

> **Reactive HTML attrs forward:** Non-kinetic props (`class`, `style`, `id`, event handlers) are forwarded to the rendered tag with reactivity preserved — the prop split uses descriptor-copying `splitProps`/`mergeProps`, so signal-driven attrs like `class={sig()}` keep updating (a plain `{...props}` value-copy would freeze them).

> **Compositor-thread animations:** Only `transform` / `opacity` / `filter` animate on the GPU compositor thread. Animating `width` / `height` / `top` / `left` runs on the main thread and may jank — use collapse mode for height animation.
