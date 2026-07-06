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

Interaction (`fireEvent`, `waitFor`), ARIA-role queries, `renderHook`, jest-dom matchers, and the reactive matchers (`expectSignal(sig).toHaveChangedTimes(n)`, `expectEffect(e).toReRunWhen(...)`, `expectGarbageCollected(...)`) arrive in the following PRs.

## Environment

Works in happy-dom (node) for structural assertions and in a real browser (`@vitest/browser`) for interaction/layout. Because Pyreon uses event delegation, interaction tests belong in a real browser — see the package's own browser smoke tests for the pattern.

MIT
