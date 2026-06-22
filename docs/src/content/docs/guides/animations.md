---
title: "Animations & Transitions"
description: "How to animate enter/leave, collapse, and staggered children in Pyreon with @pyreon/kinetic and the 120+ @pyreon/kinetic-presets."
---

# Animations & Transitions

`@pyreon/kinetic` wraps components in CSS-transition-driven animations — enter/leave, height collapse, staggered children, and grouped list transitions — with no animation runtime, just classes and transitions. `@pyreon/kinetic-presets` ships 120+ ready-made transition objects.

## When to use it

- Enter/leave animations on mount/unmount, accordions/collapse, list reordering, staggered reveals.
- SSG/SSR scroll-reveal: kinetic renders structural content on the server even when initially hidden (the content is in the HTML; only the animation is visual).

## When **not** to use it

- Physics-based or gesture-driven animation — kinetic is CSS-transition-based by design.

## Basic usage

```tsx
// @check
import { kinetic } from '@pyreon/kinetic'
import { fade } from '@pyreon/kinetic-presets'

const FadeBox = kinetic('div').preset(fade)

// or compose the enter/leave explicitly:
const SlideBox = kinetic('div')
  .enter({ opacity: 0, transform: 'translateY(8px)' })
  .enterTo({ opacity: 1, transform: 'translateY(0)' })
  .leave({ opacity: 1 })
  .leaveTo({ opacity: 0 })
```

An opacity + transform transition, live:

<Example file="./examples/kinetic/animated-transition-opacity-transform" />

## Modes

`kinetic(component)` supports four modes:

- `.preset(fadeIn)` — apply a preset from `@pyreon/kinetic-presets` (`fade`, `slideUp`, `scaleIn`, …).
- `.collapse()` — height-based collapse/expand (accordions).
- `.stagger({ delay: 50 })` — staggered children.
- `.group()` — `TransitionGroup` wrapper for animating list add/remove.

Presets compose: `compose(preset1, preset2)`, and `withDuration(preset, ms)` overrides timing.

## SSR contract

`<Transition show={() => false}>` still renders its children in SSR, with the hidden-state classes inlined — so the documented scroll-reveal pattern (`useIntersection` + a sticky signal) ships real, crawlable content in prerendered HTML. The animation plays on the client when `show` flips true. Trade-off: for an initially-hidden Transition, `unmount: true` keeps the element in the DOM (with the leave-to class) rather than removing it.

## Common pitfalls

- **Expecting JS-physics easing.** Kinetic is CSS transitions — easing is a `transition-timing-function`, not a spring solver.
- **Assuming initially-hidden content is absent from SSR.** It is present (structural) — style it hidden, don't gate it out.
- **Forgetting children are resolved at render.** Library wrappers that iterate `props.children` must unwrap a possible compiler-emitted accessor function (kinetic handles this internally via `resolveChildren`).

## Related

- [Kinetic guide](/docs/kinetic) · [Kinetic Presets](/docs/kinetic-presets)
- [Styling & Theming](/docs/guides/styling-theming)
