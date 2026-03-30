# @pyreon/kinetic

CSS-first animation library for Pyreon. Enter/exit transitions, staggered animations, height collapse, and list reconciliation — all in ~3KB gzipped.

## Why Kinetic?

Most animation libraries run their own JavaScript animation loop on the main thread. Kinetic takes a different approach: it delegates all interpolation to the browser's CSS transition engine (compositor thread for `transform`/`opacity`), and only handles orchestration — mount/unmount lifecycle, stagger timing, height measurement, and list diffing.

The result: GPU-composited 60/120 FPS animations with a 3.2KB footprint.

### How It Compares

| Library                | Gzipped    | Engine              | Enter/Exit | Stagger | List Recon. | Collapse | Reduced Motion |
| ---------------------- | ---------- | ------------------- | ---------- | ------- | ----------- | -------- | -------------- |
| **@pyreon/kinetic**    | **3.2 KB** | CSS transitions     | Yes        | Yes     | Yes         | Yes      | Yes            |
| Motion (framer-motion) | ~34 KB     | JS (rAF + WAAPI)    | Yes        | Yes     | Yes         | Quirky   | Yes            |
| @react-spring/web      | ~16-24 KB  | JS (spring physics) | Yes        | Partial | Yes         | Manual   | Yes            |
| react-transition-group | ~5 KB      | CSS classes         | Yes        | No      | Yes         | No       | No             |
| AutoAnimate            | ~2.5 KB    | JS (FLIP)           | Yes        | No      | Yes         | No       | Yes            |

**Key advantages:**

- **10x smaller than Motion** for CSS-transition use cases
- **CSS-first**: `transform`/`opacity` run on GPU compositor thread, not main thread
- **Only library** combining CSS transitions + stagger + collapse + list reconciliation
- **122 presets** available via `@pyreon/kinetic-presets`

## Install

```bash
bun add @pyreon/kinetic
```

## Quick Start

```ts
import { kinetic, fade, slideUp } from "@pyreon/kinetic";
import { signal } from "@pyreon/reactivity";

// Create animated components at module level
const FadeDiv = kinetic("div").preset(fade);
const SlideSection = kinetic("section").preset(slideUp);

// Use with signals for reactive show/hide
const show = signal(true);

FadeDiv({ show: show(), children: "Hello, world!" });
```

## API

### `kinetic(tag)`

Creates an animated component. `tag` can be any HTML element string or Pyreon component.

```ts
kinetic("div"); // HTML element
kinetic("section"); // Any HTML tag
kinetic(MyComponent); // Pyreon component
```

Returns a renderable Pyreon component with chain methods attached. Default mode: **transition**.

### Chain Methods

All methods return a new component (immutable). The tag generic flows through, preserving HTML attribute types.

```ts
// Style-based animation config
.enter(styles)            // CSSProperties applied at enter start
.enterTo(styles)          // CSSProperties applied after first frame
.enterTransition(value)   // CSS transition string for enter
.leave(styles)            // CSSProperties applied at leave start
.leaveTo(styles)          // CSSProperties applied after first frame
.leaveTransition(value)   // CSS transition string for leave

// Class-based animation config
.enterClass({ active?, from?, to? })
.leaveClass({ active?, from?, to? })

// Apply a preset (spreads style + class props)
.preset(preset)

// Behavior config
.config(opts)             // appear, unmount, timeout (+ mode-specific)
.on(callbacks)            // onEnter, onAfterEnter, onLeave, onAfterLeave

// Mode switches
.collapse(opts?)          // Height animation mode
.stagger(opts?)           // Staggered children mode
.group()                  // Key-based list reconciliation mode
```

### Four Modes

#### Transition (default)

Single element enter/leave with CSS transitions.

```ts
const FadeDiv = kinetic("div").preset(fade);

FadeDiv({ show: isOpen, children: "Content" });
```

#### Collapse

Height animation with `overflow: hidden`. Measures `scrollHeight` automatically.

```ts
const Accordion = kinetic("div").collapse();
const FancyAccordion = kinetic("section").collapse({
  transition: "height 400ms cubic-bezier(0.4, 0, 0.2, 1)",
});

Accordion({ show: isExpanded, children: "Expandable content" });
```

#### Stagger

Staggered entrance/exit for child elements.

```ts
const StaggerList = kinetic("ul").preset(slideUp).stagger({ interval: 75 });

StaggerList({
  show: isVisible,
  children: [
    h("li", { key: "1" }, "Item 1"),
    h("li", { key: "2" }, "Item 2"),
    h("li", { key: "3" }, "Item 3"),
  ],
});
```

#### Group

Key-based enter/exit — adding a child triggers enter animation, removing triggers leave + unmount. No `show` prop.

```ts
const AnimatedList = kinetic("ul").preset(fade).group();

AnimatedList({ children: items.map((item) => h("li", { key: item.id }, item.text)) });
```

### Inline Configuration

Build animations without presets:

```ts
const SlidePanel = kinetic("aside")
  .enter({ opacity: 0, transform: "translateX(-100%)" })
  .enterTo({ opacity: 1, transform: "translateX(0)" })
  .enterTransition("all 300ms ease-out")
  .leave({ opacity: 1, transform: "translateX(0)" })
  .leaveTo({ opacity: 0, transform: "translateX(-100%)" })
  .leaveTransition("all 200ms ease-in");
```

### Class-Based Transitions

Works with Tailwind CSS, CSS modules, or any class-based approach:

```ts
const TailwindFade = kinetic("div")
  .enterClass({ active: "transition-opacity duration-300", from: "opacity-0", to: "opacity-100" })
  .leaveClass({ active: "transition-opacity duration-200", from: "opacity-100", to: "opacity-0" });
```

### Lifecycle Callbacks

```ts
FadeDiv({
  show: isOpen,
  onEnter: () => console.log("entering"),
  onAfterEnter: () => console.log("entered"),
  onLeave: () => console.log("leaving"),
  onAfterLeave: () => console.log("left"),
  children: "Content",
});
```

### Accessibility

Kinetic automatically detects `prefers-reduced-motion: reduce`. When enabled, animations are skipped instantly — callbacks still fire, but no visual animation occurs. No configuration needed.

## Built-in Presets

Six presets are included in the core package:

```ts
import { fade, scaleIn, slideUp, slideDown, slideLeft, slideRight } from "@pyreon/kinetic";
```

For 122 presets, factories, and composition utilities, install `@pyreon/kinetic-presets`.

## Composition with Rocketstyle

Kinetic and rocketstyle compose naturally:

```ts
import rocketstyle from "@pyreon/rocketstyle";

const Button = rocketstyle()({ component: "button", name: "Button" }).theme({
  primaryColor: "blue",
});

const AnimatedButton = kinetic(Button).preset(fade);

// Has both rocketstyle props AND kinetic props
AnimatedButton({ show: isVisible, primary: true, size: "large", children: "Click me" });
```

## Peer Dependencies

| Package            | Version  |
| ------------------ | -------- |
| @pyreon/core       | >= 0.0.1 |
| @pyreon/reactivity | >= 0.0.1 |

## License

MIT
