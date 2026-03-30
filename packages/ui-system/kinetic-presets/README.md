# @pyreon/kinetic-presets

122 animation presets, 5 configurable factories, and 5 composition utilities for `@pyreon/kinetic`.

All exports are tree-shakeable. Import only what you use.

## Install

```bash
bun add @pyreon/kinetic-presets @pyreon/kinetic
```

## Quick Start

```ts
import { kinetic } from '@pyreon/kinetic'
import { presets, createFade, compose, withDuration } from '@pyreon/kinetic-presets'

// Use a preset directly
const FadeUp = kinetic('div').preset(presets.fadeUp)

// Use a factory for custom config
const SlowFade = kinetic('div').preset(createFade({ duration: 800, direction: 'up', distance: 24 }))

// Compose presets together
const FadeSlide = kinetic('div').preset(compose(presets.fade, presets.slideUp))

// Override timing
const QuickBounce = kinetic('div').preset(withDuration(presets.bounceIn, 200))
```

## Presets (122 total)

All presets are available as named exports and via the `presets` map object.

```ts
// Named import
import { fadeUp, scaleIn, bounceIn } from '@pyreon/kinetic-presets'

// Map access (useful for dynamic selection)
import { presets } from '@pyreon/kinetic-presets'
presets.fadeUp // same as named fadeUp
```

### Fades (14)

`fade`, `fadeUp`, `fadeDown`, `fadeLeft`, `fadeRight`, `fadeUpBig`, `fadeDownBig`, `fadeLeftBig`, `fadeRightBig`, `fadeScale`, `fadeUpLeft`, `fadeUpRight`, `fadeDownLeft`, `fadeDownRight`

### Slides (8)

`slideUp`, `slideDown`, `slideLeft`, `slideRight`, `slideUpBig`, `slideDownBig`, `slideLeftBig`, `slideRightBig`

### Scales (8)

`scaleIn`, `scaleOut`, `scaleUp`, `scaleDown`, `scaleInUp`, `scaleInDown`, `scaleInLeft`, `scaleInRight`

### Zooms (10)

`zoomIn`, `zoomOut`, `zoomInUp`, `zoomInDown`, `zoomInLeft`, `zoomInRight`, `zoomOutUp`, `zoomOutDown`, `zoomOutLeft`, `zoomOutRight`

### Flips (6)

`flipX`, `flipY`, `flipXReverse`, `flipYReverse`, `flipDiagonal`, `flipDiagonalReverse`

### Rotations (8)

`rotateIn`, `rotateInReverse`, `rotateInUp`, `rotateInDown`, `spinIn`, `spinInReverse`, `scaleRotateIn`, `newspaperIn`

### Bounce, Spring & Pop (10)

`bounceIn`, `bounceInUp`, `bounceInDown`, `bounceInLeft`, `bounceInRight`, `springIn`, `popIn`, `rubberIn`, `squishX`, `squishY`

### Blur (6)

`blurIn`, `blurInUp`, `blurInDown`, `blurInLeft`, `blurInRight`, `blurScale`

### Puff (2)

`puffIn`, `puffOut`

### Clip Path (8)

`clipTop`, `clipBottom`, `clipLeft`, `clipRight`, `clipCircle`, `clipCenter`, `clipDiamond`, `clipCorner`

### Perspective (4)

`perspectiveUp`, `perspectiveDown`, `perspectiveLeft`, `perspectiveRight`

### Tilt (4)

`tiltInUp`, `tiltInDown`, `tiltInLeft`, `tiltInRight`

### Swing (4)

`swingInTop`, `swingInBottom`, `swingInLeft`, `swingInRight`

### Slit (2)

`slitHorizontal`, `slitVertical`

### Swirl (2)

`swirlIn`, `swirlInReverse`

### Back (4)

`backInUp`, `backInDown`, `backInLeft`, `backInRight`

### Light Speed (2)

`lightSpeedInLeft`, `lightSpeedInRight`

### Roll (2)

`rollInLeft`, `rollInRight`

### Fly (4)

`flyInUp`, `flyInDown`, `flyInLeft`, `flyInRight`

### Float (4)

`floatUp`, `floatDown`, `floatLeft`, `floatRight`

### Push (2)

`pushInLeft`, `pushInRight`

### Expand (2)

`expandX`, `expandY`

### Skew (4)

`skewIn`, `skewInReverse`, `skewInY`, `skewInYReverse`

### Drop & Rise (2)

`drop`, `rise`

## Factories

Configurable factories for creating custom presets:

```ts
import {
  createFade,
  createSlide,
  createScale,
  createRotate,
  createBlur,
} from '@pyreon/kinetic-presets'
```

### createFade(options?)

```ts
createFade() // Pure opacity fade
createFade({ direction: 'up', distance: 24 }) // Fade with movement
createFade({ duration: 500, easing: 'ease-in-out' })
```

Options: `direction?` (`'up' | 'down' | 'left' | 'right'`), `distance?` (px, default 16), `duration?` (ms, default 300), `leaveDuration?` (ms, default 200), `easing?` (default `'ease-out'`), `leaveEasing?` (default `'ease-in'`).

### createSlide(options?)

```ts
createSlide({ direction: 'left', distance: 32 })
```

Options: `direction?` (default `'up'`), `distance?` (default 16), `duration?`, `leaveDuration?`, `easing?`, `leaveEasing?`.

### createScale(options?)

```ts
createScale({ from: 0.5, duration: 400 })
createScale({ from: 0.8, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }) // spring bounce
```

Options: `from?` (default 0.9), `duration?`, `leaveDuration?`, `easing?`, `leaveEasing?`.

### createRotate(options?)

```ts
createRotate({ degrees: 30, duration: 400 })
createRotate({ degrees: -90 }) // counter-clockwise
```

Options: `degrees?` (default 15), `duration?`, `leaveDuration?`, `easing?`, `leaveEasing?`.

### createBlur(options?)

```ts
createBlur({ amount: 12, duration: 400 })
createBlur({ amount: 8, scale: 0.95 }) // blur with scale
```

Options: `amount?` (px, default 8), `scale?` (optional scale factor), `duration?`, `leaveDuration?`, `easing?`, `leaveEasing?`.

## Composition Utilities

### compose(...presets)

Merge multiple presets. Styles are merged, transitions are comma-joined.

```ts
import { compose, presets } from '@pyreon/kinetic-presets'

const fadeSlideUp = compose(presets.fade, presets.slideUp)
```

### withDuration(preset, enterMs, leaveMs?)

Override timing.

```ts
const slow = withDuration(presets.fade, 800, 500)
```

### withEasing(preset, easing)

Override easing function.

```ts
const springy = withEasing(presets.scaleIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)')
```

### withDelay(preset, enterDelayMs, leaveDelayMs?)

Add delay to transitions.

```ts
const delayed = withDelay(presets.fadeUp, 200, 0)
```

### reverse(preset)

Swap enter and leave animations.

```ts
const slideDownOnEnter = reverse(presets.slideUp)
// Enter: slides down (was leave). Leave: slides up (was enter).
```

## Custom Presets

A preset is just an object matching the `Preset` type. Create your own:

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

Presets also support class-based properties for Tailwind/CSS modules:

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

## No Peer Dependencies

This package is framework-agnostic — it only exports plain objects and functions.

## License

MIT
