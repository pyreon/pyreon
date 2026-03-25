# @pyreon/storybook

Storybook renderer for Pyreon components. Handles mounting, rendering, and cleanup of Pyreon VNode trees inside Storybook's canvas.

## Installation

```bash
bun add @pyreon/storybook
```

## Setup

Add Pyreon as the framework in your Storybook config:

```ts
// .storybook/main.ts
export default {
  framework: "@pyreon/storybook",
  stories: ["../src/**/*.stories.tsx"],
}
```

## Quick Start

```tsx
import type { Meta, StoryObj } from "@pyreon/storybook"
import { Button } from "./Button"

const meta = {
  component: Button,
  args: { label: "Click me" },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { variant: "primary" },
}

export const WithCustomRender: Story = {
  render: (args) => (
    <div style="padding: 20px">
      <Button {...args} />
    </div>
  ),
}
```

## API

### `renderToCanvas(context, canvasElement)`

Core integration point called by Storybook every time a story is displayed or re-rendered. Handles cleanup of the previous mount, building the VNode from the story function, and mounting into the canvas.

```ts
import { renderToCanvas } from "@pyreon/storybook"

renderToCanvas(
  { storyFn, storyContext, showMain, showError, forceRemount },
  canvasElement,
)
```

### `defaultRender(component, args)`

Default render implementation used when no custom `render` is provided in the story or meta. Calls `h(component, args)`.

```ts
import { defaultRender } from "@pyreon/storybook"

const vnode = defaultRender(MyComponent, { label: "Hello" })
```

## Types

| Type | Description |
| --- | --- |
| `Meta<TComponent>` | Story metadata — component, args, decorators, argTypes, parameters, tags |
| `StoryObj<TMeta>` | Individual story definition with typed args inferred from meta |
| `StoryFn<TArgs>` | `(args, context) => VNodeChild` — story render function |
| `DecoratorFn<TArgs>` | `(storyFn, context) => VNodeChild` — story decorator |
| `StoryContext<TArgs>` | Context passed to story functions and decorators |
| `PyreonRenderer` | Storybook renderer descriptor (component + storyResult types) |
| `InferProps<T>` | Extract props type from a Pyreon component function |

### Meta Properties

| Property | Type | Description |
| --- | --- | --- |
| `component` | `ComponentFn` | The component to document |
| `title` | `string` | Display title in the sidebar |
| `decorators` | `DecoratorFn[]` | Decorators applied to every story |
| `args` | `Partial<Props>` | Default args for all stories |
| `argTypes` | `Record<string, unknown>` | Arg type definitions for Controls panel |
| `parameters` | `Record<string, unknown>` | Story parameters (backgrounds, viewport, etc.) |
| `tags` | `string[]` | Tags for filtering (e.g. `"autodocs"`) |
| `render` | `(args, context) => VNodeChild` | Default render function override |

### StoryObj Properties

| Property | Type | Description |
| --- | --- | --- |
| `args` | `Partial<Props>` | Args for this story (merged with meta.args) |
| `decorators` | `DecoratorFn[]` | Decorators for this story only |
| `render` | `(args, context) => VNodeChild` | Override the render function |
| `name` | `string` | Story name override |
| `play` | `(context) => Promise<void>` | Play function for interaction tests |

## Decorators

Decorators wrap stories with additional rendering context:

```tsx
import type { Meta } from "@pyreon/storybook"
import { ThemeProvider } from "../theme"

const meta = {
  component: Button,
  decorators: [
    (storyFn, context) => (
      <ThemeProvider theme="dark">
        {storyFn(context.args, context)}
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof Button>
```

## Re-exports

`@pyreon/storybook` re-exports these for convenience in story files:

- From `@pyreon/core`: `h`, `Fragment`
- From `@pyreon/reactivity`: `signal`, `computed`, `effect`
- From `@pyreon/runtime-dom`: `mount`
- Types: `ComponentFn`, `Props`, `VNode`, `VNodeChild`
