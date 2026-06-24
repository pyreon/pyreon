---
title: Storybook
description: Storybook renderer for developing and documenting Pyreon components.
---

`@pyreon/storybook` is a custom Storybook renderer that lets you develop, test, and document Pyreon components in isolation using Storybook's UI. It integrates directly with the Pyreon runtime so your stories behave exactly like real application code -- signals, effects, lifecycle hooks, and context all work as expected.

<PackageBadge name="@pyreon/storybook" href="/docs/storybook" status="beta" />

It ships:

- A `renderToCanvas(context, canvasElement)` renderer that mounts Pyreon VNodes into Storybook's canvas and disposes the previous mount on every re-render.
- Typed `Meta<TComponent>` / `StoryObj<TMeta>` helpers that infer story args from your component's props.
- A Storybook **framework preset** (`@pyreon/storybook/preset`) wired by setting `framework: '@pyreon/storybook'` — no manual `previewAnnotations`.
- Convenience re-exports of the core Pyreon primitives (`h`, `Fragment`, `signal`, `computed`, `effect`, `mount`) so story files need only one import.

## Installation

`@pyreon/storybook` requires `storybook` itself as a peer dependency (`>=8.0.0`). Install both as dev dependencies:

:::code-group

```bash [npm]
npm install -D @pyreon/storybook storybook
```

```bash [bun]
bun add -D @pyreon/storybook storybook
```

```bash [pnpm]
pnpm add -D @pyreon/storybook storybook
```

```bash [yarn]
yarn add -D @pyreon/storybook storybook
```

:::

If you do not have Storybook scaffolded yet, you can initialize it without installing a built-in framework and then point it at Pyreon:

```bash
bunx storybook@latest init --type html --skip-install
```

Then replace the framework in your Storybook config with `@pyreon/storybook` (see below).

## Setup

### `.storybook/main.ts`

Set `framework` to `@pyreon/storybook`. The framework preset (resolved automatically from `@pyreon/storybook/preset`) wires the renderer and registers the preview entry for you — there is no separate `previewAnnotations` step.

```ts
// .storybook/main.ts
import type { StorybookConfig } from 'storybook'

const config: StorybookConfig = {
  framework: '@pyreon/storybook',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
}

export default config
```

:::warning{title="Import StorybookConfig from 'storybook', not '@pyreon/storybook'"}
`@pyreon/storybook` does **not** re-export `StorybookConfig` — that type belongs to the `storybook` package. Importing it from the renderer is a type error. The renderer's main entry exports `Meta`, `StoryObj`, and the other story-authoring types listed in the [API Reference](#api-reference).
:::

### `.storybook/preview.ts`

Optionally add global decorators or parameters that apply to every story. Global decorators receive `(storyFn, context)` and must call `storyFn(context.args, context)` to render the wrapped story.

```tsx
// .storybook/preview.ts
import type { DecoratorFn } from '@pyreon/storybook'

const globalDecorators: DecoratorFn[] = [
  (storyFn, context) => (
    <div class="storybook-wrapper" style={{ padding: '1rem' }}>
      {storyFn(context.args, context)}
    </div>
  ),
]

export const decorators = globalDecorators
```

:::note{title="Stories run in a real iframe"}
Storybook renders each story in a real browser iframe via `mount()` from `@pyreon/runtime-dom`. SSR-only code paths in your components are not exercised here — cover those with happy-dom unit tests and Playwright. Everything client-side (signals, effects, context, event delegation) behaves exactly as in a real app.
:::

## Writing Stories

Stories use CSF3 (Component Story Format 3). Each story file exports a default `meta` object describing the component and named exports for individual stories. Use the `satisfies` operator so TypeScript infers story args from the component's props and flags mismatches.

```tsx
import type { Meta, StoryObj } from '@pyreon/storybook'
import { Button } from './Button'

const meta = {
  component: Button,
  title: 'Components/Button',
  args: { label: 'Click me' },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { variant: 'primary' },
}

export const Secondary: Story = {
  args: { variant: 'secondary' },
}

export const Disabled: Story = {
  args: { label: 'Disabled', disabled: true },
}
```

:::tip
Always write `satisfies Meta<typeof Button>` rather than `: Meta<typeof Button>`. `satisfies` preserves the literal types of `component` and `args`, which is what lets `StoryObj<typeof meta>` infer the exact args shape for each story.
:::

### Meta Options

The `meta` object describes the component and provides defaults for all stories in the file:

```tsx
const meta = {
  // The component to document (used by autodocs and the default render)
  component: Button,

  // Sidebar title — use slashes for nesting: "Design System/Atoms/Button"
  title: 'Components/Button',

  // Default args applied to all stories (overridden per-story)
  args: { label: 'Click me', variant: 'primary' },

  // Arg type definitions for the Controls panel
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost'],
    },
    onClick: { action: 'clicked' },
  },

  // Tags for filtering and features ("autodocs" enables auto-generated docs)
  tags: ['autodocs'],

  // Story parameters (backgrounds, viewport, layout, etc.)
  parameters: {
    layout: 'centered',
  },

  // Decorators applied to every story in this file
  decorators: [],

  // Default render function (overrides h(component, args))
  render: undefined,

  // Filter which named exports are treated as stories
  excludeStories: /^_/, // exclude exports starting with _
  includeStories: ['Primary', 'Secondary'], // or include only these
} satisfies Meta<typeof Button>
```

Every field is optional. The full list of `Meta` fields:

| Field            | Type                                            | Description                                                          |
| ---------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| `component`      | `TComponent`                                    | The Pyreon component to document. Drives autodocs and default render |
| `title`          | `string`                                        | Sidebar title; slashes nest (`"Atoms/Button"`)                       |
| `decorators`     | `DecoratorFn<InferProps<TComponent>>[]`         | Decorators applied to every story in the file                        |
| `args`           | `Partial<InferProps<TComponent>>`               | Default args for all stories                                         |
| `argTypes`       | `Record<string, unknown>`                       | Arg type definitions for the Controls panel                          |
| `parameters`     | `Record<string, unknown>`                       | Story parameters (backgrounds, viewport, layout)                     |
| `tags`           | `string[]`                                       | Tags for filtering (e.g. `"autodocs"`)                               |
| `render`         | `(args, context) => VNodeChild`                 | Default render; if omitted, `h(component, args)` is used             |
| `excludeStories` | `string \| string[] \| RegExp`                  | Named exports to exclude from being treated as stories               |
| `includeStories` | `string \| string[] \| RegExp`                  | Only treat these named exports as stories                            |

### StoryObj Options

Each named export is a `StoryObj` that can override meta-level defaults:

```tsx
export const WithLongLabel: Story = {
  // Override args for this story (merged onto meta.args)
  args: { label: 'This is a very long button label' },

  // Story-specific decorators (run inside meta decorators)
  decorators: [(storyFn, ctx) => <div style={{ maxWidth: '200px' }}>{storyFn(ctx.args, ctx)}</div>],

  // Story-specific parameters
  parameters: { layout: 'padded' },

  // Custom render for this story
  render: (args) => (
    <div class="button-showcase">
      <Button {...args} />
      <p>Character count: {args.label.length}</p>
    </div>
  ),

  // Display name override (defaults to the export name)
  name: 'Long Label',

  // Tags for this story
  tags: ['!autodocs'], // exclude from auto-generated docs
}
```

The full list of `StoryObj` fields:

| Field        | Type                                    | Description                                            |
| ------------ | --------------------------------------- | ------------------------------------------------------ |
| `args`       | `Partial<MetaArgs>`                     | Args for this story, merged onto `meta.args`           |
| `argTypes`   | `Record<string, unknown>`               | Arg type overrides                                     |
| `decorators` | `DecoratorFn<MetaArgs>[]`               | Decorators for this story only                         |
| `parameters` | `Record<string, unknown>`               | Parameters for this story                              |
| `tags`       | `string[]`                              | Tags for this story                                    |
| `render`     | `(args, context) => VNodeChild`         | Override the render function for this story            |
| `name`       | `string`                                | Story name override (defaults to the export name)      |
| `play`       | `(context) => Promise<void> \| void`    | Interaction-test function, runs after the story mounts |

`MetaArgs` is `InferProps<Meta['component']>` — the props of the component declared in the file's `meta`.

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

When no custom `render` is provided, the default render function is used: `h(component, args)`. This calls the component with the merged args as its props. If a story has neither a `render` nor a `component` (in `meta` or its own), the renderer throws — set one or the other.

## Decorators

Decorators wrap stories with providers, layouts, or other contextual elements. They receive the story function and context, and must call `storyFn(context.args, context)` to render the actual story.

### Component-Level Decorators

Applied to all stories in a file via the meta object:

```tsx
const meta = {
  component: ThemeCard,
  decorators: [
    (storyFn, context) => (
      <ThemeProvider theme="dark">{storyFn(context.args, context)}</ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ThemeCard>
```

### Story-Level Decorators

Applied to a single story:

```tsx
export const InModal: Story = {
  decorators: [(storyFn, context) => <Modal open={true}>{storyFn(context.args, context)}</Modal>],
}
```

### Global Decorators

Applied to all stories in `.storybook/preview.ts`:

```tsx
export const decorators = [
  (storyFn, context) => <div class="app-root">{storyFn(context.args, context)}</div>,
]
```

### Decorator Execution Order

When multiple levels of decorators are present, they execute from the outermost (global) to the innermost (story), wrapping the story in layers:

```text
Global decorator
  └─ Meta decorator
      └─ Story decorator
          └─ Story render
```

A decorator that does not call `storyFn(context.args, context)` will suppress the story entirely — make sure every decorator forwards the args and context through to the inner story function.

### DecoratorFn Type

```ts
type DecoratorFn<TArgs = Props> = (
  storyFn: StoryFn<TArgs>,
  context: StoryContext<TArgs>,
) => VNodeChild

type StoryFn<TArgs = Props> = (args: TArgs, context: StoryContext<TArgs>) => VNodeChild
```

:::warning{title="Decorators wrap with @pyreon/core providers, not React-style ones"}
A decorator returns a Pyreon `VNodeChild`. Provider components used inside a decorator (`<ThemeProvider>`, `<PyreonUI>`, router providers, etc.) must be Pyreon components — they run inside the same mount pipeline as the story, so signals and context propagate normally.
:::

## Reactive Stories

Pyreon's reactivity system works inside stories. The renderer mounts your VNode with `mount()` from `@pyreon/runtime-dom`, so signals drive fine-grained DOM updates exactly as they do in production — no re-render-the-whole-story step. Use the re-exported `signal` / `computed` / `effect` so story files need only one import.

```tsx
import { signal, computed } from '@pyreon/storybook'

export const Interactive: Story = {
  render: (args) => {
    const count = signal(0)
    const label = computed(() => `${args.label} (${count()})`)

    return (
      <div>
        <Button {...args} label={label()} onClick={() => count.update((n) => n + 1)} />
        <p>Clicked {count()} times</p>
        <button onClick={() => count.set(0)}>Reset</button>
      </div>
    )
  },
}
```

Effects also work as expected — they are created when the story mounts and disposed when the story is replaced or unmounted:

```tsx
import { signal, effect } from '@pyreon/storybook'

export const WithEffect: Story = {
  render: (args) => {
    const clicks = signal(0)

    effect(() => {
      console.log('Click count:', clicks())
    })

    return <Button {...args} onClick={() => clicks.update((n) => n + 1)} />
  },
}
```

:::note{title="Effects are disposed on re-render"}
Every call to `renderToCanvas` first disposes the previous mount — removing its DOM and stopping its effects — before mounting the new one. Switching stories or changing args via the Controls panel will never leak effects from a previous story.
:::

## Interaction Testing

Use `play` functions to simulate user interactions and run assertions against the rendered output. Play functions run after the story is rendered into the canvas.

```tsx
export const Clicked: Story = {
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector('button')!
    button.click()

    // Wait for reactive updates to flush
    await new Promise((r) => setTimeout(r, 0))

    // Assert the result
    const text = canvasElement.textContent
    console.assert(text?.includes('1'), 'Expected click count to be 1')
  },
}
```

### Step-Based Play Functions

Use the `step` utility to organize complex interaction tests into named groups:

```tsx
export const MultiStep: Story = {
  play: async ({ canvasElement, step }) => {
    await step('Click the button three times', async () => {
      const button = canvasElement.querySelector('button')!
      button.click()
      button.click()
      button.click()
    })

    await step('Verify the count', async () => {
      await new Promise((r) => setTimeout(r, 0))
      const count = canvasElement.querySelector('.count')?.textContent
      console.assert(count === '3', `Expected 3, got ${count}`)
    })

    await step('Reset and verify', async () => {
      const resetBtn = canvasElement.querySelector('.reset')!
      ;(resetBtn as HTMLElement).click()
      await new Promise((r) => setTimeout(r, 0))
      const count = canvasElement.querySelector('.count')?.textContent
      console.assert(count === '0', `Expected 0 after reset, got ${count}`)
    })
  },
}
```

### Play Function Context

The `play` function receives a context object:

| Property        | Type                                            | Description                                   |
| --------------- | ----------------------------------------------- | --------------------------------------------- |
| `canvasElement` | `HTMLElement`                                   | The DOM element containing the rendered story |
| `args`          | `MetaArgs`                                       | The merged args for this story                |
| `step`          | `(name: string, fn: () => Promise<void>) => Promise<void>` | Organize interactions into named steps        |

:::tip
Because Pyreon updates the DOM synchronously on signal writes, you usually only need `await new Promise((r) => setTimeout(r, 0))` to let microtasks settle (e.g. when an effect schedules work). Read the DOM through `canvasElement` after the interaction.
:::

## How It Works

### `renderToCanvas`

`renderToCanvas` is the core integration point between Storybook and Pyreon. Storybook calls it every time a story needs to be displayed or re-rendered (for example, when the user changes args via the Controls panel).

```ts
function renderToCanvas(
  context: {
    storyFn: () => VNodeChild
    storyContext: { component?: ComponentFn; args: Record<string, unknown>; [key: string]: unknown }
    showMain: () => void
    showError: (error: { title: string; description: string }) => void
    forceRemount: boolean
  },
  canvasElement: HTMLElement,
): void
```

It handles, in order:

1. **Cleanup** — Unmounts the previous story by calling the cleanup function stored for that canvas element, removing all DOM nodes and disposing effects.
2. **Rendering** — Calls `storyFn()` to get a `VNodeChild`, then uses `mount()` from `@pyreon/runtime-dom` to render it into `canvasElement`, and calls `showMain()`.
3. **Error handling** — If `storyFn()` throws, it shows a Storybook error overlay via `showError({ title, description })`. Non-`Error` throws are coerced to strings for the description.

Each canvas element tracks its cleanup function via a `WeakMap`, so switching between stories rapidly never leaks a mount.

:::note{title="Component setup errors are caught by mount(), not renderToCanvas"}
`renderToCanvas` only catches errors thrown by `storyFn()` itself (e.g. a render function that throws before returning a VNode). Errors thrown *inside* a component during setup are caught by Pyreon's `mount()` pipeline (and surface through `ErrorBoundary` if present), so `renderToCanvas` still calls `showMain()`. Use an `ErrorBoundary` to render error UI inside a story.
:::

### `defaultRender`

`defaultRender` provides the fallback rendering when no custom `render` function is specified on a story or its meta. It calls `h(component, args)`, passing the component function and the merged args as props.

```ts
function defaultRender(component: ComponentFn, args: Record<string, unknown>): VNodeChild
// → h(component, args)
```

### Subpath exports & the preset

The framework integration is split across three subpaths. Only the first is imported in your story files; the others are loaded by Storybook itself.

| Subpath                     | Loaded by                          | Surface                                                                                                          |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@pyreon/storybook`         | Your story files                   | `Meta`, `StoryObj`, `StoryFn`, `StoryContext`, `DecoratorFn`, `InferProps`, `PyreonRenderer`, `defaultRender`, `renderToCanvas`, plus Pyreon re-exports |
| `@pyreon/storybook/preset`  | Storybook server (config-load)     | Framework preset — `core.renderer`, `previewAnnotations`, `addons`. Resolved when `framework: '@pyreon/storybook'` |
| `@pyreon/storybook/preview` | Storybook preview iframe (runtime) | Registers `renderToCanvas` + the default `render`. Wired automatically by the preset's `previewAnnotations`     |

You never import `/preset` or `/preview` directly — setting `framework: '@pyreon/storybook'` in `.storybook/main.ts` is the only wiring required.

## Full Example: Card Component

A complete example showing a card component with multiple stories, decorators, and an interaction test:

```tsx
// Card.stories.tsx
import type { Meta, StoryObj } from '@pyreon/storybook'
import { signal } from '@pyreon/storybook'
import { Card } from './Card'

const meta = {
  component: Card,
  title: 'Components/Card',
  args: {
    title: 'Card Title',
    description: 'This is a card description.',
    variant: 'default',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outlined', 'elevated'],
    },
  },
  tags: ['autodocs'],
  decorators: [
    (storyFn, context) => (
      <div style={{ maxWidth: '400px', margin: '0 auto' }}>{storyFn(context.args, context)}</div>
    ),
  ],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Outlined: Story = {
  args: { variant: 'outlined' },
}

export const Elevated: Story = {
  args: { variant: 'elevated' },
}

export const WithActions: Story = {
  render: (args) => {
    const liked = signal(false)

    return (
      <Card {...args}>
        <div class="card-actions">
          <button onClick={() => liked.set(!liked())}>{liked() ? 'Unlike' : 'Like'}</button>
        </div>
      </Card>
    )
  },
  play: async ({ canvasElement }) => {
    const likeBtn = canvasElement.querySelector('button')!
    likeBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    console.assert(likeBtn.textContent === 'Unlike', 'Button should show Unlike after click')
  },
}

export const Loading: Story = {
  args: {
    title: 'Loading...',
    description: 'Content is loading.',
  },
  render: (args) => (
    <Card {...args}>
      <div class="skeleton" style={{ height: '100px' }} />
    </Card>
  ),
}
```

## API Reference

### Functions

| Export                            | Signature                                                              | Description                                                                                          |
| --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `renderToCanvas`                  | `(context, canvasElement: HTMLElement) => void`                       | Core render function for the Storybook integration. Manages mount/unmount lifecycle per canvas element. Called by the preview, not by users |
| `defaultRender`                   | `(component: ComponentFn, args: Record<string, unknown>) => VNodeChild` | Default render: returns `h(component, args)`. Used when no custom `render` is provided               |

### Type Exports

| Type                  | Description                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Meta<TComponent>`    | Story metadata — `component`, `title`, `args`, `decorators`, `argTypes`, `parameters`, `tags`, `render`, `excludeStories`, `includeStories` |
| `StoryObj<TMeta>`     | Individual story definition — `args`, `argTypes`, `decorators`, `parameters`, `tags`, `render`, `name`, `play`            |
| `StoryFn<TArgs>`      | Story function type: `(args: TArgs, context: StoryContext<TArgs>) => VNodeChild`                                          |
| `DecoratorFn<TArgs>`  | Decorator function type: `(storyFn: StoryFn<TArgs>, context: StoryContext<TArgs>) => VNodeChild`                          |
| `StoryContext<TArgs>` | Context passed to stories and decorators — `args`, `argTypes`, `globals`, `id`, `kind`, `name`, `viewMode`                |
| `PyreonRenderer`      | Renderer descriptor for Storybook — `component`, `storyResult`, `canvasElement`                                           |
| `InferProps<T>`       | `T extends ComponentFn<infer P> ? P : Props` — extracts the props type from a Pyreon component function                   |

### `StoryContext` Properties

| Property   | Type                      | Description                  |
| ---------- | ------------------------- | ---------------------------- |
| `args`     | `TArgs`                   | Merged args for this story   |
| `argTypes` | `Record<string, unknown>` | Arg type definitions         |
| `globals`  | `Record<string, unknown>` | Storybook global values      |
| `id`       | `string`                  | Story ID                     |
| `kind`     | `string`                  | Story kind (component title) |
| `name`     | `string`                  | Story name                   |
| `viewMode` | `'story' \| 'docs'`       | Current view mode            |

### Re-exports

The package re-exports the following from Pyreon for convenience, so you do not need to import them separately in story files:

**Functions:** `h`, `Fragment` (from `@pyreon/core`); `signal`, `computed`, `effect` (from `@pyreon/reactivity`); `mount` (from `@pyreon/runtime-dom`)

**Types:** `ComponentFn`, `Props`, `VNode`, `VNodeChild` (from `@pyreon/core`)

Using these re-exports keeps story files self-contained:

```tsx
import { signal, computed, effect } from '@pyreon/storybook'
import type { Meta, StoryObj } from '@pyreon/storybook'
```

## Gotchas

- **Args are passed as props.** The default render calls `h(component, args)`, so your component must accept the args shape as its props. Use `satisfies Meta<typeof Button>` so TypeScript catches mismatches between args and props.
- **Import `StorybookConfig` from `storybook`.** It is not re-exported by `@pyreon/storybook`. Story-authoring types (`Meta`, `StoryObj`, `DecoratorFn`, …) come from `@pyreon/storybook`.
- **Stories run in a real iframe.** SSR-only paths in your components are never exercised by stories — use happy-dom unit tests and Playwright for those.
- **A story needs a `render` or a `component`.** With neither set (in the story or its meta), the renderer cannot build a VNode and throws `[@pyreon/storybook] No component provided`.
- **`storyFn()` errors show an overlay; component setup errors do not.** Wrap a component that can throw during setup in an `ErrorBoundary` to render fallback UI inside the canvas.

## Peer Dependencies

- `storybook >= 8.0.0`
