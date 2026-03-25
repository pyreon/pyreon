---
title: Kinetic
description: CSS-transition-based animation components for enter/leave transitions, staggered animations, and collapsible content.
---

`@pyreon/kinetic` provides CSS-transition-based animation components for Pyreon. It includes `Transition` for enter/leave animations, `Stagger` for sequenced group animations, and `Collapse` for height-animated expand/collapse.

<PackageBadge name="@pyreon/kinetic" href="/docs/kinetic" />

## Installation

::: code-group
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

## Overview

Kinetic builds on native CSS transitions to animate elements as they enter and leave the DOM. Instead of keyframe-based animation libraries, it applies CSS classes or inline styles at the right moments during the transition lifecycle, giving you full control with minimal runtime overhead.

The library exposes four main primitives:

- **Transition** -- wraps a single child and applies CSS classes (or inline styles) during enter/leave phases.
- **TransitionGroup** -- manages a keyed list of children, animating additions and removals.
- **Stagger** -- sequences transitions across a list of children with a configurable delay between each.
- **Collapse** -- animates height between `0` and `auto` for expand/collapse patterns.

## Transition

The `Transition` component wraps a single child element and orchestrates enter/leave animations controlled by a reactive `show` accessor.

### Class-Based Transitions

```tsx
import { kinetic } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'

const visible = signal(true)

<kinetic.Transition
  show={() => visible()}
  enter="transition-opacity duration-300"
  enterFrom="opacity-0"
  enterTo="opacity-100"
  leave="transition-opacity duration-200"
  leaveFrom="opacity-100"
  leaveTo="opacity-0"
>
  <div>Animated content</div>
</kinetic.Transition>
```

### Style-Based Transitions

For zero-CSS setups, use inline style objects instead of class names:

```tsx
<kinetic.Transition
  show={() => visible()}
  enterStyle={{ opacity: 0 }}
  enterToStyle={{ opacity: 1 }}
  enterTransition="opacity 300ms ease-out"
  leaveStyle={{ opacity: 1 }}
  leaveToStyle={{ opacity: 0 }}
  leaveTransition="opacity 200ms ease-in"
>
  <div>Fading content</div>
</kinetic.Transition>
```

### Lifecycle Callbacks

```tsx
<kinetic.Transition
  show={() => visible()}
  enterStyle={{ opacity: 0 }}
  enterToStyle={{ opacity: 1 }}
  enterTransition="opacity 300ms ease-out"
  onEnter={() => console.log('entering')}
  onAfterEnter={() => console.log('entered')}
  onLeave={() => console.log('leaving')}
  onAfterLeave={() => console.log('left')}
>
  <div>Content</div>
</kinetic.Transition>
```

## Stagger

`Stagger` sequences transitions across a list of children, applying a configurable delay (`interval`) between each child's animation start.

```tsx
<kinetic.Stagger
  show={() => visible()}
  interval={80}
  enterStyle={{ opacity: 0, transform: 'translateY(16px)' }}
  enterToStyle={{ opacity: 1, transform: 'translateY(0)' }}
  enterTransition="opacity 300ms ease-out, transform 300ms ease-out"
  leaveStyle={{ opacity: 1 }}
  leaveToStyle={{ opacity: 0 }}
  leaveTransition="opacity 200ms ease-in"
  reverseLeave
>
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</kinetic.Stagger>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `interval` | `number` | `50` | Delay in ms between each child's animation start |
| `reverseLeave` | `boolean` | `false` | Reverses stagger order on leave |

## Collapse

`Collapse` animates an element's height between `0` and `auto`, useful for accordion and disclosure patterns.

```tsx
<kinetic.Collapse
  show={() => expanded()}
  transition="height 300ms ease"
>
  <div>Collapsible content that can be any height</div>
</kinetic.Collapse>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `transition` | `string` | `"height 300ms ease"` | CSS transition shorthand for the height animation |

## Built-in Presets

Kinetic ships with ready-to-use animation presets that you can spread onto any `Transition` or `Stagger`:

```tsx
import { fade, scaleIn, slideUp, slideDown, slideLeft, slideRight } from '@pyreon/kinetic'

<kinetic.Transition show={() => visible()} {...fade}>
  <div>Fading content</div>
</kinetic.Transition>

<kinetic.Transition show={() => visible()} {...slideUp}>
  <div>Slides up into view</div>
</kinetic.Transition>
```

Available presets: `fade`, `scaleIn`, `slideUp`, `slideDown`, `slideLeft`, `slideRight`.

## Hooks

### `useTransitionState`

Low-level hook that powers the `Transition` component. Returns reactive `stage`, `shouldMount`, a `ref` callback, and a `complete` function.

```tsx
import { useTransitionState } from '@pyreon/kinetic'

const { stage, shouldMount, ref, complete } = useTransitionState({
  show: () => visible(),
  appear: true,
  timeout: 5000,
})
```

### `useAnimationEnd`

Listens for `transitionend` / `animationend` on an element and calls a callback when the animation finishes.

```tsx
import { useAnimationEnd } from '@pyreon/kinetic'

useAnimationEnd(elementRef, () => {
  console.log('animation finished')
})
```

## Transition Stages

Every transition moves through four stages:

| Stage | Description |
|---|---|
| `hidden` | Element is not mounted (or has `display: none` if `unmount=&#123;false&#125;`) |
| `entering` | Enter classes/styles applied, animation in progress |
| `entered` | Enter animation complete, element fully visible |
| `leaving` | Leave classes/styles applied, animation in progress |

## Key Features

- CSS-transition-based -- no JavaScript animation loops, uses native browser transitions
- Class-based or style-based -- choose between utility classes or inline style objects
- Staggered group animations with configurable interval and reverse-leave
- Height-animated collapse for accordion/disclosure patterns
- Built-in presets for common animations (fade, scale, slide)
- Lifecycle callbacks (`onEnter`, `onAfterEnter`, `onLeave`, `onAfterLeave`)
- Safety timeout prevents stuck animations (default 5000ms)
- Reduced-motion support via `useReducedMotion` hook
- Works with Pyreon's reactive system (`Signal`-based `show` accessor)
