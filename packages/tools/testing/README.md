# @pyreon/testing

Official testing utilities for [Pyreon](https://github.com/pyreon/pyreon) — a Testing-Library-style API for mounting and asserting on components, plus reactive-native matchers that read Pyreon's fine-grained reactive graph.

```bash
bun add -d @pyreon/testing
```

## Render + query

```tsx
import { render, screen, cleanup } from '@pyreon/testing'
import { afterEach } from 'vitest'

afterEach(cleanup) // or add '@pyreon/testing/vitest' to setupFiles (PR3)

test('renders the greeting', () => {
  render(<Greeting name="Ada" />)
  expect(screen.getByText('Hello, Ada')).toBeTruthy()
})
```

`render(ui, options?)` mounts into an isolated container appended to `document.body` and returns bound queries (`getByText`, `getByTestId`, `queryBy*`, `getAllBy*`, `findBy*`) plus `container`, `unmount`, and `debug()`. `screen` exposes the same queries scoped to the whole document.

## Interaction

```tsx
import { render, screen, fireEvent, waitFor } from '@pyreon/testing'

render(<LoginForm />)
fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
await waitFor(() => expect(screen.getByText('Welcome')).toBeTruthy())
```

`fireEvent` dispatches **bubbling** events so they reach Pyreon's delegation root (delegated handlers only fire on events that bubble to the container). `waitFor(cb, { timeout, interval })` polls until `cb` stops throwing. Queries cover `getByText`, `getByTestId`, `getByRole` (implicit + explicit roles, narrow by accessible `name`), `getByLabelText`, `getByPlaceholderText` — each with the `queryBy`/`getAllBy`/`findBy` variants.

## Hooks + matchers + zero-setup

```ts
// vitest.config.ts — auto-cleanup between tests + DOM matchers
export default { test: { setupFiles: ['@pyreon/testing/vitest'] } }
```

```tsx
import { renderHook } from '@pyreon/testing'

const { result, rerender } = renderHook((size) => usePagination(size), { initialProps: 10 })
expect(result.current.pageCount()).toBe(5)
rerender(20) // updates the REACTIVE prop signal — the hook is not re-invoked (Pyreon semantics)
expect(result.current.pageCount()).toBe(3)
```

`renderHook` runs the hook once in a probe component (Pyreon hooks run once); props are a reactive accessor and `rerender` updates the backing signal so `computed`/`effect` derivations re-run. jest-dom-style matchers (`toBeInTheDocument`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`, `toBeDisabled`, `toBeChecked`, `toHaveValue`, `toBeVisible`, `toContainElement`, `toHaveFocus`, …) register via `@pyreon/testing/matchers` or the `/vitest` setup file.

The reactive matchers (`expectSignal(sig).toHaveChangedTimes(n)`, `expectEffect(e).toReRunWhen(...)`, `expectGarbageCollected(...)`) arrive in the following PRs.

## Environment

Works in happy-dom (node) for structural assertions and in a real browser (`@vitest/browser`) for interaction/layout. Because Pyreon uses event delegation, interaction tests belong in a real browser — see the package's own browser smoke tests for the pattern.

MIT
