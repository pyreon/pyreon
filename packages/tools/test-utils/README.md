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

## License

MIT
