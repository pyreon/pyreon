---
title: Kinetic Presets
description: Library of 90+ ready-made CSS transition presets and factories for enter/leave animations.
---

`@pyreon/kinetic-presets` provides a comprehensive collection of CSS transition presets for enter/leave animations. Each preset defines the styles and transitions for both the entering and leaving phases, making it easy to add polished motion to your UI. The library includes 90+ built-in presets, customizable factory functions, and composition utilities.

<PackageBadge name="@pyreon/kinetic-presets" href="/docs/kinetic-presets" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/kinetic-presets
```

```bash [bun]
bun add @pyreon/kinetic-presets
```

```bash [pnpm]
pnpm add @pyreon/kinetic-presets
```

```bash [yarn]
yarn add @pyreon/kinetic-presets
```

:::

## Quick Start

```ts
import { fade, fadeUp, scaleIn, compose, withDuration } from "@pyreon/kinetic-presets";

// Use a preset directly
const myTransition = fadeUp;
// {
//   enterStyle: { opacity: 0, transform: 'translateY(16px)' },
//   enterToStyle: { opacity: 1, transform: 'translateY(0)' },
//   enterTransition: 'all 300ms ease-out',
//   leaveStyle: { opacity: 1, transform: 'translateY(0)' },
//   leaveToStyle: { opacity: 0, transform: 'translateY(16px)' },
//   leaveTransition: 'all 200ms ease-in',
// }

// Customize timing
const slower = withDuration(fadeUp, 500, 300);

// Combine presets
const combined = compose(fade, scaleIn);
```

## The Preset Type

Every preset is an object describing the enter and leave phases of a CSS transition:

```ts
type Preset = {
  // Inline style mode:
  enterStyle?: CSSProperties; // Styles at the start of enter
  enterToStyle?: CSSProperties; // Styles at the end of enter
  enterTransition?: string; // CSS transition for the enter phase
  leaveStyle?: CSSProperties; // Styles at the start of leave
  leaveToStyle?: CSSProperties; // Styles at the end of leave
  leaveTransition?: string; // CSS transition for the leave phase

  // Class-based mode:
  enter?: string; // Active class during enter
  enterFrom?: string; // Class at start of enter
  enterTo?: string; // Class at end of enter
  leave?: string; // Active class during leave
  leaveFrom?: string; // Class at start of leave
  leaveTo?: string; // Class at end of leave
};
```

### Two Modes of Operation

Presets can work in two modes:

**Inline style mode** (`enterStyle`, `enterToStyle`, etc.) -- applies CSS properties directly to the element. This is what all built-in presets use. No CSS files needed.

**Class mode** (`enter`, `enterFrom`, `enterTo`, etc.) -- adds/removes CSS classes during transitions. Useful when integrating with utility-first CSS frameworks like Tailwind.

Both modes can coexist in a single preset if needed.

### CSSProperties Type

```ts
type CSSProperties = Record<string, string | number | undefined>;
```

Standard CSS property names in camelCase form, matching the `HTMLElement.style` property API.

## Factory Functions

Factory functions create customized presets with your own parameters. They are the recommended way to create variants beyond what the built-in presets offer.

### createFade

Creates a fade transition, optionally with directional movement.

```ts
import { createFade } from "@pyreon/kinetic-presets";

// Simple opacity fade
const simpleFade = createFade();
// {
//   enterStyle: { opacity: 0 },
//   enterToStyle: { opacity: 1 },
//   enterTransition: 'all 300ms ease-out',
//   leaveStyle: { opacity: 1 },
//   leaveToStyle: { opacity: 0 },
//   leaveTransition: 'all 200ms ease-in',
// }

// Fade with upward movement
const fadeUp = createFade({ direction: "up", distance: 24 });
// {
//   enterStyle: { opacity: 0, transform: 'translateY(24px)' },
//   enterToStyle: { opacity: 1, transform: 'translateY(0)' },
//   enterTransition: 'all 300ms ease-out',
//   leaveStyle: { opacity: 1, transform: 'translateY(0)' },
//   leaveToStyle: { opacity: 0, transform: 'translateY(24px)' },
//   leaveTransition: 'all 200ms ease-in',
// }

// Fade from the left with custom timing
const slideInLeft = createFade({
  direction: "left",
  distance: 32,
  duration: 500,
  leaveDuration: 300,
  easing: "ease-in-out",
  leaveEasing: "ease-in",
});

// Subtle fade for tooltips
const tooltipFade = createFade({
  direction: "down",
  distance: 4,
  duration: 150,
  leaveDuration: 100,
});
```

**Options (FadeOptions):**

| Property        | Type                                  | Default      | Description                                     |
| --------------- | ------------------------------------- | ------------ | ----------------------------------------------- |
| `direction`     | `'up' \| 'down' \| 'left' \| 'right'` | --           | Movement direction. Omit for opacity-only fade. |
| `distance`      | `number`                              | `16`         | Translation distance in pixels                  |
| `duration`      | `number`                              | `300`        | Enter duration in ms                            |
| `leaveDuration` | `number`                              | `200`        | Leave duration in ms                            |
| `easing`        | `string`                              | `'ease-out'` | Enter easing function                           |
| `leaveEasing`   | `string`                              | `'ease-in'`  | Leave easing function                           |

**Direction Mapping:**

| Direction | Enter Transform                            | Leave Transform                            |
| --------- | ------------------------------------------ | ------------------------------------------ |
| `'up'`    | `translateY(distance)` to `translateY(0)`  | `translateY(0)` to `translateY(distance)`  |
| `'down'`  | `translateY(-distance)` to `translateY(0)` | `translateY(0)` to `translateY(-distance)` |
| `'left'`  | `translateX(distance)` to `translateX(0)`  | `translateX(0)` to `translateX(distance)`  |
| `'right'` | `translateX(-distance)` to `translateX(0)` | `translateX(0)` to `translateX(-distance)` |

### createSlide

Creates a slide transition with directional movement. Similar to `createFade` but always includes a direction.

```ts
import { createSlide } from "@pyreon/kinetic-presets";

const slideDown = createSlide({ direction: "down", distance: 32 });

// Menu dropdown slide
const menuSlide = createSlide({
  direction: "down",
  distance: 8,
  duration: 200,
  leaveDuration: 150,
  easing: "ease-out",
});

// Sidebar slide
const sidebarSlide = createSlide({
  direction: "right",
  distance: 280,
  duration: 300,
  leaveDuration: 200,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
});
```

**Options (SlideOptions):**

| Property        | Type                                  | Default      | Description                    |
| --------------- | ------------------------------------- | ------------ | ------------------------------ |
| `direction`     | `'up' \| 'down' \| 'left' \| 'right'` | `'up'`       | Movement direction             |
| `distance`      | `number`                              | `16`         | Translation distance in pixels |
| `duration`      | `number`                              | `300`        | Enter duration in ms           |
| `leaveDuration` | `number`                              | `200`        | Leave duration in ms           |
| `easing`        | `string`                              | `'ease-out'` | Enter easing function          |
| `leaveEasing`   | `string`                              | `'ease-in'`  | Leave easing function          |

### createScale

Creates a scale transition.

```ts
import { createScale } from "@pyreon/kinetic-presets";

// Default: scale from 0.9
const scaleUp = createScale();
// {
//   enterStyle: { opacity: 0, transform: 'scale(0.9)' },
//   enterToStyle: { opacity: 1, transform: 'scale(1)' },
//   enterTransition: 'all 300ms ease-out',
//   leaveStyle: { opacity: 1, transform: 'scale(1)' },
//   leaveToStyle: { opacity: 0, transform: 'scale(0.9)' },
//   leaveTransition: 'all 200ms ease-in',
// }

// Scale from zero (dramatic pop-in)
const popIn = createScale({ from: 0, duration: 400 });

// Subtle scale for cards
const cardScale = createScale({ from: 0.95, duration: 200, leaveDuration: 150 });

// Scale up from a large size (zoom out effect)
const zoomOut = createScale({ from: 1.5 });

// Bouncy scale with spring easing
const bouncyScale = createScale({
  from: 0.5,
  duration: 500,
  easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
});
```

**Options (ScaleOptions):**

| Property        | Type     | Default      | Description                                         |
| --------------- | -------- | ------------ | --------------------------------------------------- |
| `from`          | `number` | `0.9`        | Starting scale value (0 = invisible, 1 = full size) |
| `duration`      | `number` | `300`        | Enter duration in ms                                |
| `leaveDuration` | `number` | `200`        | Leave duration in ms                                |
| `easing`        | `string` | `'ease-out'` | Enter easing                                        |
| `leaveEasing`   | `string` | `'ease-in'`  | Leave easing                                        |

### createRotate

Creates a rotation transition.

```ts
import { createRotate } from "@pyreon/kinetic-presets";

// Gentle tilt
const tilt = createRotate({ degrees: 10 });
// {
//   enterStyle: { opacity: 0, transform: 'rotate(-10deg)' },
//   enterToStyle: { opacity: 1, transform: 'rotate(0)' },
//   enterTransition: 'all 300ms ease-out',
//   leaveStyle: { opacity: 1, transform: 'rotate(0)' },
//   leaveToStyle: { opacity: 0, transform: 'rotate(10deg)' },
//   leaveTransition: 'all 200ms ease-in',
// }

// Half spin
const spin = createRotate({ degrees: 180, duration: 500 });

// Full rotation (clock hand effect)
const fullSpin = createRotate({ degrees: 360, duration: 800 });

// Subtle wobble
const wobble = createRotate({
  degrees: 5,
  duration: 200,
  easing: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
});
```

**Options (RotateOptions):**

| Property        | Type     | Default      | Description                                                                  |
| --------------- | -------- | ------------ | ---------------------------------------------------------------------------- |
| `degrees`       | `number` | `15`         | Rotation in degrees. Enter rotates from -degrees, leave rotates to +degrees. |
| `duration`      | `number` | `300`        | Enter duration in ms                                                         |
| `leaveDuration` | `number` | `200`        | Leave duration in ms                                                         |
| `easing`        | `string` | `'ease-out'` | Enter easing                                                                 |
| `leaveEasing`   | `string` | `'ease-in'`  | Leave easing                                                                 |

### createBlur

Creates a blur transition, optionally combined with a scale effect.

```ts
import { createBlur } from "@pyreon/kinetic-presets";

// Simple blur
const blur = createBlur({ amount: 12 });
// {
//   enterStyle: { opacity: 0, filter: 'blur(12px)' },
//   enterToStyle: { opacity: 1, filter: 'blur(0px)' },
//   enterTransition: 'all 300ms ease-out',
//   leaveStyle: { opacity: 1, filter: 'blur(0px)' },
//   leaveToStyle: { opacity: 0, filter: 'blur(12px)' },
//   leaveTransition: 'all 200ms ease-in',
// }

// Blur with scale (glass-like effect)
const glassBlur = createBlur({ amount: 8, scale: 0.95 });
// enterStyle also includes: transform: 'scale(0.95)'

// Heavy blur for dramatic reveals
const dramaticBlur = createBlur({
  amount: 20,
  scale: 0.8,
  duration: 600,
  leaveDuration: 400,
});

// Subtle blur for overlays
const overlayBlur = createBlur({ amount: 4, duration: 200 });
```

**Options (BlurOptions):**

| Property        | Type     | Default      | Description                                                                                  |
| --------------- | -------- | ------------ | -------------------------------------------------------------------------------------------- |
| `amount`        | `number` | `8`          | Blur amount in pixels                                                                        |
| `scale`         | `number` | --           | Optional starting scale value. When set, adds `transform: scale(value)` to the hidden state. |
| `duration`      | `number` | `300`        | Enter duration in ms                                                                         |
| `leaveDuration` | `number` | `200`        | Leave duration in ms                                                                         |
| `easing`        | `string` | `'ease-out'` | Enter easing                                                                                 |
| `leaveEasing`   | `string` | `'ease-in'`  | Leave easing                                                                                 |

## Composition Utilities

Utilities to modify and combine presets without creating new ones from scratch.

### compose(...presets)

Merges multiple presets into one. Styles are shallow-merged (later presets override earlier ones for the same CSS property). Transition strings and class names are taken from the last preset that defines them.

```ts
import { compose, fade, scaleIn, blurIn } from "@pyreon/kinetic-presets";

// Combine fade + scale + blur
const fancy = compose(fade, scaleIn, blurIn);
// enterStyle: { opacity: 0, transform: 'scale(0.9)', filter: 'blur(8px)' }
// enterToStyle: { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }
// enterTransition: 'all 300ms ease-out' (from blurIn, the last one)
```

**Merge behavior:**

| Field                                 | Merge Strategy                                   |
| ------------------------------------- | ------------------------------------------------ |
| `enterStyle` / `enterToStyle`         | Shallow object merge: `&#123; ...a, ...b &#125;` |
| `leaveStyle` / `leaveToStyle`         | Shallow object merge: `&#123; ...a, ...b &#125;` |
| `enterTransition` / `leaveTransition` | Last preset wins                                 |
| `enter` / `enterFrom` / `enterTo`     | Class names concatenated with space              |
| `leave` / `leaveFrom` / `leaveTo`     | Class names concatenated with space              |

#### Composing Inline and Class Presets

```ts
const inlinePreset = createFade({ direction: "up" });
const classPreset: Preset = {
  enterFrom: "ring-2 ring-blue-500",
  enterTo: "ring-0",
};

// Both modes merge independently
const combined = compose(inlinePreset, classPreset);
// Has both enterStyle AND enterFrom set
```

### withDuration(preset, enterMs, leaveMs?)

Override the duration of a preset. If `leaveMs` is omitted, the enter duration is used for both phases.

```ts
import { withDuration, fadeUp, scaleIn, blurIn } from "@pyreon/kinetic-presets";

// Different enter and leave durations
const slow = withDuration(fadeUp, 600, 400);
// enterTransition: 'all 600ms ease-out'
// leaveTransition: 'all 400ms ease-in'

// Symmetric duration
const symmetric = withDuration(fadeUp, 500);
// enterTransition: 'all 500ms ease-out'
// leaveTransition: 'all 500ms ease-in'

// Quick tooltip animation
const quick = withDuration(scaleIn, 150, 100);

// Slow dramatic reveal
const dramatic = withDuration(blurIn, 800, 500);
```

**How it works:** Replaces the first duration pattern (e.g., `300ms`) in the transition string with the new value.

### withEasing(preset, enterEasing, leaveEasing?)

Override the easing function of a preset. If `leaveEasing` is omitted, the enter easing is used for both phases.

```ts
import { withEasing, scaleIn, fadeUp } from "@pyreon/kinetic-presets";

// Bouncy spring easing
const bouncy = withEasing(scaleIn, "cubic-bezier(0.34, 1.56, 0.64, 1)");
// enterTransition: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'
// leaveTransition: 'all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)'

// Different enter/leave easing
const asymmetric = withEasing(
  fadeUp,
  "cubic-bezier(0.22, 1, 0.36, 1)", // Smooth deceleration for enter
  "cubic-bezier(0.55, 0, 1, 0.45)", // Quick acceleration for leave
);

// Linear for progress indicators
const linear = withEasing(fadeUp, "linear");
```

**Supported easing patterns:** `ease`, `ease-in`, `ease-out`, `ease-in-out`, `linear`, `cubic-bezier(...)`.

### withDelay(preset, enterDelayMs, leaveDelayMs?)

Add a delay to a preset's transitions. Useful for staggered animations.

```ts
import { withDelay, fadeUp, scaleIn } from "@pyreon/kinetic-presets";

// Delay enter by 150ms, no delay on leave
const delayed = withDelay(fadeUp, 150, 0);
// enterTransition: 'all 300ms 150ms ease-out'
// leaveTransition: 'all 200ms 0ms ease-in'

// Same delay for both phases
const symmetricDelay = withDelay(scaleIn, 200);
// enterTransition: 'all 300ms 200ms ease-out'
// leaveTransition: 'all 200ms 200ms ease-in'
```

**How it works:** Inserts the delay value after the duration in the transition string, following the CSS shorthand format: `property duration delay easing`.

#### Creating Staggered Delays

```ts
import { withDelay, fadeUp } from "@pyreon/kinetic-presets";

// Create staggered presets for a list of items
function stagger(basePreset: Preset, count: number, delayStep: number) {
  return Array.from({ length: count }, (_, i) => withDelay(basePreset, i * delayStep, 0));
}

const staggeredFades = stagger(fadeUp, 5, 50);
// staggeredFades[0] → 0ms delay
// staggeredFades[1] → 50ms delay
// staggeredFades[2] → 100ms delay
// staggeredFades[3] → 150ms delay
// staggeredFades[4] → 200ms delay
```

### reverse(preset)

Swaps the enter and leave phases of a preset. The enter styles become the leave styles and vice versa.

```ts
import { reverse, fadeUp, slideLeft } from "@pyreon/kinetic-presets";

// fadeUp enters from below -- reverse enters from above
const fadeDown = reverse(fadeUp);
// enterStyle: { opacity: 1, transform: 'translateY(0)' }  (was leaveStyle)
// enterToStyle: { opacity: 0, transform: 'translateY(16px)' }  (was leaveToStyle)
// leaveStyle: { opacity: 0, transform: 'translateY(16px)' }  (was enterStyle)
// leaveToStyle: { opacity: 1, transform: 'translateY(0)' }  (was enterToStyle)

// Enter from right, leave to left (opposite of slideLeft)
const slideRight = reverse(slideLeft);
```

**What gets swapped:**

| Original          | Becomes           |
| ----------------- | ----------------- |
| `enterStyle`      | `leaveStyle`      |
| `enterToStyle`    | `leaveToStyle`    |
| `enterTransition` | `leaveTransition` |
| `leaveStyle`      | `enterStyle`      |
| `leaveToStyle`    | `enterToStyle`    |
| `leaveTransition` | `enterTransition` |
| `enter`           | `leave`           |
| `enterFrom`       | `leaveFrom`       |
| `enterTo`         | `leaveTo`         |

#### Chaining Utilities

All utilities return a new `Preset` object, so they can be chained freely:

```ts
import {
  compose,
  withDuration,
  withEasing,
  withDelay,
  reverse,
  fade,
  scaleIn,
} from "@pyreon/kinetic-presets";

const custom = withDelay(
  withEasing(withDuration(compose(fade, scaleIn), 500, 300), "cubic-bezier(0.34, 1.56, 0.64, 1)"),
  100,
  0,
);
```

## Built-in Presets

All presets are available as named exports and also collected in the `presets` map. Every preset uses inline style mode with sensible default timing.

### Fades

Simple opacity fades, optionally combined with directional movement.

| Preset          | Enter Transform                                | Duration      |
| --------------- | ---------------------------------------------- | ------------- |
| `fade`          | Opacity only                                   | 300ms / 200ms |
| `fadeUp`        | `translateY(16px)` to `translateY(0)`          | 300ms / 200ms |
| `fadeDown`      | `translateY(-16px)` to `translateY(0)`         | 300ms / 200ms |
| `fadeLeft`      | `translateX(16px)` to `translateX(0)`          | 300ms / 200ms |
| `fadeRight`     | `translateX(-16px)` to `translateX(0)`         | 300ms / 200ms |
| `fadeUpBig`     | `translateY(48px)` to `translateY(0)`          | 300ms / 200ms |
| `fadeDownBig`   | `translateY(-48px)` to `translateY(0)`         | 300ms / 200ms |
| `fadeLeftBig`   | `translateX(48px)` to `translateX(0)`          | 300ms / 200ms |
| `fadeRightBig`  | `translateX(-48px)` to `translateX(0)`         | 300ms / 200ms |
| `fadeScale`     | `scale(0.95)` to `scale(1)`                    | 300ms / 200ms |
| `fadeUpLeft`    | `translate(16px, 16px)` to `translate(0, 0)`   | 300ms / 200ms |
| `fadeUpRight`   | `translate(-16px, 16px)` to `translate(0, 0)`  | 300ms / 200ms |
| `fadeDownLeft`  | `translate(16px, -16px)` to `translate(0, 0)`  | 300ms / 200ms |
| `fadeDownRight` | `translate(-16px, -16px)` to `translate(0, 0)` | 300ms / 200ms |

```ts
import { fade, fadeUp, fadeLeftBig } from "@pyreon/kinetic-presets";

// fadeUp is the most commonly used -- great for modals, dropdowns, tooltips
console.log(fadeUp.enterStyle);
// { opacity: 0, transform: 'translateY(16px)' }
```

### Slides

Slide transitions with directional movement and opacity.

| Preset          | Enter Transform     | Duration      |
| --------------- | ------------------- | ------------- |
| `slideUp`       | `translateY(16px)`  | 300ms / 200ms |
| `slideDown`     | `translateY(-16px)` | 300ms / 200ms |
| `slideLeft`     | `translateX(16px)`  | 300ms / 200ms |
| `slideRight`    | `translateX(-16px)` | 300ms / 200ms |
| `slideUpBig`    | `translateY(48px)`  | 300ms / 200ms |
| `slideDownBig`  | `translateY(-48px)` | 300ms / 200ms |
| `slideLeftBig`  | `translateX(48px)`  | 300ms / 200ms |
| `slideRightBig` | `translateX(-48px)` | 300ms / 200ms |

### Scales

Scale transitions with opacity.

| Preset         | From Scale                  | Duration      |
| -------------- | --------------------------- | ------------- |
| `scaleIn`      | `0.9`                       | 300ms / 200ms |
| `scaleOut`     | `1.1`                       | 300ms / 200ms |
| `scaleUp`      | `0.5`                       | 300ms / 200ms |
| `scaleDown`    | `1.5`                       | 300ms / 200ms |
| `scaleInUp`    | `0.9` + `translateY(16px)`  | 300ms / 200ms |
| `scaleInDown`  | `0.9` + `translateY(-16px)` | 300ms / 200ms |
| `scaleInLeft`  | `0.9` + `translateX(16px)`  | 300ms / 200ms |
| `scaleInRight` | `0.9` + `translateX(-16px)` | 300ms / 200ms |

```ts
import { scaleIn } from "@pyreon/kinetic-presets";

// scaleIn is great for dialogs and popovers
console.log(scaleIn.enterStyle);
// { opacity: 0, transform: 'scale(0.9)' }
```

### Zooms

Dramatic scale transitions from zero or double size.

| Preset         | From Scale                  | Duration      |
| -------------- | --------------------------- | ------------- |
| `zoomIn`       | `0`                         | 400ms / 250ms |
| `zoomOut`      | `2`                         | 400ms / 250ms |
| `zoomInUp`     | `0.5` + `translateY(48px)`  | 400ms / 250ms |
| `zoomInDown`   | `0.5` + `translateY(-48px)` | 400ms / 250ms |
| `zoomInLeft`   | `0.5` + `translateX(48px)`  | 400ms / 250ms |
| `zoomInRight`  | `0.5` + `translateX(-48px)` | 400ms / 250ms |
| `zoomOutUp`    | `2` + `translateY(48px)`    | 400ms / 250ms |
| `zoomOutDown`  | `2` + `translateY(-48px)`   | 400ms / 250ms |
| `zoomOutLeft`  | `2` + `translateX(48px)`    | 400ms / 250ms |
| `zoomOutRight` | `2` + `translateX(-48px)`   | 400ms / 250ms |

### Flips

3D flip transitions using `perspective` and `rotate3d`.

| Preset                | Rotation                  | Duration      |
| --------------------- | ------------------------- | ------------- |
| `flipX`               | `rotateX(90deg)`          | 500ms / 300ms |
| `flipXReverse`        | `rotateX(-90deg)`         | 500ms / 300ms |
| `flipY`               | `rotateY(90deg)`          | 500ms / 300ms |
| `flipYReverse`        | `rotateY(-90deg)`         | 500ms / 300ms |
| `flipDiagonal`        | `rotate3d(1,1,0, 90deg)`  | 500ms / 300ms |
| `flipDiagonalReverse` | `rotate3d(1,-1,0, 90deg)` | 500ms / 300ms |

All flip presets use `perspective(600px)` for a realistic 3D effect.

```ts
import { flipX } from "@pyreon/kinetic-presets";

console.log(flipX.enterStyle);
// { opacity: 0, transform: 'perspective(600px) rotateX(90deg)' }
```

### Rotations

2D rotation transitions.

| Preset            | Rotation                     | Duration      |
| ----------------- | ---------------------------- | ------------- |
| `rotateIn`        | `-15deg`                     | 300ms / 200ms |
| `rotateInReverse` | `15deg`                      | 300ms / 200ms |
| `rotateInUp`      | `-5deg` + `translateY(16px)` | 300ms / 200ms |
| `rotateInDown`    | `5deg` + `translateY(-16px)` | 300ms / 200ms |
| `spinIn`          | `-180deg`                    | 500ms / 300ms |
| `spinInReverse`   | `180deg`                     | 500ms / 300ms |
| `scaleRotateIn`   | `scale(0) rotate(-180deg)`   | 500ms / 300ms |
| `newspaperIn`     | `scale(0) rotate(-720deg)`   | 700ms / 400ms |

```ts
import { newspaperIn } from "@pyreon/kinetic-presets";

// The newspaper effect: element spins in from nothing
console.log(newspaperIn.enterStyle);
// { opacity: 0, transform: 'scale(0) rotate(-720deg)' }
```

### Bounce and Spring

Transitions using bouncy, spring-like easing curves.

| Preset          | Effect                    | Easing                                    | Duration      |
| --------------- | ------------------------- | ----------------------------------------- | ------------- |
| `bounceIn`      | `scale(0.5)`              | `cubic-bezier(0.68, -0.55, 0.265, 1.55)`  | 500ms / 200ms |
| `bounceInUp`    | `translateY(40px)`        | Bounce                                    | 500ms / 200ms |
| `bounceInDown`  | `translateY(-40px)`       | Bounce                                    | 500ms / 200ms |
| `bounceInLeft`  | `translateX(40px)`        | Bounce                                    | 500ms / 200ms |
| `bounceInRight` | `translateX(-40px)`       | Bounce                                    | 500ms / 200ms |
| `springIn`      | `scale(0.8)`              | `cubic-bezier(0.34, 1.56, 0.64, 1)`       | 400ms / 200ms |
| `popIn`         | `scale(0.3)`              | Spring                                    | 300ms / 200ms |
| `rubberIn`      | `scale(0.6)`              | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 500ms / 250ms |
| `squishX`       | `scaleX(1.4) scaleY(0.6)` | Spring                                    | 400ms / 250ms |
| `squishY`       | `scaleX(0.6) scaleY(1.4)` | Spring                                    | 400ms / 250ms |

```ts
import { bounceIn, springIn } from "@pyreon/kinetic-presets";

// bounceIn overshoots then settles
// springIn is a subtler version
```

### Blur

Blur-based transitions with optional scale and directional movement.

| Preset        | Blur  | Additional Effect   | Duration      |
| ------------- | ----- | ------------------- | ------------- |
| `blurIn`      | `8px` | --                  | 300ms / 200ms |
| `blurInUp`    | `8px` | `translateY(16px)`  | 300ms / 200ms |
| `blurInDown`  | `8px` | `translateY(-16px)` | 300ms / 200ms |
| `blurInLeft`  | `8px` | `translateX(16px)`  | 300ms / 200ms |
| `blurInRight` | `8px` | `translateX(-16px)` | 300ms / 200ms |
| `blurScale`   | `8px` | `scale(0.95)`       | 300ms / 200ms |
| `puffIn`      | `4px` | `scale(1.5)`        | 400ms / 250ms |
| `puffOut`     | `4px` | `scale(0.5)`        | 400ms / 250ms |

```ts
import { blurIn, puffIn } from "@pyreon/kinetic-presets";

// blurIn: element fades from blurred to sharp
// puffIn: element shrinks from large + blurry to normal + sharp
```

### Clip Path

Clip-path reveal transitions. These use `clipPath` instead of `opacity` for unique visual effects.

| Preset        | Clip Animation              | Duration      |
| ------------- | --------------------------- | ------------- |
| `clipTop`     | Reveal from top edge        | 400ms / 250ms |
| `clipBottom`  | Reveal from bottom edge     | 400ms / 250ms |
| `clipLeft`    | Reveal from left edge       | 400ms / 250ms |
| `clipRight`   | Reveal from right edge      | 400ms / 250ms |
| `clipCircle`  | Circular reveal from center | 500ms / 300ms |
| `clipCenter`  | Expand from center point    | 400ms / 250ms |
| `clipDiamond` | Diamond-shaped reveal       | 500ms / 300ms |
| `clipCorner`  | Expand from top-left corner | 500ms / 300ms |

```ts
import { clipCircle, clipDiamond } from "@pyreon/kinetic-presets";

console.log(clipCircle.enterStyle);
// { clipPath: 'circle(0% at 50% 50%)' }

console.log(clipCircle.enterToStyle);
// { clipPath: 'circle(75% at 50% 50%)' }

console.log(clipDiamond.enterStyle);
// { clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)' }
```

### Perspective

3D tilt transitions using `perspective` and subtle rotation.

| Preset             | Rotation          | Duration      |
| ------------------ | ----------------- | ------------- |
| `perspectiveUp`    | `rotateX(15deg)`  | 300ms / 200ms |
| `perspectiveDown`  | `rotateX(-15deg)` | 300ms / 200ms |
| `perspectiveLeft`  | `rotateY(-15deg)` | 300ms / 200ms |
| `perspectiveRight` | `rotateY(15deg)`  | 300ms / 200ms |

All use `perspective(600px)` for realistic depth.

### Expand, Skew, and More

| Preset           | Description                | Duration      |
| ---------------- | -------------------------- | ------------- |
| `expandX`        | Scale from `scaleX(0)`     | 300ms / 200ms |
| `expandY`        | Scale from `scaleY(0)`     | 300ms / 200ms |
| `skewIn`         | Skew from `-5deg`          | 300ms / 200ms |
| `skewInReverse`  | Skew from `5deg`           | 300ms / 200ms |
| `skewInY`        | Vertical skew from `-5deg` | 300ms / 200ms |
| `skewInYReverse` | Vertical skew from `5deg`  | 300ms / 200ms |
| `drop`           | From `translateY(-100%)`   | 400ms / 250ms |
| `rise`           | From `translateY(100%)`    | 400ms / 250ms |

### Complex Presets

These presets combine multiple transforms for dramatic entrance effects.

| Preset                                   | Description                           | Duration      |
| ---------------------------------------- | ------------------------------------- | ------------- |
| `backInUp` / `backInDown`                | `scale(0.7)` + `translate(80px)`      | 400ms / 250ms |
| `backInLeft` / `backInRight`             | `scale(0.7)` + `translate(80px)`      | 400ms / 250ms |
| `lightSpeedInLeft` / `lightSpeedInRight` | `translateX(100%)` + `skewX(30deg)`   | 400ms / 250ms |
| `rollInLeft` / `rollInRight`             | `translateX(100%)` + `rotate(120deg)` | 500ms / 300ms |
| `swingInTop` / `swingInBottom`           | 3D swing with `transformOrigin`       | 500ms / 300ms |
| `swingInLeft` / `swingInRight`           | 3D swing with `transformOrigin`       | 500ms / 300ms |
| `slitHorizontal` / `slitVertical`        | 3D slit reveal with rotation + scale  | 500ms / 300ms |
| `swirlIn` / `swirlInReverse`             | `rotate(540deg)` + `scale(0)`         | 600ms / 400ms |
| `flyInUp` / `flyInDown`                  | `translateY(100vh)`                   | 500ms / 300ms |
| `flyInLeft` / `flyInRight`               | `translateX(100vw)`                   | 500ms / 300ms |
| `floatUp` / `floatDown`                  | `translate(32px)` + `scale(0.97)`     | 500ms / 300ms |
| `floatLeft` / `floatRight`               | `translate(32px)` + `scale(0.97)`     | 500ms / 300ms |
| `pushInLeft` / `pushInRight`             | `translate(48px)` + `scale(0.9)`      | 300ms / 200ms |
| `tiltInUp` / `tiltInDown`                | 3D tilt + `translate(24px)`           | 300ms / 200ms |
| `tiltInLeft` / `tiltInRight`             | 3D tilt + `translate(24px)`           | 300ms / 200ms |

```ts
import { swingInTop, swirlIn, lightSpeedInLeft } from "@pyreon/kinetic-presets";

// swingInTop uses transformOrigin: 'top' for a hinge-like effect
console.log(swingInTop.enterStyle);
// { opacity: 0, transform: 'perspective(600px) rotateX(-90deg)', transformOrigin: 'top' }

// swirlIn is a dramatic 540-degree spin from nothing
console.log(swirlIn.enterStyle);
// { opacity: 0, transform: 'rotate(-540deg) scale(0)' }
```

### presets Map

All built-in presets are also available via the `presets` object for dynamic lookup:

```ts
import { presets } from "@pyreon/kinetic-presets";

// Look up a preset by name
const preset = presets["fadeUp"];

// List all available preset names
const allNames = Object.keys(presets);
// ['fade', 'fadeUp', 'fadeDown', ...] (90+ entries)

// Dynamic preset selection
function getPreset(name: string): Preset | undefined {
  return presets[name as keyof typeof presets];
}
```

## Integration with runtime-dom Transition

The primary use case for kinetic-presets is with Pyreon's `Transition` component from `@pyreon/runtime-dom`. While `Transition` uses CSS classes by default, you can apply preset styles directly using lifecycle callbacks.

### Using Presets with Transition

```tsx
import { Transition } from "@pyreon/runtime-dom";
import { fadeUp } from "@pyreon/kinetic-presets";
import { signal } from "@pyreon/reactivity";

const visible = signal(false);

function AnimatedModal() {
  return () => (
    <Transition
      show={() => visible()}
      onBeforeEnter={(el) => {
        // Apply enter-from styles
        Object.assign(el.style, fadeUp.enterStyle);
        el.style.transition = fadeUp.enterTransition ?? "";
      }}
      onAfterEnter={(el) => {
        // Apply enter-to styles (transition will animate)
        Object.assign(el.style, fadeUp.enterToStyle);
      }}
      onBeforeLeave={(el) => {
        // Apply leave-from styles
        Object.assign(el.style, fadeUp.leaveStyle);
        el.style.transition = fadeUp.leaveTransition ?? "";
      }}
      onAfterLeave={(el) => {
        // Apply leave-to styles
        Object.assign(el.style, fadeUp.leaveToStyle);
      }}
    >
      <div class="modal">Modal content</div>
    </Transition>
  );
}
```

### Helper Function for Preset Integration

Create a reusable helper to convert presets into Transition-compatible props:

```ts
import type { Preset } from "@pyreon/kinetic-presets";

function presetToTransitionProps(preset: Preset) {
  return {
    onBeforeEnter: (el: HTMLElement) => {
      if (preset.enterStyle) Object.assign(el.style, preset.enterStyle);
      if (preset.enterTransition) el.style.transition = preset.enterTransition;
    },
    onAfterEnter: (el: HTMLElement) => {
      if (preset.enterToStyle) {
        requestAnimationFrame(() => Object.assign(el.style, preset.enterToStyle));
      }
    },
    onBeforeLeave: (el: HTMLElement) => {
      if (preset.leaveStyle) Object.assign(el.style, preset.leaveStyle);
      if (preset.leaveTransition) el.style.transition = preset.leaveTransition;
    },
    onAfterLeave: (el: HTMLElement) => {
      if (preset.leaveToStyle) Object.assign(el.style, preset.leaveToStyle);
    },
  };
}

// Usage:
const transitionProps = presetToTransitionProps(fadeUp);
// <Transition show={() => visible()} {...transitionProps}>
//   <div>Animated content</div>
// </Transition>
```

## Real-World Animation Patterns

### Page Transitions

```ts
import { createFade, withDuration, withEasing } from "@pyreon/kinetic-presets";

// Smooth page transition: slide up with deceleration
const pageTransition = withEasing(
  withDuration(createFade({ direction: "up", distance: 30 }), 400, 250),
  "cubic-bezier(0.22, 1, 0.36, 1)", // Smooth deceleration
  "cubic-bezier(0.55, 0, 1, 0.45)", // Quick acceleration out
);
```

### Modal Enter/Exit

```ts
import {
  compose,
  createFade,
  createScale,
  withDuration,
  withEasing,
} from "@pyreon/kinetic-presets";

// Modal: fade + scale with spring easing
const modalTransition = withEasing(
  withDuration(compose(createFade(), createScale({ from: 0.95 })), 300, 200),
  "cubic-bezier(0.34, 1.56, 0.64, 1)", // Slight overshoot on enter
  "ease-in", // Quick exit
);

// Overlay backdrop: simple fade
const backdropTransition = withDuration(createFade(), 200, 150);
```

### Dropdown Menu

```ts
import { createFade, withDuration } from "@pyreon/kinetic-presets";

// Fast, subtle animation for menus
const dropdownTransition = withDuration(createFade({ direction: "down", distance: 8 }), 200, 150);
```

### Notification Toast

```ts
import { compose, createFade, createSlide, withEasing } from "@pyreon/kinetic-presets";

// Toast slides in from the right with a bounce
const toastTransition = withEasing(
  compose(createFade(), createSlide({ direction: "right", distance: 100 })),
  "cubic-bezier(0.34, 1.56, 0.64, 1)", // Bouncy enter
  "ease-in", // Quick dismiss
);
```

### Tab Content Switch

```ts
import { createFade } from "@pyreon/kinetic-presets";

// Subtle cross-fade for tab content
const tabTransition = createFade({
  duration: 200,
  leaveDuration: 150,
  easing: "ease-in-out",
});
```

### Sidebar Navigation

```ts
import { compose, createFade, createSlide, withDuration } from "@pyreon/kinetic-presets";

// Sidebar slides in from the left
const sidebarTransition = withDuration(
  compose(createFade(), createSlide({ direction: "left", distance: 280 })),
  300,
  200,
);
```

### Image Gallery Zoom

```ts
import { compose, createScale, createBlur, withDuration } from "@pyreon/kinetic-presets";

// Full-size image zoom with blur
const galleryTransition = withDuration(
  compose(createScale({ from: 0.8 }), createBlur({ amount: 4 })),
  400,
  250,
);
```

### Card Hover Preview

```ts
import { compose, createFade, createScale, withDuration } from "@pyreon/kinetic-presets";

// Quick preview card animation
const previewCard = withDuration(compose(createFade(), createScale({ from: 0.98 })), 150, 100);
```

## Creating Custom Presets from Factories

### Custom Preset from Scratch

```ts
import type { Preset } from "@pyreon/kinetic-presets";

// Custom "grow from left edge" preset
const growFromLeft: Preset = {
  enterStyle: {
    opacity: 0,
    transform: "scaleX(0)",
    transformOrigin: "left center",
  },
  enterToStyle: {
    opacity: 1,
    transform: "scaleX(1)",
    transformOrigin: "left center",
  },
  enterTransition: "all 400ms cubic-bezier(0.22, 1, 0.36, 1)",
  leaveStyle: {
    opacity: 1,
    transform: "scaleX(1)",
    transformOrigin: "left center",
  },
  leaveToStyle: {
    opacity: 0,
    transform: "scaleX(0)",
    transformOrigin: "left center",
  },
  leaveTransition: "all 250ms ease-in",
};
```

### Custom Factory Function

```ts
import type { Preset } from "@pyreon/kinetic-presets";

interface ShakeOptions {
  distance?: number;
  duration?: number;
  axis?: "x" | "y";
}

function createShakeIn({ distance = 10, duration = 400, axis = "x" }: ShakeOptions = {}): Preset {
  const translate = axis === "x" ? "translateX" : "translateY";
  return {
    enterStyle: {
      opacity: 0,
      transform: `${translate}(${distance}px)`,
    },
    enterToStyle: {
      opacity: 1,
      transform: `${translate}(0)`,
    },
    enterTransition: `all ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55)`,
    leaveStyle: {
      opacity: 1,
      transform: `${translate}(0)`,
    },
    leaveToStyle: {
      opacity: 0,
      transform: `${translate}(-${distance}px)`,
    },
    leaveTransition: `all ${duration * 0.6}ms ease-in`,
  };
}
```

### Building a Preset Library

```ts
import {
  createFade,
  createScale,
  compose,
  withDuration,
  withEasing,
} from "@pyreon/kinetic-presets";
import type { Preset } from "@pyreon/kinetic-presets";

// Define your app's animation system
export const animations = {
  // UI elements
  tooltip: withDuration(createFade({ direction: "down", distance: 4 }), 150, 100),
  dropdown: withDuration(createFade({ direction: "down", distance: 8 }), 200, 150),
  popover: withDuration(compose(createFade(), createScale({ from: 0.95 })), 250, 180),

  // Modals
  modal: withEasing(
    withDuration(compose(createFade(), createScale({ from: 0.95 })), 300, 200),
    "cubic-bezier(0.34, 1.56, 0.64, 1)",
  ),
  drawer: withDuration(createFade({ direction: "right", distance: 320 }), 300, 200),

  // Page transitions
  pageForward: createFade({ direction: "left", distance: 30, duration: 350, leaveDuration: 200 }),
  pageBack: createFade({ direction: "right", distance: 30, duration: 350, leaveDuration: 200 }),

  // Feedback
  success: withEasing(createScale({ from: 0.3 }), "cubic-bezier(0.34, 1.56, 0.64, 1)"),
  error: withEasing(
    createFade({ direction: "down", distance: 8 }),
    "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
  ),
} satisfies Record<string, Preset>;
```

## Performance Tips for Animations

### Use transform and opacity

The `transform` and `opacity` CSS properties are the most performant to animate because they can be handled entirely by the browser's compositor thread. All built-in presets use only these properties (plus `filter` for blur and `clipPath` for clip presets).

Avoid animating:

- `width`, `height`, `margin`, `padding` (trigger layout recalculation)
- `top`, `left`, `right`, `bottom` (trigger layout recalculation)
- `background-color` (triggers paint but not layout -- acceptable)

### Use will-change Sparingly

Add `will-change` before animation starts, remove it after:

```ts
onBeforeEnter: (el) => {
  el.style.willChange = 'opacity, transform'
},
onAfterEnter: (el) => {
  el.style.willChange = ''
},
```

Do not leave `will-change` on permanently -- it allocates GPU memory for each element.

### Prefer Shorter Durations

- **Tooltips, menus**: 100-200ms
- **Modals, cards**: 200-300ms
- **Page transitions**: 250-400ms
- **Dramatic effects**: 400-700ms

Anything over 500ms starts to feel sluggish for frequent interactions.

### Reduce Motion Preference

Respect `prefers-reduced-motion` for accessibility:

```ts
import { fade, type Preset } from "@pyreon/kinetic-presets";

const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Use a simple fade (or no animation) for reduced motion
function safePreset(preset: Preset): Preset {
  if (prefersReducedMotion) return fade; // or return {} for no animation
  return preset;
}
```

### Avoid Animating Large Lists

For lists with many items, consider:

- Using `TransitionGroup` only for visible items (virtualized lists).
- Using shorter durations for list item animations.
- Disabling move animations for very large lists (they require `getBoundingClientRect` for each item).

## API Reference

| Export         | Type                                                                      | Description                             |
| -------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| `createFade`   | `(options?: FadeOptions) => Preset`                                       | Factory for fade transitions            |
| `createSlide`  | `(options?: SlideOptions) => Preset`                                      | Factory for slide transitions           |
| `createScale`  | `(options?: ScaleOptions) => Preset`                                      | Factory for scale transitions           |
| `createRotate` | `(options?: RotateOptions) => Preset`                                     | Factory for rotation transitions        |
| `createBlur`   | `(options?: BlurOptions) => Preset`                                       | Factory for blur transitions            |
| `compose`      | `(...presets: Preset[]) => Preset`                                        | Merge multiple presets into one         |
| `withDuration` | `(preset: Preset, enterMs: number, leaveMs?: number) => Preset`           | Override transition duration            |
| `withEasing`   | `(preset: Preset, enterEasing: string, leaveEasing?: string) => Preset`   | Override transition easing              |
| `withDelay`    | `(preset: Preset, enterDelayMs: number, leaveDelayMs?: number) => Preset` | Add transition delay                    |
| `reverse`      | `(preset: Preset) => Preset`                                              | Swap enter/leave phases                 |
| `presets`      | `Record<string, Preset>`                                                  | Map of all 90+ built-in presets by name |

## Types

| Type            | Description                                                         |
| --------------- | ------------------------------------------------------------------- |
| `Preset`        | Transition preset with enter/leave styles, transitions, and classes |
| `CSSProperties` | `Record<string, string \| number \| undefined>`                     |
| `Direction`     | `'up' \| 'down' \| 'left' \| 'right'`                               |
| `FadeOptions`   | Options for `createFade`                                            |
| `SlideOptions`  | Options for `createSlide`                                           |
| `ScaleOptions`  | Options for `createScale`                                           |
| `RotateOptions` | Options for `createRotate`                                          |
| `BlurOptions`   | Options for `createBlur`                                            |
