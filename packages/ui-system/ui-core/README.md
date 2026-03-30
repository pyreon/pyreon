# @pyreon/ui-core

Shared foundation for the Pyreon UI System ecosystem.

Provides utility functions, a styling engine bridge, theme context, and HTML tag definitions used across all `@pyreon` packages. No external utility dependencies — all implementations are built-in with prototype pollution protection where applicable.

## Installation

```bash
bun add @pyreon/ui-core
```

## API

### Provider & Context

```ts
import { Provider, context, config, init } from '@pyreon/ui-core'
```

**Provider** wraps your app with a theme context. It bridges `@pyreon/styler`'s theming with the internal context system.

```ts
import { Provider } from '@pyreon/ui-core'

Provider({
  theme: { rootSize: 16, breakpoints: { xs: 0, md: 768 } },
  children: [
    /* your app */
  ],
})
```

**config** — the styling engine singleton. Pyreon uses `@pyreon/styler` directly — no connector abstraction needed.

```ts
import { config } from '@pyreon/ui-core'

// Access the engine from anywhere
const { styled, css, keyframes } = config
```

### Utilities

#### compose

Right-to-left function composition.

```ts
import { compose } from '@pyreon/ui-core'

const transform = compose(toUpperCase, trim, normalize)
transform('  hello  ') // => 'HELLO'
```

#### render

Flexible element renderer. Handles components, elements, primitives, and arrays.

```ts
import { render } from '@pyreon/ui-core'

render('hello') // => 'hello'
render(MyComponent) // => MyComponent({})
render(null) // => null
```

#### isEmpty

Type-safe emptiness check. Returns `true` for `null`, `undefined`, `{}`, `[]`, and non-object primitives.

```ts
import { isEmpty } from '@pyreon/ui-core'

isEmpty({}) // => true
isEmpty([]) // => true
isEmpty(null) // => true
isEmpty({ a: 1 }) // => false
```

#### omit / pick

Create objects without or with only specified keys. Accept nullable inputs.

```ts
import { omit, pick } from '@pyreon/ui-core'

omit({ a: 1, b: 2, c: 3 }, ['b']) // => { a: 1, c: 3 }
pick({ a: 1, b: 2, c: 3 }, ['a', 'b']) // => { a: 1, b: 2 }
```

#### set / get

Nested property access and mutation by dot/bracket path. `set` has built-in prototype pollution protection — keys like `__proto__`, `constructor`, and `prototype` are blocked.

```ts
import { set, get } from '@pyreon/ui-core'

const obj = {}
set(obj, 'a.b.c', 42) // => { a: { b: { c: 42 } } }
get(obj, 'a.b.c') // => 42
get(obj, 'a.x', 'default') // => 'default'
```

#### merge

Deep merge objects left-to-right. Only plain objects are recursed into; arrays are replaced wholesale. Prototype pollution keys are blocked.

```ts
import { merge } from '@pyreon/ui-core'

merge({ a: { x: 1 } }, { a: { y: 2 } }) // => { a: { x: 1, y: 2 } }
```

#### throttle

Limits function execution to at most once per wait period. Returns a throttled function with a `.cancel()` method.

```ts
import { throttle } from '@pyreon/ui-core'

const throttled = throttle(handleResize, 200)
window.addEventListener('resize', throttled)
// cleanup: throttled.cancel()
```

### HTML Constants

```ts
import { HTML_TAGS, HTML_TEXT_TAGS } from '@pyreon/ui-core'
```

- **HTML_TAGS** — array of 100+ valid HTML tag names
- **HTML_TEXT_TAGS** — array of text-content tags (h1–h6, p, span, strong, em, etc.)

Both have corresponding TypeScript union types: `HTMLTags` and `HTMLTextTags`.

## Peer Dependencies

| Package        | Version  |
| -------------- | -------- |
| @pyreon/core   | >= 0.0.1 |
| @pyreon/styler | >= 0.0.1 |

## License

MIT
