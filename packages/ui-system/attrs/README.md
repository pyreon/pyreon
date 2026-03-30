# @pyreon/attrs

Immutable, chainable default-props factory for Pyreon components.

Think of styled-components' `.attrs()` as a standalone, type-safe composition system. Define default props, swap base components, attach HOCs, and add metadata — all through an immutable chain where every call returns a new component.

## Features

- **Immutable chaining** — every method returns a new component, never mutates the original
- **Props merge order** — `priorityAttrs` > `attrs` > explicit props, with full control over precedence
- **Prop filtering** — strip internal props before they reach the DOM
- **HOC composition** — named HOCs via `.compose()` with selective removal
- **Static metadata** — attach and access custom data via `.statics()` / `.meta`
- **TypeScript inference** — generics accumulate through the chain

## Installation

```bash
bun add @pyreon/attrs
```

## Quick Start

```ts
import attrs from "@pyreon/attrs";
import { Element } from "@pyreon/elements";

const Button = attrs({ name: "Button", component: Element }).attrs({
  tag: "button",
  alignX: "center",
  alignY: "center",
});

// Renders Element with tag="button", alignX="center", alignY="center"
Button({ label: "Click me" });

// Explicit props override attrs defaults
Button({ tag: "a", label: "Link button" });
```

## API

### attrs(options)

Creates an attrs-enhanced component.

```ts
const Component = attrs({
  name: "ComponentName", // required — sets displayName
  component: BaseComponent, // required — the Pyreon component to wrap
});
```

### .attrs(props | callback, options?)

Add default props. Can be called multiple times — defaults stack left-to-right.

```ts
// Object form — static defaults
Button.attrs({ tag: "button" });

// Callback form — computed defaults based on current props
Button.attrs((props) => ({
  "aria-label": props.label,
}));

// Priority — resolved before regular attrs, cannot be overridden by explicit props
Button.attrs({ tag: "button" }, { priority: true });

// Filter — remove props before passing to the underlying component
Button.attrs({}, { filter: ["internalFlag", "variant"] });
```

**Props merge order:**

```text
priorityAttrs (highest) → attrs → explicit props (lowest for priority, highest for regular)
```

For regular attrs, explicit props win. For priority attrs, the priority value wins.

### .config(options)

Reconfigure the component. Returns a new component instance.

```ts
// Rename
Button.config({ name: "PrimaryButton" });

// Swap the base component
Button.config({ component: AnotherComponent });

// Enable debug mode — adds data-attrs attribute in development
Button.config({ DEBUG: true });
```

### .compose(hocs)

Attach named Higher-Order Components. Applied in declaration order.

```ts
const Enhanced = Button.compose({
  withTheme: (Component) => (props) => Component({ ...props, themed: true }),
  withTracking: trackingHoc,
});

// Remove a specific HOC from the chain
const WithoutTracking = Enhanced.compose({ withTracking: null });
```

### .statics(metadata)

Attach metadata accessible via the `.meta` property.

```ts
const Button = attrs({ name: "Button", component: Element }).statics({
  category: "action",
  sizes: ["sm", "md", "lg"],
});

Button.meta.category; // => 'action'
Button.meta.sizes; // => ['sm', 'md', 'lg']
```

### isAttrsComponent(value)

Runtime type guard.

```ts
import { isAttrsComponent } from "@pyreon/attrs";

isAttrsComponent(Button); // => true
isAttrsComponent("div"); // => false
```

### getDefaultAttrs()

Retrieve the computed default props for a component.

```ts
Button.getDefaultAttrs(); // => { tag: 'button', alignX: 'center', ... }
```

## TypeScript

Each `.attrs<P>()` call adds `P` to the component's prop types through `MergeTypes`:

```ts
const Base = attrs({ name: "Base", component: Element });

const Typed = Base.attrs<{ variant: "primary" | "secondary" }>({ variant: "primary" }).attrs<{
  size?: "sm" | "md" | "lg";
}>({});

// Typed accepts: Element props + { variant, size? }
Typed({ variant: "secondary", size: "lg", label: "Hello" });
```

Access the accumulated types via type-only properties:

```ts
type AllProps = typeof Typed.$$types;
type OriginalProps = typeof Typed.$$originTypes;
type ExtendedProps = typeof Typed.$$extendedTypes;
```

## Peer Dependencies

| Package         | Version  |
| --------------- | -------- |
| @pyreon/core    | >= 0.0.1 |
| @pyreon/ui-core | >= 0.0.1 |

## License

MIT
