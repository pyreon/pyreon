# @pyreon/test-utils

Testing utilities for Pyreon UI system components — eliminates boilerplate when testing rocketstyle, styled, and provider-based components.

## Usage

```ts
import {
  initTestConfig,
  withThemeContext,
  getComputedTheme,
  renderProps,
  ThemeCapture,
  BaseComponent,
} from '@pyreon/test-utils'

// Setup mocks
let cleanup: () => void
beforeAll(() => { cleanup = initTestConfig() })
afterAll(() => cleanup())

// Test theme computation
it('computes theme correctly', () => {
  const theme = getComputedTheme(MyButton, { state: 'primary' })
  expect(theme.color).toBe('red')
})

// Test rendered props
it('renders with correct props', () => {
  const props = renderProps(MyComponent, { label: 'Hello' })
  expect(props.children).toBe('Hello')
})

// Custom theme context
it('works in dark mode', () => {
  const theme = getComputedTheme(MyButton, {}, { mode: 'dark' })
  expect(theme.backgroundColor).toBe('#1a1a1a')
})
```

## Mount-and-mutate helpers

For testing fine-grained reactivity — i.e. proving a component patches its DOM in place when a signal changes, instead of re-running its parent — `@pyreon/test-utils` exposes two helpers built on `@pyreon/runtime-dom`:

- **`mountReactive(vnode)`** — mounts a VNode tree into a fresh DOM container, returns `{ container, cleanup, unmount }`. Use this for any test that needs to assert DOM state after a signal mutation.
- **`mountAndExpectOnce(factory, mutations)`** — mounts the factory's output and tracks how many times it was invoked across the supplied mutations. The canonical assertion is `parentCalls() === 1`, proving that signal-driven updates patch in place rather than re-instantiating the parent.

Both require a DOM environment. Add `environment: 'happy-dom'` to your package's `vitest.config.ts`:

```ts
// packages/<your-package>/vitest.config.ts
import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'
import { sharedConfig } from '../../vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: { globals: true, environment: 'happy-dom' },
  }),
)
```

### Example: reactive text node patching

```ts
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountReactive } from '@pyreon/test-utils'

it('text updates when signal mutates', () => {
  const name = signal('Aisha')
  const { container, cleanup } = mountReactive(h('div', null, () => name()))

  expect(container.textContent).toBe('Aisha')
  name.set('Marcus')
  expect(container.textContent).toBe('Marcus')

  cleanup()
})
```

### Example: parent-runs-once contract

```ts
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountAndExpectOnce } from '@pyreon/test-utils'
import DocText from '../primitives/DocText'

it('parent runs once across 5 signal mutations', () => {
  const headline = signal('Senior Engineer')

  const { container, parentCalls, cleanup } = mountAndExpectOnce(
    () => h(DocText, null, () => headline()),
    () => {
      headline.set('Staff Engineer')
      headline.set('Principal Engineer')
      headline.set('Distinguished Engineer')
      headline.set('Fellow')
      headline.set('CTO')
    },
  )

  expect(parentCalls()).toBe(1)        // factory ran exactly once
  expect(container.textContent).toBe('CTO')
  cleanup()
})
```

The "parent runs once" pattern catches the bug fixed in PR #191 — a parent component mounted inside a reactive thunk like `{() => <Template prop={signal()} />}` would re-create the entire subtree on every signal change. The helper turns that bug into a one-line test assertion.

## License

MIT
