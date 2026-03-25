---
title: Storybook
description: Storybook renderer for developing and documenting Pyreon components.
---

`@pyreon/storybook` is a custom Storybook renderer that lets you develop, test, and document Pyreon components in isolation using Storybook's UI. It integrates directly with the Pyreon runtime so your stories behave exactly like real application code -- signals, effects, lifecycle hooks, and context all work as expected.

<PackageBadge name="@pyreon/storybook" href="/docs/storybook" status="beta" />

## Installation

```bash
bun add -D @pyreon/storybook
```

You also need Storybook itself. If you do not have it set up yet:

```bash
bunx storybook@latest init --type html --skip-install
```

Then replace the framework in your Storybook config with `@pyreon/storybook`.

## Setup

Configure Storybook to use the Pyreon renderer in `.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@pyreon/storybook"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  framework: "@pyreon/storybook",
}

export default config
```

Optionally configure a preview file for global decorators or parameters in `.storybook/preview.ts`:

```ts
import type { DecoratorFn } from "@pyreon/storybook"

const globalDecorators: DecoratorFn[] = [
  (storyFn, context) => (
    <div class="storybook-wrapper" style={{ padding: "1rem" }}>
      {storyFn(context.args, context)}
    </div>
  ),
]

export const decorators = globalDecorators
```

## Writing Stories

Stories use the CSF3 (Component Story Format 3) syntax. Each story file exports a default `meta` object describing the component and named exports for individual stories.

```tsx
import type { Meta, StoryObj } from "@pyreon/storybook"
import { Button } from "./Button"

const meta = {
  component: Button,
  title: "Components/Button",
  args: { label: "Click me" },
  tags: ["autodocs"],
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { variant: "primary" },
}

export const Secondary: Story = {
  args: { variant: "secondary" },
}

export const Disabled: Story = {
  args: { label: "Disabled", disabled: true },
}
```

### Meta Options

The `meta` object describes the component and provides defaults for all stories in the file:

```tsx
const meta = {
  // The component to document (used by autodocs and default render)
  component: Button,

  // Sidebar title — use slashes for nesting: "Design System/Atoms/Button"
  title: "Components/Button",

  // Default args applied to all stories (overridden per-story)
  args: { label: "Click me", variant: "primary" },

  // Arg type definitions for the Controls panel
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost"],
    },
    onClick: { action: "clicked" },
  },

  // Tags for filtering and features (e.g., "autodocs" enables auto-generated docs)
  tags: ["autodocs"],

  // Story parameters (backgrounds, viewport, layout, etc.)
  parameters: {
    layout: "centered",
  },

  // Decorators applied to every story in this file
  decorators: [],

  // Default render function (overrides h(component, args))
  render: undefined,

  // Filter which named exports are treated as stories
  excludeStories: /^_/,  // exclude exports starting with _
} satisfies Meta<typeof Button>
```

### StoryObj Options

Each named export is a `StoryObj` that can override meta-level defaults:

```tsx
export const WithLongLabel: Story = {
  // Override args for this story
  args: { label: "This is a very long button label" },

  // Story-specific decorators (run inside meta decorators)
  decorators: [(storyFn, ctx) => (
    <div style={{ maxWidth: "200px" }}>
      {storyFn(ctx.args, ctx)}
    </div>
  )],

  // Story-specific parameters
  parameters: { layout: "padded" },

  // Custom render for this story
  render: (args) => (
    <div class="button-showcase">
      <Button {...args} />
      <p>Character count: {args.label.length}</p>
    </div>
  ),

  // Display name override (defaults to the export name)
  name: "Long Label",

  // Tags for this story
  tags: ["!autodocs"],  // exclude from auto-generated docs
}
```

## Custom Render Functions

Override the default rendering with a custom `render` function when you need to wrap or compose components:

```tsx
export const WithIcon: Story = {
  render: (args) => (
    <div class="flex gap-2">
      <span class="icon">★</span>
      <Button {...args} />
    </div>
  ),
}
```

The `render` function receives the merged args (meta args + story args) and a `StoryContext` object:

```tsx
export const WithContext: Story = {
  render: (args, context) => (
    <div>
      <p>Story: {context.name}</p>
      <p>View mode: {context.viewMode}</p>
      <Button {...args} />
    </div>
  ),
}
```

When no custom `render` is provided, the default render function is used: `h(component, args)`. This calls the component with the args as props.

## Decorators

Decorators wrap stories with providers, layouts, or other contextual elements. They receive the story function and context, and must call `storyFn(context.args, context)` to render the actual story.

### Component-Level Decorators

Applied to all stories in a file via the meta object:

```tsx
const meta = {
  component: ThemeCard,
  decorators: [
    (storyFn, context) => (
      <ThemeProvider theme="dark">
        {storyFn(context.args, context)}
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ThemeCard>
```

### Story-Level Decorators

Applied to a single story:

```tsx
export const InModal: Story = {
  decorators: [
    (storyFn, context) => (
      <Modal open={true}>
        {storyFn(context.args, context)}
      </Modal>
    ),
  ],
}
```

### Global Decorators

Applied to all stories in `.storybook/preview.ts`:

```ts
export const decorators = [
  (storyFn, context) => (
    <div class="app-root">
      {storyFn(context.args, context)}
    </div>
  ),
]
```

### Decorator Execution Order

When multiple levels of decorators are present, they execute from the outermost (global) to the innermost (story), wrapping the story in layers:

```
Global decorator
  └─ Meta decorator
      └─ Story decorator
          └─ Story render
```

### DecoratorFn Type

```ts
type DecoratorFn<TArgs = Props> = (
  storyFn: StoryFn<TArgs>,
  context: StoryContext<TArgs>,
) => VNodeChild
```

## Reactive Stories

Since Pyreon's reactivity system works inside stories, you can create interactive stories with signals:

```tsx
import { signal, computed } from "@pyreon/storybook"

export const Interactive: Story = {
  render: (args) => {
    const count = signal(0)
    const label = computed(() => `${args.label} (${count()})`)

    return (
      <div>
        <Button
          {...args}
          label={label()}
          onClick={() => count.update(n => n + 1)}
        />
        <p>Clicked {count()} times</p>
        <button onClick={() => count.set(0)}>Reset</button>
      </div>
    )
  },
}
```

Effects also work as expected:

```tsx
import { signal, effect } from "@pyreon/storybook"

export const WithEffect: Story = {
  render: (args) => {
    const clicks = signal(0)

    effect(() => {
      console.log("Click count:", clicks())
    })

    return (
      <Button {...args} onClick={() => clicks.update(n => n + 1)} />
    )
  },
}
```

## Interaction Testing

Use `play` functions to simulate user interactions and run assertions against the rendered output. Play functions run after the story is rendered.

```tsx
export const Clicked: Story = {
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector("button")!
    button.click()

    // Wait for reactive updates
    await new Promise(r => setTimeout(r, 0))

    // Assert the result
    const text = canvasElement.textContent
    console.assert(text?.includes("1"), "Expected click count to be 1")
  },
}
```

### Step-Based Play Functions

Use the `step` utility to organize complex interaction tests:

```tsx
export const MultiStep: Story = {
  play: async ({ canvasElement, step }) => {
    await step("Click the button three times", async () => {
      const button = canvasElement.querySelector("button")!
      button.click()
      button.click()
      button.click()
    })

    await step("Verify the count", async () => {
      await new Promise(r => setTimeout(r, 0))
      const count = canvasElement.querySelector(".count")?.textContent
      console.assert(count === "3", `Expected 3, got ${count}`)
    })

    await step("Reset and verify", async () => {
      const resetBtn = canvasElement.querySelector(".reset")!
      ;(resetBtn as HTMLElement).click()
      await new Promise(r => setTimeout(r, 0))
      const count = canvasElement.querySelector(".count")?.textContent
      console.assert(count === "0", `Expected 0 after reset, got ${count}`)
    })
  },
}
```

### Play Function Context

The `play` function receives a context object:

| Property | Type | Description |
| --- | --- | --- |
| `canvasElement` | `HTMLElement` | The DOM element containing the rendered story |
| `args` | `TArgs` | The merged args for this story |
| `step` | `(name, fn) => Promise<void>` | Organize interactions into named steps |

## How It Works

### renderToCanvas

The `renderToCanvas` function is the core integration point between Storybook and Pyreon. Storybook calls it every time a story needs to be displayed or re-rendered (e.g., when the user changes args via the Controls panel).

It handles:

1. **Cleanup** -- Unmounts the previous story by calling the stored cleanup function, removing all DOM nodes and disposing effects
2. **Rendering** -- Calls the story function to get a VNode, then uses `mount()` from `@pyreon/runtime-dom` to render it into the canvas element
3. **Error handling** -- If rendering throws, shows a Storybook error overlay with the error message

Each canvas element tracks its cleanup function via a `WeakMap`, ensuring proper lifecycle management even when switching between stories rapidly.

### defaultRender

The `defaultRender` function provides the fallback rendering behavior when no custom `render` function is specified on a story or meta. It simply calls `h(component, args)`, passing the component function and the merged args as props.

```ts
function defaultRender(component: ComponentFn, args: Record<string, unknown>): VNodeChild
```

## Full Example: Card Component

A complete example showing a card component with multiple stories, decorators, and interaction tests:

```tsx
// Card.stories.tsx
import type { Meta, StoryObj } from "@pyreon/storybook"
import { signal } from "@pyreon/storybook"
import { Card } from "./Card"

const meta = {
  component: Card,
  title: "Components/Card",
  args: {
    title: "Card Title",
    description: "This is a card description.",
    variant: "default",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outlined", "elevated"],
    },
  },
  tags: ["autodocs"],
  decorators: [
    (storyFn, context) => (
      <div style={{ maxWidth: "400px", margin: "0 auto" }}>
        {storyFn(context.args, context)}
      </div>
    ),
  ],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Outlined: Story = {
  args: { variant: "outlined" },
}

export const Elevated: Story = {
  args: { variant: "elevated" },
}

export const WithActions: Story = {
  render: (args) => {
    const liked = signal(false)

    return (
      <Card {...args}>
        <div class="card-actions">
          <button onClick={() => liked.set(!liked())}>
            {liked() ? "Unlike" : "Like"}
          </button>
        </div>
      </Card>
    )
  },
  play: async ({ canvasElement }) => {
    const likeBtn = canvasElement.querySelector("button")!
    likeBtn.click()
    await new Promise(r => setTimeout(r, 0))
    console.assert(
      likeBtn.textContent === "Unlike",
      "Button should show Unlike after click"
    )
  },
}

export const Loading: Story = {
  args: {
    title: "Loading...",
    description: "Content is loading.",
  },
  render: (args) => (
    <Card {...args}>
      <div class="skeleton" style={{ height: "100px" }} />
    </Card>
  ),
}
```

## API Reference

### Functions

| Export | Description |
| --- | --- |
| `renderToCanvas(options, canvas)` | Core render function for Storybook integration. Manages mount/unmount lifecycle per canvas element. |
| `defaultRender(component, args)` | Default render function: calls `h(component, args)`. Used when no custom render is provided. |

### Type Exports

| Type | Description |
| --- | --- |
| `Meta<TComponent>` | Story metadata -- component, title, args, decorators, argTypes, parameters, tags, render, excludeStories, includeStories |
| `StoryObj<TMeta>` | Individual story definition -- args, decorators, parameters, tags, render, name, play |
| `StoryFn<TArgs>` | Story function type: `(args: TArgs, context: StoryContext<TArgs>) => VNodeChild` |
| `DecoratorFn<TArgs>` | Decorator function type: `(storyFn: StoryFn<TArgs>, context: StoryContext<TArgs>) => VNodeChild` |
| `StoryContext<TArgs>` | Context passed to stories and decorators -- args, argTypes, globals, id, kind, name, viewMode |
| `PyreonRenderer` | Renderer descriptor for Storybook -- component, storyResult, canvasElement |
| `InferProps<T>` | Extract props type from a Pyreon component function |

### StoryContext Properties

| Property | Type | Description |
| --- | --- | --- |
| `args` | `TArgs` | Merged args for this story |
| `argTypes` | `Record<string, unknown>` | Arg type definitions |
| `globals` | `Record<string, unknown>` | Storybook global values |
| `id` | `string` | Story ID |
| `kind` | `string` | Story kind (component title) |
| `name` | `string` | Story name |
| `viewMode` | `'story' \| 'docs'` | Current view mode |

### Re-exports

The package re-exports the following from Pyreon for convenience, so you do not need to import them separately in story files:

**Functions:** `h`, `Fragment`, `signal`, `computed`, `effect`, `mount`

**Types:** `ComponentFn`, `Props`, `VNode`, `VNodeChild`

Using these re-exports keeps story files self-contained:

```tsx
import { signal, computed, effect } from "@pyreon/storybook"
import type { Meta, StoryObj } from "@pyreon/storybook"
```
