# @pyreon/storybook

Storybook renderer for Pyreon components — mount, render, interact via Storybook's standard tooling.

`@pyreon/storybook` is the Storybook framework integration for Pyreon. Set `framework: "@pyreon/storybook"` in `.storybook/main.ts` and your Pyreon components render in Storybook with the standard `Meta` / `StoryObj` types, args, decorators, and play interactions. Ships a `renderToCanvas(context, canvasElement)` renderer, typed `Meta<TComponent>` + `StoryObj<TMeta>` helpers, and convenience re-exports of the core Pyreon primitives (`h`, `Fragment`, `signal`, `computed`, `effect`, `mount`) so stories don't need a second import.

## Install

```bash
bun add -D @pyreon/storybook storybook
```

## Configure

```ts
// .storybook/main.ts
import type { StorybookConfig } from 'storybook'

const config: StorybookConfig = {
  framework: '@pyreon/storybook',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
}

export default config
```

The framework preset (resolved from `@pyreon/storybook/preset`) wires the renderer for you. No additional `previewAnnotations` needed.

## Write a story

```tsx
import type { Meta, StoryObj } from '@pyreon/storybook'
import { Button } from './Button'

const meta = {
  component: Button,
  args: { label: 'Click me' },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: { variant: 'primary' },
}

export const WithSignal: Story = {
  render: (args) => {
    const count = signal(0)
    return (
      <div>
        <Button {...args} onClick={() => count.update((c) => c + 1)} />
        <span>{count()}</span>
      </div>
    )
  },
}
```

## Subpath exports

| Subpath                      | Surface                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `@pyreon/storybook`          | `Meta`, `StoryObj`, `StoryFn`, `StoryContext`, `DecoratorFn`, `InferProps`, `PyreonRenderer`, `defaultRender`, `renderToCanvas`, plus Pyreon re-exports (`h`, `Fragment`, `signal`, `computed`, `effect`, `mount`) |
| `@pyreon/storybook/preset`   | Storybook framework preset — loaded by `.storybook/main.ts` when `framework: "@pyreon/storybook"` |
| `@pyreon/storybook/preview`  | Preview annotations entry — registered by the preset                              |

## API

### `Meta<TComponent>`

Story metadata. Use the `satisfies` operator to get inferred props:

```ts
const meta = {
  component: MyComponent,
  args: { label: 'hello' },
  argTypes: { label: { control: 'text' } },
} satisfies Meta<typeof MyComponent>
```

### `StoryObj<TMeta>`

Story object. Args are inferred from `Meta['component']`:

```ts
type Story = StoryObj<typeof meta>

export const Demo: Story = {
  args: { variant: 'primary' },
  play: async ({ canvasElement }) => { /* ... */ },
}
```

### `renderToCanvas(context, canvasElement)`

The renderer Storybook calls to mount a story into its canvas iframe. Used internally by the preset — most users never call it directly.

### Pyreon re-exports

`h`, `Fragment`, `signal`, `computed`, `effect`, `mount` are re-exported for convenience so stories don't need a second `import { signal } from '@pyreon/reactivity'`.

## Peer dependencies

- `storybook >= 8.0.0`

## Gotchas

- **Args are passed as props** — your component must accept the args shape as its props type. Use the `satisfies Meta<typeof Button>` form so TS catches mismatches.
- **Storybook's auto-docs work** — props are inferred from the component's TS signature via `react-docgen-typescript`-style introspection.
- **Stories run in a real iframe**, so SSR-only paths in your components shouldn't be exercised by stories. Use happy-dom unit tests + Playwright for those.

## Documentation

Full docs: [docs.pyreon.dev/docs/storybook](https://docs.pyreon.dev/docs/storybook) (or `docs/docs/storybook.md` in this repo).

## License

MIT
