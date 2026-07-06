# @pyreon/testing

Official testing utilities for [Pyreon](https://github.com/pyreon/pyreon).

`@pyreon/testing` is a thin adapter over **[`@testing-library/dom`](https://testing-library.com/docs/dom-testing-library/intro)** — the same battle-tested foundation under the React, Vue, Solid, and Svelte testing libraries — so the entire Testing-Library API works exactly as you already know it. On top of that it adds a Pyreon-aware `render`/`renderHook` and **reactive-native matchers** that read Pyreon's fine-grained reactive graph — assertions no DOM-only testing library can express.

```bash
bun add -d @pyreon/testing
```

> This is the public, app-facing kit. `@pyreon/test-utils` is framework-internal (used to test Pyreon's own packages) — you don't install it.

## Render + query

```tsx
import { render, screen, cleanup } from '@pyreon/testing'
import { afterEach } from 'vitest'

afterEach(cleanup)

test('renders the greeting', () => {
  render(<Greeting name="Ada" />)
  expect(screen.getByRole('heading', { name: 'Hello, Ada' })).toBeTruthy()
})
```

`render(ui, options?)` mounts a Pyreon component into an isolated container and returns the **full `@testing-library/dom` query set** bound to it (`getByRole`, `getByText`, `getByLabelText`, `getByTestId`, … each with `queryBy`/`getAllBy`/`findBy` variants), plus `container` / `baseElement` / `unmount` / `debug`. `screen` is the document-scoped query surface. `getByRole` uses real ARIA role + accessible-name resolution (from `@testing-library/dom`) — not an approximation.

`screen`, `fireEvent`, `waitFor`, `within`, `prettyDOM`, and every query are **re-exported verbatim** from `@testing-library/dom`, so any Testing-Library guide, matcher, or muscle memory applies directly.

## Interaction

```tsx
import { render, screen, fireEvent, waitFor } from '@pyreon/testing'

render(<LoginForm />)
fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } })
fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument())
```

`fireEvent` dispatches bubbling events that reach Pyreon's event-delegation root, so delegated handlers fire — verified end to end in a real browser.

## And the part no other testing library has

Reactive-native matchers read Pyreon's reactive graph to assert on fire counts and fine-grained re-run behavior:

```ts
import { expectSignal, expectEffect } from '@pyreon/testing'

expectSignal(total).toHaveRecomputedTimes(1)
expectEffect(logEffect).notToReRunWhen(() => theme.set('dark')) // fine-grained: NOT re-run by an unrelated write
```

(`renderHook`, jest-dom matchers via `@pyreon/testing/matchers`, the reactive matchers, and the GC/leak matchers ship across the companion releases.)

## Environment

Structural assertions run in happy-dom (node); interaction + layout run in a real browser (`@vitest/browser`). Pyreon's event delegation means interaction tests belong in a real browser.

MIT
