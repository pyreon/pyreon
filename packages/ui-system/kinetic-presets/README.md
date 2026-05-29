# @pyreon/kinetic-presets

120+ animation presets, 5 configurable factories, 5 composition utilities for `@pyreon/kinetic`.

`@pyreon/kinetic-presets` is the catalog of ready-to-use enter/leave animations for `@pyreon/kinetic`. Every preset is a plain object with `enterStyle` / `enterToStyle` / `enterTransition` / `leaveStyle` / `leaveToStyle` / `leaveTransition` (style form) or `enter` / `enterFrom` / `enterTo` / `leave` / `leaveFrom` / `leaveTo` (class form — Tailwind / CSS-modules friendly). Five factories generate parameterized variants (custom duration, distance, direction). Five utilities (`compose`, `withDuration`, `withEasing`, `withDelay`, `reverse`) transform presets without forking them. Framework-agnostic — no peer deps.

## Install

```bash
bun add @pyreon/kinetic-presets @pyreon/kinetic
```

## Quick start

```ts
import { kinetic } from '@pyreon/kinetic'
import { presets, createFade, compose, withDuration } from '@pyreon/kinetic-presets'

// Use a preset directly
const FadeUp = kinetic('div').preset(presets.fadeUp)

// Use a factory for custom config
const SlowFade = kinetic('div').preset(createFade({ duration: 800, direction: 'up', distance: 24 }))

// Compose presets
const FadeSlide = kinetic('div').preset(compose(presets.fade, presets.slideUp))

// Override timing
const QuickBounce = kinetic('div').preset(withDuration(presets.bounceIn, 200))
```

## Presets (120+)

Every preset is available as a named export AND on the `presets` map (useful for dynamic selection).

```ts
import { fadeUp, scaleIn, bounceIn } from '@pyreon/kinetic-presets'

// Map access
import { presets } from '@pyreon/kinetic-presets'
const name = userChoice // 'fadeUp' | 'scaleIn' | ...
kinetic('div').preset(presets[name])
```

### Categories

| Category                       | Presets                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fades** (14)                 | `fade`, `fadeUp`, `fadeDown`, `fadeLeft`, `fadeRight`, `fadeUpBig`, `fadeDownBig`, `fadeLeftBig`, `fadeRightBig`, `fadeScale`, `fadeUpLeft`, `fadeUpRight`, `fadeDownLeft`, `fadeDownRight` |
| **Slides** (8)                 | `slideUp`, `slideDown`, `slideLeft`, `slideRight`, `slideUpBig`, `slideDownBig`, `slideLeftBig`, `slideRightBig`                                                                            |
| **Scales** (8)                 | `scaleIn`, `scaleOut`, `scaleUp`, `scaleDown`, `scaleInUp`, `scaleInDown`, `scaleInLeft`, `scaleInRight`                                                                                    |
| **Zooms** (10)                 | `zoomIn`, `zoomOut`, `zoomInUp`, `zoomInDown`, `zoomInLeft`, `zoomInRight`, `zoomOutUp`, `zoomOutDown`, `zoomOutLeft`, `zoomOutRight`                                                       |
| **Flips** (6)                  | `flipX`, `flipY`, `flipXReverse`, `flipYReverse`, `flipDiagonal`, `flipDiagonalReverse`                                                                                                     |
| **Rotations** (8)              | `rotateIn`, `rotateInReverse`, `rotateInUp`, `rotateInDown`, `spinIn`, `spinInReverse`, `scaleRotateIn`, `newspaperIn`                                                                      |
| **Bounce / Spring / Pop** (10) | `bounceIn`, `bounceInUp`, `bounceInDown`, `bounceInLeft`, `bounceInRight`, `springIn`, `popIn`, `rubberIn`, `squishX`, `squishY`                                                            |
| **Blur** (6)                   | `blurIn`, `blurInUp`, `blurInDown`, `blurInLeft`, `blurInRight`, `blurScale`                                                                                                                |
| **Puff** (2)                   | `puffIn`, `puffOut`                                                                                                                                                                         |
| **Clip path** (8)              | `clipTop`, `clipBottom`, `clipLeft`, `clipRight`, `clipCircle`, `clipCenter`, `clipDiamond`, `clipCorner`                                                                                   |
| **Perspective** (4)            | `perspectiveUp`, `perspectiveDown`, `perspectiveLeft`, `perspectiveRight`                                                                                                                   |
| **Tilt** (4)                   | `tiltInUp`, `tiltInDown`, `tiltInLeft`, `tiltInRight`                                                                                                                                       |
| **Swing** (4)                  | `swingInTop`, `swingInBottom`, `swingInLeft`, `swingInRight`                                                                                                                                |
| **Slit** (2)                   | `slitHorizontal`, `slitVertical`                                                                                                                                                            |
| **Swirl** (2)                  | `swirlIn`, `swirlInReverse`                                                                                                                                                                 |
| **Back** (4)                   | `backInUp`, `backInDown`, `backInLeft`, `backInRight`                                                                                                                                       |
| **Light speed** (2)            | `lightSpeedInLeft`, `lightSpeedInRight`                                                                                                                                                     |
| **Roll** (2)                   | `rollInLeft`, `rollInRight`                                                                                                                                                                 |
| **Fly** (4)                    | `flyInUp`, `flyInDown`, `flyInLeft`, `flyInRight`                                                                                                                                           |
| **Float** (4)                  | `floatUp`, `floatDown`, `floatLeft`, `floatRight`                                                                                                                                           |
| **Push** (2)                   | `pushInLeft`, `pushInRight`                                                                                                                                                                 |
| **Expand** (2)                 | `expandX`, `expandY`                                                                                                                                                                        |
| **Skew** (4)                   | `skewIn`, `skewInReverse`, `skewInY`, `skewInYReverse`                                                                                                                                      |
| **Drop / Rise** (2)            | `drop`, `rise`                                                                                                                                                                              |

## Factories — parameterized presets

### `createFade(options?)`

```ts
createFade() // Pure opacity fade
createFade({ direction: 'up', distance: 24 }) // Fade with movement
createFade({ duration: 500, easing: 'ease-in-out' })
```

Options: `direction?: 'up' | 'down' | 'left' | 'right'`, `distance?: number` (px, default 16), `duration?: number` (ms, default 300), `leaveDuration?: number` (default 200), `easing?: string` (default `'ease-out'`), `leaveEasing?: string` (default `'ease-in'`).

### `createSlide(options?)`

```ts
createSlide({ direction: 'left', distance: 32 })
```

Options: `direction?` (default `'up'`), `distance?` (default 16), plus the timing/easing options shared by every factory.

### `createScale(options?)`

```ts
createScale({ from: 0.5, duration: 400 })
createScale({ from: 0.8, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }) // spring bounce
```

Options: `from?: number` (default 0.9).

### `createRotate(options?)`

```ts
createRotate({ degrees: 30, duration: 400 })
createRotate({ degrees: -90 }) // counter-clockwise
```

Options: `degrees?: number` (default 15).

### `createBlur(options?)`

```ts
createBlur({ amount: 12, duration: 400 })
createBlur({ amount: 8, scale: 0.95 }) // blur with scale
```

Options: `amount?: number` (px, default 8), `scale?: number` (optional scale factor).

Every factory accepts `duration` / `leaveDuration` / `easing` / `leaveEasing` overrides.

## Composition utilities

### `compose(...presets)`

Merge multiple presets. Styles are merged; transitions are comma-joined.

```ts
const fadeSlideUp = compose(presets.fade, presets.slideUp)
```

### `withDuration(preset, enterMs, leaveMs?)`

```ts
const slow = withDuration(presets.fade, 800, 500)
```

### `withEasing(preset, easing)`

```ts
const springy = withEasing(presets.scaleIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)')
```

### `withDelay(preset, enterDelayMs, leaveDelayMs?)`

```ts
const delayed = withDelay(presets.fadeUp, 200, 0)
```

### `reverse(preset)`

Swap enter and leave animations.

```ts
const slideDownOnEnter = reverse(presets.slideUp)
// Enter: slides down (was leave). Leave: slides up (was enter).
```

## Custom presets

A preset is just an object matching the `Preset` type:

```ts
import type { Preset } from '@pyreon/kinetic-presets'

const myPreset: Preset = {
  enterStyle: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
  enterToStyle: { opacity: 1, transform: 'translateY(0) scale(1)' },
  enterTransition: 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  leaveStyle: { opacity: 1, transform: 'translateY(0) scale(1)' },
  leaveToStyle: { opacity: 0, transform: 'translateY(-10px) scale(0.98)' },
  leaveTransition: 'all 250ms ease-in',
}
```

Class-based variant for Tailwind / CSS modules:

```ts
const twPreset: Preset = {
  enter: 'transition-all duration-300 ease-out',
  enterFrom: 'opacity-0 translate-y-4',
  enterTo: 'opacity-100 translate-y-0',
  leave: 'transition-all duration-200 ease-in',
  leaveFrom: 'opacity-100 translate-y-0',
  leaveTo: 'opacity-0 -translate-y-2',
}
```

Both forms can be passed directly to `kinetic(...).preset(myPreset)`.

## Gotchas

- **`compose()` style merge is shallow**, transition is comma-joined. If two presets set the same CSS property in `enterToStyle`, the LATER preset wins. Mixing factory output with hand-crafted styles is fine — just don't expect property-level deep merge.
- **Class-based and style-based fields are mutually exclusive per preset** — `kinetic` picks the active set at chain time. Composing a class preset with a style preset works but produces both surfaces; the runtime applies whichever one your `kinetic(...)` chain consumed first.
- **`reverse()` swaps enter↔leave only on the same preset shape** — style or class. Mixed-shape presets are left untouched.
- **No peer dependencies, no Pyreon coupling.** Presets are plain objects; you can use them with any animation runtime that accepts the same field shape (or your own).

## Documentation

Full docs: [docs.pyreon.dev/docs/kinetic-presets](https://docs.pyreon.dev/docs/kinetic-presets) (or `docs/docs/kinetic-presets.md` in this repo).

## License

MIT
