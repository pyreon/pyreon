# @pyreon/elements

Foundational UI components for Pyreon with responsive props.

Five composable components for building buttons, cards, lists, dropdowns, tooltips, and modals. Every layout prop is responsive — pass a single value, a mobile-first array, or a breakpoint object.

## Features

- **Element** — three-section flex layout (beforeContent / content / afterContent)
- **Text** — semantic text rendering with auto paragraph wrapping
- **List** — data-driven rendering with positional metadata (first, last, odd, even)
- **Overlay** — headless trigger+content pattern
- **Portal** — stub (runtime-dom provides actual portal)
- **Responsive everything** — single value, array, or breakpoint object on every layout prop
- **Equal before/after** — `equalBeforeAfter` prop on Element to equalize slot dimensions

## Installation

```bash
bun add @pyreon/elements
```

## Components

### Element

The core layout primitive. Renders a three-section flex container with optional beforeContent and afterContent slots around the main content.

```ts
import { Element } from '@pyreon/elements'

Element({
  tag: 'button',
  beforeContent: Icon({ name: 'star' }),
  afterContent: Icon({ name: 'chevron-right' }),
  direction: 'inline',
  alignX: 'center',
  alignY: 'center',
  gap: 8,
  children: 'Click me',
})
```

When only content is present (no beforeContent/afterContent), Element optimizes by skipping the inner wrapper layer.

**Content props** (rendered in priority order: children > content > label):

| Prop          | Type    | Description                           |
| ------------- | ------- | ------------------------------------- |
| children      | `VNode` | Standard children                     |
| content       | `VNode` | Alternative to children               |
| label         | `VNode` | Alternative to children/content       |
| beforeContent | `VNode` | Content rendered before the main slot |
| afterContent  | `VNode` | Content rendered after the main slot  |

**Layout props** (all responsive):

| Prop      | Type        | Default    | Description                                                    |
| --------- | ----------- | ---------- | -------------------------------------------------------------- |
| tag       | `HTMLTags`  | `'div'`    | HTML element tag                                               |
| block     | `boolean`   | —          | `flex` vs `inline-flex`                                        |
| direction | `Direction` | `'inline'` | `'inline'` \| `'rows'` \| `'reverseInline'` \| `'reverseRows'` |
| alignX    | `AlignX`    | `'left'`   | Horizontal alignment                                           |
| alignY    | `AlignY`    | `'center'` | Vertical alignment                                             |
| gap       | `number`    | —          | Gap between content sections                                   |
| equalCols | `boolean`   | —          | Equal width/height for before/after                            |

Each section (content, beforeContent, afterContent) has its own direction, alignX, and alignY props prefixed with the section name:

```ts
Element({
  contentDirection: 'rows',
  contentAlignX: 'center',
  beforeContentAlignY: 'top',
  afterContentDirection: 'inline',
})
```

### Text

Semantic text component with optional paragraph auto-wrapping.

```ts
import { Text } from '@pyreon/elements'

Text({ tag: 'h1', children: 'Heading' })
Text({ paragraph: true, children: 'This renders as a p tag.' })
Text({ tag: 'strong', label: 'Bold text' })
```

| Prop             | Type           | Description                                              |
| ---------------- | -------------- | -------------------------------------------------------- |
| tag              | `HTMLTextTags` | `'h1'`–`'h6'`, `'p'`, `'span'`, `'strong'`, `'em'`, etc. |
| paragraph        | `boolean`      | Shorthand for `tag="p"`                                  |
| children / label | `VNode`        | Text content                                             |
| css              | `ExtendCss`    | Extend styling                                           |

### List

Data-driven list renderer with positional metadata.

```ts
import { List, Element } from '@pyreon/elements'

// Simple string data
List({
  component: Element,
  data: ['Apple', 'Banana', 'Cherry'],
  valueName: 'label',
})

// Object data with positional metadata
List({
  component: ListItem,
  data: [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ],
  itemKey: 'id',
  itemProps: (item, { first, last, odd, even, index }) => ({
    highlighted: first,
    separator: !last,
  }),
})

// With root Element wrapper
List({
  rootElement: true,
  direction: 'rows',
  gap: 8,
  component: Card,
  data: items,
})
```

| Prop          | Type                 | Description                                            |
| ------------- | -------------------- | ------------------------------------------------------ |
| data          | `Array`              | Array of strings, numbers, or objects                  |
| component     | `ComponentFn`        | Component to render for each item                      |
| valueName     | `string`             | Prop name for scalar values (default: `'children'`)    |
| itemKey       | `string \| function` | Key extraction for list items                          |
| itemProps     | `object \| function` | Extra props injected into each item                    |
| wrapComponent | `ComponentFn`        | Wrapper around each item                               |
| rootElement   | `boolean`            | Wrap list in an Element (enables direction, gap, etc.) |

**Positional metadata** passed to `itemProps` callback:

`index`, `first`, `last`, `odd`, `even`, `position` (1-based)

### Overlay

Headless trigger+content pattern for dropdowns, tooltips, and modals.

```ts
import { Overlay } from '@pyreon/elements'

Overlay({
  openOn: 'click',
  closeOn: 'clickOutsideContent',
  align: 'bottom',
  alignX: 'left',
  trigger: Button({ label: 'Open menu' }),
  children: DropdownMenu({}),
})
```

### Portal

Stub component — the actual portal implementation is provided by `@pyreon/core`'s runtime-dom.

## Responsive Values

Every layout prop (direction, alignX, alignY, gap, block, equalCols) supports three formats:

```ts
// Single value — all breakpoints
Element({ direction: 'inline' })

// Array — mobile-first, maps to breakpoints by position
Element({ direction: ['rows', 'inline'] })

// Object — explicit breakpoints
Element({ direction: { xs: 'rows', md: 'inline', lg: 'inline' } })
```

## Peer Dependencies

| Package            | Version  |
| ------------------ | -------- |
| @pyreon/core       | >= 0.0.1 |
| @pyreon/reactivity | >= 0.0.1 |
| @pyreon/ui-core    | >= 0.0.1 |
| @pyreon/unistyle   | >= 0.0.1 |

## License

MIT
