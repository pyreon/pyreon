# @pyreon/storybook

Storybook renderer for Pyreon components. Mount, render, and interact with Pyreon components in Storybook.

## Install

```bash
bun add @pyreon/storybook
```

## Setup

Configure Storybook to use the Pyreon renderer:

```ts
// .storybook/main.ts
export default {
  stories: ["../src/**/*.stories.ts"],
  framework: "@pyreon/storybook",
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

export const AllVariants: Story = {
  render: (args) => (
    <div style="display: flex; gap: 8px;">
      <Button {...args} variant="primary" />
      <Button {...args} variant="secondary" />
    </div>
  ),
}
```

## API

### `renderToCanvas(context, canvasElement)`

Core renderer called by Storybook to display stories. Handles cleanup of previous renders, error display, and mounting the VNode tree.

| Parameter | Type | Description |
| --- | --- | --- |
| `context.storyFn` | `() => VNodeChild` | Function that produces the story VNode |
| `context.showMain` | `() => void` | Show the main canvas |
| `context.showError` | `(error) => void` | Show an error panel |
| `context.forceRemount` | `boolean` | Whether to force a full remount |
| `canvasElement` | `HTMLElement` | DOM element to render into |

This function is used internally by the Storybook framework preset. You typically do not call it directly.

### `defaultRender(component, args)`

Default render implementation. Called when no custom `render` function is provided on the story or meta.

| Parameter | Type | Description |
| --- | --- | --- |
| `component` | `ComponentFn` | Pyreon component function |
| `args` | `Record<string, unknown>` | Story args passed as props |

**Returns:** `VNodeChild` — result of `h(component, args)`

### `Meta<TComponent>`

Type for the default export of a story file. Provides type inference for args based on the component's props.

| Property | Type | Description |
| --- | --- | --- |
| `component` | `TComponent` | The component to document |
| `title` | `string` | Display title in sidebar |
| `decorators` | `DecoratorFn[]` | Decorators for all stories in the file |
| `args` | `Partial<InferProps<TComponent>>` | Default args |
| `argTypes` | `Record<string, unknown>` | Arg type definitions for Controls |
| `parameters` | `Record<string, unknown>` | Story parameters (backgrounds, viewport) |
| `tags` | `string[]` | Tags for filtering (e.g. `"autodocs"`) |
| `render` | `(args, context) => VNodeChild` | Default render function |
| `excludeStories` | `string \| string[] \| RegExp` | Exclude named exports |
| `includeStories` | `string \| string[] \| RegExp` | Include only named exports |

### `StoryObj<TMeta>`

Type for individual story exports. Args are merged with `Meta.args`.

| Property | Type | Description |
| --- | --- | --- |
| `args` | `Partial<MetaArgs>` | Args for this story |
| `argTypes` | `Record<string, unknown>` | Arg type overrides |
| `decorators` | `DecoratorFn[]` | Story-specific decorators |
| `parameters` | `Record<string, unknown>` | Story parameters |
| `tags` | `string[]` | Story tags |
| `render` | `(args, context) => VNodeChild` | Custom render for this story |
| `name` | `string` | Display name override |
| `play` | `(context) => Promise<void> \| void` | Interaction test function |

### `DecoratorFn<TArgs>`

Decorator function type for wrapping stories.

```tsx
const withTheme: DecoratorFn<{ label: string }> = (storyFn, context) => (
  <div class="dark-theme">{storyFn(context.args, context)}</div>
)
```

### `StoryFn<TArgs>` / `StoryContext<TArgs>` / `InferProps<T>`

| Type | Description |
| --- | --- |
| `StoryFn<TArgs>` | `(args, context) => VNodeChild` |
| `StoryContext<TArgs>` | `{ args, argTypes, globals, id, kind, name, viewMode }` |
| `InferProps<T>` | Extract props type from a `ComponentFn<P>` |

## Patterns

### Decorators

Wrap stories with providers, themes, or layout containers.

```tsx
const meta = {
  component: Button,
  decorators: [
    (storyFn, context) => (
      <div style="padding: 20px; background: #f5f5f5;">
        {storyFn(context.args, context)}
      </div>
    ),
  ],
} satisfies Meta<typeof Button>
```

### Interaction Tests

Use the `play` function for automated interaction testing.

```ts
export const Clickable: Story = {
  args: { label: "Click me" },
  play: async ({ canvasElement, step }) => {
    await step("click the button", async () => {
      const button = canvasElement.querySelector("button")!
      button.click()
    })
  },
}
```

### Reactive Stories

Use signals directly in stories to demonstrate interactive behavior.

```tsx
import { signal, effect } from "@pyreon/storybook"

export const Interactive: Story = {
  render: (args) => {
    const count = signal(0)
    return (
      <div>
        <p>{() => `Count: ${count()}`}</p>
        <button onClick={() => count.update(n => n + 1)}>Increment</button>
      </div>
    )
  },
}
```

## Re-exports

The following are re-exported for convenience in story files:

**From `@pyreon/core`:** `h`, `Fragment`

**From `@pyreon/reactivity`:** `signal`, `computed`, `effect`

**From `@pyreon/runtime-dom`:** `mount`

**Types from `@pyreon/core`:** `ComponentFn`, `Props`, `VNode`, `VNodeChild`

## Gotchas

- Previous renders are automatically cleaned up (unmounted) before a new story is displayed. The cleanup state is tracked per canvas element via a `WeakMap`.
- If a story's render function throws, the error is caught and displayed via Storybook's error panel rather than crashing the UI.
- `defaultRender` simply calls `h(component, args)`. If your component needs children or special setup, provide a custom `render` function.
- The `play` function receives `canvasElement` for DOM queries and a `step` helper for organizing interaction sequences.
