---
title: Elements
description: Foundational layout components including Element, Text, List, Overlay, and Portal.
---

`@pyreon/elements` provides a set of foundational, composable layout components for building UIs with Pyreon. These components handle common patterns like flex layouts, text rendering, list iteration, overlay toggling, and portal rendering.

<PackageBadge name="@pyreon/elements" href="/docs/elements" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/elements
```
```bash [bun]
bun add @pyreon/elements
```
```bash [pnpm]
pnpm add @pyreon/elements
```
```bash [yarn]
yarn add @pyreon/elements
```
:::

## Overview

The package exports five components, each solving a specific layout concern:

| Component | Purpose |
|---|---|
| `Element` | Flex layout with three content slots (before, main, after) |
| `Text` | Simple text rendering with semantic tag support |
| `List` | Data-driven list renderer with positional metadata |
| `Overlay` | Headless trigger + content toggle pattern |
| `Portal` | Render children into a different DOM location |

All components are plain functions -- they accept a props object and return `VNodeChild`. They work with Pyreon's `h()` function and can be composed together to build complex UIs.

---

## Element

The core layout component. Element renders a flex container with a three-slot layout model:

```
[beforeContent] [children] [afterContent]
```

This makes it the ideal building block for buttons with icons, list items with actions, navigation links with badges, cards with headers, and any layout that needs leading and trailing content alongside a main content area.

### Basic Usage

```ts
import { Element } from '@pyreon/elements'
import { h } from '@pyreon/core'

// Simplest usage -- renders a div with inline-flex
<Element>Hello world</Element>

// With a custom tag
<Element tag="button">Click me</Element>

// Block-level element
<Element block={true}>Full width</Element>
```

### The Three-Slot Layout Model

Element's defining feature is its three-slot layout. When you provide `beforeContent` or `afterContent`, Element wraps each section in a `<span>` with flex styles:

```ts
// Three-slot layout
<Element
  tag="button"
  beforeContent={<img src="/icon.svg" alt="" />}
  afterContent={<span class="badge">3</span>}
  gap={8}
>Messages</Element>
```

This renders the following DOM structure:

```html
<button style="display: inline-flex; flex-direction: row; align-items: center; gap: 8px;">
  <span style="flex-shrink: 0;">
    <img src="/icon.svg" alt="" />
  </span>
  <span style="flex: 1; min-width: 0;">
    Messages
  </span>
  <span style="flex-shrink: 0;">
    <span class="badge">3</span>
  </span>
</button>
```

Key behaviors of the slot layout:

- **Before/After slots** get `flex-shrink: 0` by default, meaning they never shrink below their natural size.
- **The main content slot** gets `flex: 1; min-width: 0`, meaning it takes all remaining space and can shrink with text truncation.
- When `equalCols` is `true`, all three slots get `flex: 1; min-width: 0`, dividing the space equally.

When only `children` is provided (no `beforeContent` or `afterContent`), the wrapper `<span>` elements are omitted entirely for a simpler, flatter DOM output:

```ts
// No slots -- renders directly without span wrappers
<Element tag="section" block={true}>Just content</Element>

// Renders: <section style="display: flex; ...">Just content</section>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `tag` | `string` | `'div'` | HTML tag to render. Any valid HTML tag: `'div'`, `'button'`, `'a'`, `'nav'`, `'section'`, `'li'`, etc. |
| `children` | `VNodeChild` | -- | Main content slot. Takes priority as the center of the three-slot layout. |
| `beforeContent` | `VNodeChild` | -- | Content rendered before the main slot. Commonly used for icons, avatars, or leading visuals. |
| `afterContent` | `VNodeChild` | -- | Content rendered after the main slot. Commonly used for badges, arrows, action buttons, or trailing metadata. |
| `direction` | `'inline' \| 'rows'` | `'inline'` | Flex direction. `'inline'` maps to `flex-direction: row`, `'rows'` maps to `flex-direction: column`. |
| `alignX` | `'left' \| 'center' \| 'right'` | -- | Horizontal alignment. In `inline` direction, maps to `justify-content`. In `rows` direction, maps to `align-items`. |
| `alignY` | `'top' \| 'center' \| 'bottom'` | `'center'` (inline) / -- (rows) | Vertical alignment. In `inline` direction, maps to `align-items` (defaults to `center`). In `rows` direction, maps to `justify-content`. |
| `gap` | `number` | -- | Gap between slots in pixels. Rendered as `gap: Npx` on the flex container. |
| `block` | `boolean` | `false` | When `true`, uses `display: flex` instead of `display: inline-flex`. Makes the element take full width of its parent. |
| `equalCols` | `boolean` | `false` | When `true`, all three slots get `flex: 1; min-width: 0`, dividing the space equally instead of the default behavior where before/after shrink-wrap and the center expands. |
| `class` | `string` | -- | CSS class name applied to the outer element. |
| `style` | `string \| Record<string, string \| number>` | -- | Inline styles merged with computed flex styles. Can be a CSS string or an object. Object styles are merged with the computed styles; string styles are appended. |

Element also passes through any valid HTML attributes: `id`, `role`, `tabindex`, `title`, `href`, `src`, `alt`, `type`, `name`, `value`, `disabled`, `hidden`, `draggable`, `ref`, `key`, and any `on*` event handlers, `data-*` attributes, or `aria-*` attributes.

### Alignment Mapping

Understanding how `alignX` and `alignY` map to CSS flex properties in each direction is important:

**Inline direction** (`direction: 'inline'`, which is the default):

| Prop | CSS Property | `'left'` / `'top'` | `'center'` | `'right'` / `'bottom'` |
|---|---|---|---|---|
| `alignX` | `justify-content` | `flex-start` | `center` | `flex-end` |
| `alignY` | `align-items` | `flex-start` | `center` | `flex-end` |

Default `alignY` in inline mode is `'center'`, so content is vertically centered by default.

**Rows direction** (`direction: 'rows'`):

| Prop | CSS Property | `'left'` / `'top'` | `'center'` | `'right'` / `'bottom'` |
|---|---|---|---|---|
| `alignX` | `align-items` | `flex-start` | `center` | `flex-end` |
| `alignY` | `justify-content` | `flex-start` | `center` | `flex-end` |

Default `alignX` in rows mode is `stretch` (no explicit `alignX` means `align-items: stretch`).

### Layout Examples

#### Horizontal Layout (Default)

```ts
// Icon + label + badge, vertically centered
<Element
  tag="button"
  beforeContent={<img src="/mail.svg" alt="" />}
  afterContent={<span class="badge">12</span>}
  gap={8}
  class="nav-item"
>Inbox</Element>
```

#### Vertical (Column) Layout

```ts
// Stacked card content
<Element
  direction="rows"
  alignX="center"
  gap={16}
  block={true}
  class="card"
>
  <img src="/photo.jpg" alt="Photo" />
  <h3>Card Title</h3>
  <p>Card description text goes here.</p>
</Element>
```

#### Equal-Width Columns

The `equalCols` prop is useful when you want a symmetrical three-part layout, such as a header with a left action, a centered title, and a right action:

```ts
// Header with balanced left/center/right
<Element
  tag="header"
  beforeContent={<button>Back</button>}
  afterContent={<button>Save</button>}
  equalCols={true}
  block={true}
  class="app-header"
><h1>Page Title</h1></Element>
```

With `equalCols`, each of the three slots gets `flex: 1`, so the title is centered regardless of the width of the side buttons.

#### Style Merging

You can pass additional styles as a string or object. They are merged with the computed flex styles:

```ts
// String styles are appended
<Element
  style="color: red; font-weight: bold;"
  gap={8}
>Red bold text</Element>

// Object styles are merged (override computed values if keys conflict)
<Element
  style={{ color: 'blue', 'font-size': '14px' }}
  block={true}
>Blue text</Element>
```

### Real-World Patterns

#### Button with Icon

```ts
function IconButton(props: { icon: string; label: string; onClick: () => void }) {
  return (
    <Element
      tag="button"
      beforeContent={<img src={props.icon} alt="" />}
      gap={8}
      onClick={props.onClick}
      class="icon-btn"
    >{props.label}</Element>
  )
}
```

#### Navigation Item

```ts
function NavItem(props: { icon: VNodeChild; label: string; badge?: number; active?: boolean }) {
  return (
    <Element
      tag="a"
      href="#"
      beforeContent={props.icon}
      afterContent={props.badge ? <span class="badge">{String(props.badge)}</span> : undefined}
      gap={12}
      block={true}
      class={props.active ? 'nav-item active' : 'nav-item'}
    >{props.label}</Element>
  )
}
```

#### Card Layout

```ts
function Card(props: { title: string; description: string; image?: string; actions?: VNodeChild }) {
  return (
    <Element
      direction="rows"
      gap={16}
      block={true}
      class="card"
      style={{ padding: '16px', 'border-radius': '8px', border: '1px solid #e0e0e0' }}
    >
      {props.image ? <img src={props.image} style="width: 100%; border-radius: 4px;" /> : null}
      <h3 style="margin: 0;">{props.title}</h3>
      <p style="margin: 0; color: #666;">{props.description}</p>
      {props.actions
        ? <Element alignX="right" block={true} gap={8}>{props.actions}</Element>
        : null}
    </Element>
  )
}
```

#### Centered Content Section

```ts
<Element
  direction="rows"
  alignX="center"
  alignY="center"
  block={true}
  gap={24}
  style={{ 'min-height': '400px', 'text-align': 'center' }}
>
  <h1>Welcome</h1>
  <p>Get started by reading the documentation.</p>
  <button>Get Started</button>
</Element>
```

### Accessibility Considerations

Element passes through all `aria-*` attributes, `role`, and `tabindex`, making it straightforward to build accessible components:

```ts
// Accessible button with loading state
<Element
  tag="button"
  role="button"
  aria-busy={isLoading() ? 'true' : 'false'}
  aria-disabled={isDisabled() ? 'true' : 'false'}
  disabled={isDisabled()}
  beforeContent={isLoading() ? <span class="spinner" /> : null}
  gap={8}
>{isLoading() ? "Loading..." : "Submit"}</Element>

// Accessible navigation
<Element
  tag="nav"
  aria-label="Main navigation"
  direction="rows"
  gap={4}
  block={true}
>{...navItems}</Element>
```

---

## Text

A simple text rendering component that defaults to `<span>` (or `<p>` when `paragraph` is set). Supports both `children` and a `label` prop for text content.

### Basic Usage

```ts
import { Text } from '@pyreon/elements'
import { h } from '@pyreon/core'

// Inline text (renders <span>)
<Text>Hello world</Text>

// Paragraph text (renders <p>)
<Text paragraph={true}>A paragraph of text.</Text>

// Custom heading tag
<Text tag="h1" class="title">Page Heading</Text>

// Using the label prop
<Text label="Fallback text" />

// Children take priority over label
<Text label="Ignored">This is shown instead</Text>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `tag` | `string` | `'span'` (or `'p'` if `paragraph`) | HTML tag to render. When `paragraph` is `true` and no `tag` is provided, defaults to `'p'`. Otherwise defaults to `'span'`. |
| `paragraph` | `boolean` | `false` | Shorthand for setting the tag to `'p'`. Ignored if an explicit `tag` is provided. |
| `label` | `string` | -- | Text content provided as a prop. Used when no `children` are passed. Useful when text comes from data rather than child nodes. |
| `children` | `VNodeChild` | -- | Content to render. Takes priority over `label` when both are provided. |
| `class` | `string` | -- | CSS class name. |
| `style` | `string` | -- | Inline style string. |

Text also passes through: `id`, `role`, `title`, `ref`, `key`, and any `on*` event handlers, `data-*` attributes, or `aria-*` attributes.

### Content Resolution

Text resolves its content in this order:

1. `children` -- if provided, always used
2. `label` -- used when `children` is not provided
3. `null` -- if neither is provided

```ts
// children wins
<Text label="Ignored">Shown</Text>  // renders: "Shown"

// label as fallback
<Text label="Shown" />  // renders: "Shown"

// neither -- renders empty
<Text />  // renders: <span></span>
```

### Tag Resolution

The tag is resolved in this order:

1. Explicit `tag` prop -- always used if provided
2. `paragraph: true` -- sets tag to `'p'`
3. Default -- `'span'`

```ts
<Text tag="h2">Heading</Text>           // <h2>
<Text tag="label" paragraph={true} />   // <label> (tag overrides paragraph)
<Text paragraph={true}>Paragraph</Text>    // <p>
<Text>Inline</Text>                       // <span>
```

### Real-World Patterns

#### Typography Components

```ts
function Heading(props: { level?: 1 | 2 | 3 | 4 | 5 | 6; children: VNodeChild }) {
  return (
    <Text
      tag={`h${props.level ?? 1}`}
      class={`heading-${props.level ?? 1}`}
    >{props.children}</Text>
  )
}

function Caption(props: { children: VNodeChild }) {
  return (
    <Text
      tag="small"
      class="caption"
      style="color: #999; font-size: 12px;"
    >{props.children}</Text>
  )
}

function Label(props: { for: string; children: VNodeChild }) {
  return (
    <Text
      tag="label"
      // passes through arbitrary HTML attributes
      {...{ for: props.for }}
      class="form-label"
    >{props.children}</Text>
  )
}
```

#### Dynamic Text from Data

The `label` prop is useful when text comes from a data source:

```ts
function UserName(props: { user: { displayName: string } }) {
  return (
    <Text
      label={props.user.displayName}
      class="username"
      data-testid="username"
    />
  )
}
```

#### Accessible Text

```ts
// Screen-reader only text
<Text
  class="sr-only"
  style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0);"
>Skip to main content</Text>

// Text with ARIA role
<Text
  tag="span"
  role="status"
  aria-live="polite"
  class="status-text"
>{() => statusMessage()}</Text>
```

---

## List

A data-driven list renderer that iterates over an array and provides positional metadata to the render function. Optionally wraps the output in a container element.

### Basic Usage

```ts
import { List } from '@pyreon/elements'
import { h } from '@pyreon/core'

const items = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'Carol' },
]

// With a wrapper element
<List
  data={items}
  tag="ul"
  class="user-list"
>{(item, { index, first, last, odd, even }) =>
  <li
    key={item.id}
    class={even ? 'bg-gray' : ''}
  >{item.name}</li>
}</List>

// Without a wrapper (renders as Fragment)
<List
  data={items}
>{(item) =>
  <div key={item.id} class="card">{item.name}</div>
}</List>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `T[]` | (required) | Array of items to iterate. Can be any type -- objects, strings, numbers, etc. |
| `children` | `(item: T, meta: ItemMeta) => VNodeChild` | (required) | Render function called for each item. Receives the item and positional metadata. Return value becomes the rendered output for that item. |
| `keyFn` | `(item: T, index: number) => string \| number` | -- | Optional key extractor function. When provided, used to generate stable keys for list items. |
| `tag` | `string` | -- | Wrapper element tag. When provided, all rendered items are wrapped in this element. Common values: `'ul'`, `'ol'`, `'div'`, `'nav'`, `'section'`. When omitted, items render as a flat Fragment. |
| `class` | `string` | -- | CSS class for the wrapper element. Only applies when `tag` is set. |
| `style` | `string` | -- | Inline styles for the wrapper element. Only applies when `tag` is set. |

The wrapper element also passes through: `id`, `role`, `ref`, `key`, and any `on*` event handlers, `data-*` attributes, or `aria-*` attributes.

### ItemMeta

The second argument to the render function provides positional metadata about each item:

| Property | Type | Description |
|---|---|---|
| `index` | `number` | Zero-based index of the item in the array. |
| `first` | `boolean` | `true` only for the first item (index 0). |
| `last` | `boolean` | `true` only for the last item (index === data.length - 1). |
| `odd` | `boolean` | `true` when the index is odd (1, 3, 5, ...). |
| `even` | `boolean` | `true` when the index is even (0, 2, 4, ...). Note: the first item (index 0) is considered even. |

For a single-item array, both `first` and `last` are `true`.

### Wrapper vs. Fragment Behavior

When a `tag` prop is provided, List wraps all rendered items in that element:

```ts
// With tag -- renders <ul><li>...</li><li>...</li></ul>
<List data={items} tag="ul">{(item) =>
  <li>{item.name}</li>
}</List>

// Without tag -- renders items as a flat Fragment
<List data={items}>{(item) =>
  <div>{item.name}</div>
}</List>
```

The Fragment approach is useful when you want list items to be direct children of an existing container, or when you need to render a flat sequence of elements.

### Render Function Patterns

#### Conditional Rendering

The render function can return `null` to skip items:

```ts
<List
  data={users}
>{(user) =>
  user.active
    ? <div key={user.id}>{user.name}</div>
    : null
}</List>
```

#### Using Positional Metadata

```ts
<List
  data={items}
  tag="div"
  class="item-list"
>{(item, { index, first, last, even }) =>
  <div
    key={item.id}
    class={[
      'item',
      even ? 'item-even' : 'item-odd',
      first ? 'item-first' : '',
      last ? 'item-last' : '',
    ].filter(Boolean).join(' ')}
    style={!last ? 'border-bottom: 1px solid #eee;' : ''}
  >
    <span class="item-index">{`${index + 1}.`}</span>
    <span class="item-name">{item.name}</span>
  </div>
}</List>
```

#### Nested Lists

```ts
interface Category {
  id: number
  name: string
  items: { id: number; name: string }[]
}

<List
  data={categories}
  tag="div"
  class="categories"
>{(category) =>
  <div key={category.id} class="category">
    <h3>{category.name}</h3>
    <List
      data={category.items}
      tag="ul"
    >{(item) =>
      <li key={item.id}>{item.name}</li>
    }</List>
  </div>
}</List>
```

### Real-World Patterns

#### User List with Avatars

```ts
interface User {
  id: number
  name: string
  email: string
  avatar: string
  role: 'admin' | 'user'
}

function UserList(props: { users: User[] }) {
  return (
    <List
      data={props.users}
      tag="div"
      class="user-list"
      role="list"
    >{(user, { last }) =>
      <Element
        key={user.id}
        role="listitem"
        beforeContent={<img
          src={user.avatar}
          alt={`${user.name}'s avatar`}
          style="width: 40px; height: 40px; border-radius: 50%;"
        />}
        afterContent={<span
          class={`role-badge role-${user.role}`}
        >{user.role}</span>}
        gap={12}
        block={true}
        style={!last ? 'border-bottom: 1px solid #eee; padding: 12px 0;' : 'padding: 12px 0;'}
      >
        <div>
          <div class="user-name">{user.name}</div>
          <div class="user-email">{user.email}</div>
        </div>
      </Element>
    }</List>
  )
}
```

#### Navigation Menu

```ts
interface NavItem {
  id: string
  label: string
  href: string
  icon?: string
  badge?: number
}

function NavMenu(props: { items: NavItem[]; activeId: string }) {
  return (
    <List
      data={props.items}
      tag="nav"
      aria-label="Main navigation"
    >{(item) =>
      <Element
        tag="a"
        key={item.id}
        href={item.href}
        beforeContent={item.icon ? <img src={item.icon} alt="" /> : undefined}
        afterContent={item.badge
          ? <span class="nav-badge">{String(item.badge)}</span>
          : undefined}
        gap={8}
        block={true}
        class={item.id === props.activeId ? 'nav-link active' : 'nav-link'}
        aria-current={item.id === props.activeId ? 'page' : undefined}
      >{item.label}</Element>
    }</List>
  )
}
```

#### Striped Table Rows

```ts
interface Product {
  id: number
  name: string
  price: number
  stock: number
}

function ProductTable(props: { products: Product[] }) {
  return (
    <table class="product-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Price</th>
          <th>Stock</th>
        </tr>
      </thead>
      <List
        data={props.products}
        tag="tbody"
      >{(product, { even }) =>
        <tr
          key={product.id}
          class={even ? 'row-even' : 'row-odd'}
        >
          <td>{product.name}</td>
          <td>{`$${product.price.toFixed(2)}`}</td>
          <td>{String(product.stock)}</td>
        </tr>
      }</List>
    </table>
  )
}
```

#### Empty State Handling

List renders an empty Fragment (or empty wrapper) when data is an empty array. Handle empty states by wrapping with a conditional:

```ts
function ItemList(props: { items: Item[] }) {
  if (props.items.length === 0) {
    return (
      <div class="empty-state">
        <p>No items found.</p>
        <button>Add your first item</button>
      </div>
    )
  }

  return (
    <List
      data={props.items}
      tag="ul"
      class="item-list"
    >{(item) =>
      <li key={item.id}>{item.name}</li>
    }</List>
  )
}
```

---

## Overlay

A headless trigger-and-content pattern for building dropdowns, modals, tooltips, and popovers. Manages open/close state internally via a reactive signal and exposes it through a context object passed to both render functions.

### Basic Usage

```ts
import { Overlay } from '@pyreon/elements'
import { h } from '@pyreon/core'

<Overlay
  trigger={({ toggle, isOpen }) =>
    <button onClick={toggle}>
      {() => isOpen() ? 'Close' : 'Open'}
    </button>
  }
  content={({ close }) =>
    <div class="dropdown-menu">
      <button onClick={close}>Option A</button>
      <button onClick={close}>Option B</button>
    </div>
  }
/>
```

### Props

| Prop | Type | Description |
|---|---|---|
| `trigger` | `(ctx: OverlayContext) => VNode \| null` | Render function for the trigger element. Called once when the component mounts. Receives the overlay context for controlling open/close state. |
| `content` | `(ctx: OverlayContext) => VNode \| null` | Render function for the overlay content. Called reactively each time the overlay opens. Receives the same context object as the trigger. Can return `null`. |

### OverlayContext

Both `trigger` and `content` receive the same context object:

| Property | Type | Description |
|---|---|---|
| `isOpen` | `() => boolean` | Reactive signal that returns the current open state. Call it inside reactive contexts (like child render functions) to re-render when the state changes. |
| `open` | `() => void` | Opens the overlay. Sets `isOpen` to `true`. Idempotent -- calling it when already open has no effect. |
| `close` | `() => void` | Closes the overlay. Sets `isOpen` to `false`. Idempotent -- calling it when already closed has no effect. |
| `toggle` | `() => void` | Toggles the overlay. Flips `isOpen` from `true` to `false` or vice versa. |

### How It Works

Overlay renders a Fragment containing two children:

1. The trigger VNode (rendered once, not reactive)
2. A reactive function `() => isOpen() ? content(ctx) : null`

Because the content is wrapped in a reactive function, Pyreon's runtime automatically tracks the `isOpen()` signal dependency. When `isOpen` changes, only the content portion re-renders -- the trigger stays stable.

Each Overlay instance has its own independent signal, so multiple overlays on the same page do not interfere with each other.

### Real-World Patterns

#### Dropdown Menu

```ts
function DropdownMenu(props: { label: string; items: { id: string; label: string; onClick: () => void }[] }) {
  return (
    <Overlay
      trigger={({ toggle, isOpen }) =>
        <Element
          tag="button"
          onClick={toggle}
          afterContent={<span>{() => isOpen() ? '\u25B2' : '\u25BC'}</span>}
          gap={8}
          class="dropdown-trigger"
          aria-expanded={() => String(isOpen())}
          aria-haspopup="true"
        >{props.label}</Element>
      }
      content={({ close }) =>
        <div
          class="dropdown-panel"
          style="position: absolute; background: white; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 4px 0; min-width: 160px; z-index: 100;"
          role="menu"
        >
          <List
            data={props.items}
          >{(item) =>
            <button
              key={item.id}
              onClick={() => { item.onClick(); close() }}
              class="dropdown-item"
              style="display: block; width: 100%; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer;"
              role="menuitem"
            >{item.label}</button>
          }</List>
        </div>
      }
    />
  )
}
```

#### Tooltip

```ts
function Tooltip(props: { text: string; children: VNodeChild }) {
  return (
    <Overlay
      trigger={({ open, close }) =>
        <span
          onMouseenter={open}
          onMouseleave={close}
          onFocus={open}
          onBlur={close}
          tabindex={0}
        >{props.children}</span>
      }
      content={() =>
        <div
          class="tooltip"
          style="position: absolute; background: #333; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; z-index: 1000;"
          role="tooltip"
        >{props.text}</div>
      }
    />
  )
}

// Usage
<Tooltip text="Click to edit">
  <button>Edit</button>
</Tooltip>
```

#### Confirmation Dialog

```ts
function ConfirmDialog(props: {
  triggerLabel: string
  message: string
  onConfirm: () => void
}) {
  return (
    <Overlay
      trigger={({ open }) =>
        <button
          onClick={open}
          class="btn-danger"
        >{props.triggerLabel}</button>
      }
      content={({ close }) =>
        <Portal target={document.body}>
          <div
            class="dialog-backdrop"
            style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;"
            onClick={close}
          >
            <div
              class="dialog-content"
              style="background: white; padding: 24px; border-radius: 8px; max-width: 400px;"
              onClick={(e: Event) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <p>{props.message}</p>
              <Element gap={8} alignX="right" block={true} style="margin-top: 16px;">
                <button onClick={close}>Cancel</button>
                <button
                  onClick={() => { props.onConfirm(); close() }}
                  class="btn-danger"
                >Confirm</button>
              </Element>
            </div>
          </div>
        </Portal>
      }
    />
  )
}
```

#### Popover with Rich Content

```ts
function UserPopover(props: { user: { name: string; email: string; avatar: string } }) {
  return (
    <Overlay
      trigger={({ toggle }) =>
        <button
          onClick={toggle}
          class="user-avatar-btn"
        >
          <img src={props.user.avatar} alt={props.user.name} style="width: 32px; height: 32px; border-radius: 50%;" />
        </button>
      }
      content={({ close }) =>
        <div
          class="user-popover"
          style="position: absolute; background: white; border: 1px solid #ddd; border-radius: 8px; padding: 16px; min-width: 200px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"
        >
          <Element
            beforeContent={<img
              src={props.user.avatar}
              alt=""
              style="width: 48px; height: 48px; border-radius: 50%;"
            />}
            gap={12}
            block={true}
            style="margin-bottom: 12px;"
          >
            <div>
              <Text tag="div" class="font-bold">{props.user.name}</Text>
              <Text tag="div" class="text-gray">{props.user.email}</Text>
            </div>
          </Element>
          <hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;" />
          <button onClick={close} class="popover-action">View Profile</button>
          <button onClick={close} class="popover-action">Sign Out</button>
        </div>
      }
    />
  )
}
```

### Independent State

Each Overlay instance has its own independent reactive signal. Opening one overlay does not affect others:

```ts
// These two overlays are completely independent
<div>
  <Overlay
    trigger={({ toggle }) => <button onClick={toggle}>Menu 1</button>}
    content={() => <div>Content 1</div>}
  />
  <Overlay
    trigger={({ toggle }) => <button onClick={toggle}>Menu 2</button>}
    content={() => <div>Content 2</div>}
  />
</div>
```

### Accessibility Considerations

When building overlays, consider these accessibility patterns:

- Set `aria-expanded` on the trigger to reflect the open state
- Set `aria-haspopup` on the trigger when the overlay is a menu
- Use `role="menu"` and `role="menuitem"` for dropdown menus
- Use `role="dialog"` and `aria-modal="true"` for modals
- Use `role="tooltip"` for tooltips
- Manage focus -- move focus into the overlay when it opens and return it when it closes
- Support keyboard interaction -- Escape to close, Tab trapping for modals

---

## Portal

Renders children into a different DOM location. Useful for modals, tooltips, and other elements that need to escape their parent's stacking context or overflow rules.

### Basic Usage

```ts
import { Portal } from '@pyreon/elements'
import { h } from '@pyreon/core'

// Render into document.body (default)
<Portal>
  <div class="modal">Modal content</div>
</Portal>

// Render into a specific container
const container = document.getElementById('portal-root')!
<Portal target={container}>
  <div class="toast">Notification</div>
</Portal>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `target` | `HTMLElement` | `document.body` | The DOM element to append the portal container into. |
| `tag` | `string` | `'div'` | Tag for the portal container element that gets created and appended to the target. |
| `children` | `VNodeChild` | -- | Content to render inside the portal container. |

### How It Works

Portal creates a container element (using the `tag` prop) and appends it to the `target` DOM node. The children are then mounted into this container. When the Portal component unmounts, the container is removed from the DOM.

This is useful because the portal content is rendered outside the component's normal DOM hierarchy, which means:

- It escapes parent `overflow: hidden` or `overflow: auto` clipping
- It is not affected by parent `z-index` stacking contexts
- It can be positioned relative to the viewport (using `position: fixed`)
- It appears at the top of the DOM tree, simplifying CSS layering

### Real-World Patterns

#### Modal Dialog

```ts
function Modal(props: { isOpen: () => boolean; onClose: () => void; title: string; children: VNodeChild }) {
  return () => props.isOpen()
    ? <Portal target={document.body}>
        <div
          class="modal-backdrop"
          style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;"
          onClick={props.onClose}
        >
          <div
            class="modal-content"
            style="background: white; border-radius: 8px; padding: 24px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;"
            onClick={(e: Event) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
          >
            <Element
              block={true}
              beforeContent={<h2 style="margin: 0;">{props.title}</h2>}
              afterContent={<button
                onClick={props.onClose}
                aria-label="Close dialog"
                style="background: none; border: none; font-size: 24px; cursor: pointer;"
              >{'\u00D7'}</button>}
              style="margin-bottom: 16px;"
            />
            {props.children}
          </div>
        </div>
      </Portal>
    : null
}
```

#### Toast Notifications

```ts
interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

function ToastContainer(props: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <Portal target={document.body}>
      <div
        class="toast-container"
        style="position: fixed; top: 16px; right: 16px; z-index: 2000; display: flex; flex-direction: column; gap: 8px;"
        aria-live="polite"
      >
        <List
          data={props.toasts}
        >{(toast) =>
          <Element
            key={toast.id}
            afterContent={<button
              onClick={() => props.onDismiss(toast.id)}
              style="background: none; border: none; cursor: pointer; font-size: 16px;"
              aria-label="Dismiss notification"
            >{'\u00D7'}</button>}
            gap={12}
            block={true}
            class={`toast toast-${toast.type}`}
            style="padding: 12px 16px; border-radius: 8px; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); min-width: 300px;"
            role="alert"
          >{toast.message}</Element>
        }</List>
      </div>
    </Portal>
  )
}
```

#### Context Menu

```ts
function ContextMenu(props: {
  x: number
  y: number
  items: { label: string; onClick: () => void }[]
  onClose: () => void
}) {
  return (
    <Portal target={document.body}>
      <div
        class="context-backdrop"
        style="position: fixed; inset: 0; z-index: 999;"
        onClick={props.onClose}
      />
      <div
        class="context-menu"
        style={`position: fixed; left: ${props.x}px; top: ${props.y}px; z-index: 1000; background: white; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); padding: 4px 0; min-width: 160px;`}
        role="menu"
      >
        <List
          data={props.items}
        >{(item) =>
          <button
            onClick={() => { item.onClick(); props.onClose() }}
            class="context-menu-item"
            style="display: block; width: 100%; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer;"
            role="menuitem"
          >{item.label}</button>
        }</List>
      </div>
    </Portal>
  )
}
```

---

## Combining Components

The real power of `@pyreon/elements` comes from combining its components together. Here are examples of common patterns:

### Dropdown Navigation

```ts
function DropdownNav(props: {
  title: string
  links: { href: string; label: string; icon?: string }[]
}) {
  return (
    <Overlay
      trigger={({ toggle, isOpen }) =>
        <Element
          tag="button"
          onClick={toggle}
          afterContent={<span
            style={() => `transform: rotate(${isOpen() ? '180deg' : '0deg'}); transition: transform 0.2s;`}
          >{'\u25BC'}</span>}
          gap={8}
          aria-expanded={() => String(isOpen())}
        >{props.title}</Element>
      }
      content={({ close }) =>
        <div class="dropdown-panel" role="menu">
          <List
            data={props.links}
          >{(link) =>
            <Element
              tag="a"
              key={link.href}
              href={link.href}
              beforeContent={link.icon ? <img src={link.icon} alt="" /> : undefined}
              gap={8}
              block={true}
              onClick={close}
              class="dropdown-link"
              role="menuitem"
            >{link.label}</Element>
          }</List>
        </div>
      }
    />
  )
}
```

### Settings Panel with Sections

```ts
interface SettingGroup {
  title: string
  settings: { id: string; label: string; description: string; control: VNodeChild }[]
}

function SettingsPanel(props: { groups: SettingGroup[] }) {
  return (
    <Element
      direction="rows"
      gap={32}
      block={true}
      class="settings-panel"
    >
      <List data={props.groups}>{(group) =>
        <section key={group.title}>
          <Text tag="h2" class="settings-section-title">{group.title}</Text>
          <List
            data={group.settings}
            tag="div"
            class="settings-list"
          >{(setting, { last }) =>
            <Element
              key={setting.id}
              afterContent={setting.control}
              block={true}
              style={!last ? 'padding: 16px 0; border-bottom: 1px solid #eee;' : 'padding: 16px 0;'}
            >
              <div>
                <Text tag="div" class="setting-label">{setting.label}</Text>
                <Text tag="div" class="setting-desc">{setting.description}</Text>
              </div>
            </Element>
          }</List>
        </section>
      }</List>
    </Element>
  )
}
```

---

## API Reference

| Export | Type | Description |
|---|---|---|
| `Element` | Component | Flex layout with before/main/after slots |
| `Text` | Component | Simple text rendering component |
| `List` | Component | Data-driven list renderer with positional metadata |
| `Overlay` | Component | Headless trigger + content open/close pattern |
| `Portal` | Component | Render children into a different DOM location |

## Types

| Type | Description |
|---|---|
| `ElementProps` | Props for `Element`. Includes `tag`, `beforeContent`, `children`, `afterContent`, `direction`, `alignX`, `alignY`, `gap`, `block`, `equalCols`, `class`, `style`, and pass-through HTML attributes. |
| `AlignX` | `'left' \| 'center' \| 'right'` |
| `AlignY` | `'top' \| 'center' \| 'bottom'` |
| `Direction` | `'inline' \| 'rows'` |
| `TextProps` | Props for `Text`. Includes `tag`, `paragraph`, `label`, `children`, `class`, `style`, and pass-through HTML attributes. |
| `ListProps<T>` | Props for `List`. Generic over the item type `T`. Includes `data`, `children` (render function), `keyFn`, `tag`, `class`, `style`, and pass-through HTML attributes. |
| `ItemMeta` | Positional metadata: `index`, `first`, `last`, `odd`, `even`. |
| `OverlayProps` | Props for `Overlay`. Includes `trigger` and `content` render functions. |
| `OverlayContext` | Context object with `isOpen`, `open`, `close`, `toggle`. Shared between trigger and content. |
| `PortalProps` | Props for `Portal`. Includes `target`, `tag`, `children`. |
