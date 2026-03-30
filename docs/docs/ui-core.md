---
title: UI Core
description: Core initialization, CSS engine connector, and shared utilities for the Pyreon UI system.
---

`@pyreon/ui-core` provides the foundation for Pyreon's UI system. It includes the `init()` function to configure the CSS engine, shared context providers, and utility functions used by other UI packages.

<PackageBadge name="@pyreon/ui-core" href="/docs/ui-core" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/ui-core
```

```bash [bun]
bun add @pyreon/ui-core
```

```bash [pnpm]
pnpm add @pyreon/ui-core
```

```bash [yarn]
yarn add @pyreon/ui-core
```

:::

## Overview

UI Core is the shared foundation that all other Pyreon UI packages (`@pyreon/attrs`, `@pyreon/rocketstyle`, `@pyreon/elements`, etc.) depend on. It handles three responsibilities:

1. **CSS engine initialization** -- the `init()` function connects a CSS engine (e.g., `@pyreon/styler`) so that styled components can inject styles.
2. **Context providers** -- shared context for theme state, breakpoints, and configuration that flows through the component tree.
3. **Shared utilities** -- pure helper functions (`merge`, `omit`, `pick`, `get`, `set`, `throttle`, `isEqual`, `isEmpty`) and component composition tools (`compose`, `hoistNonReactStatics`, `render`).

## Initialization

Call `init()` at your app's entry point to connect the CSS engine before rendering any UI components:

```tsx
import { init } from "@pyreon/ui-core";
import { styled, css } from "@pyreon/styler";

init({
  styled,
  css,
  // other CSS engine hooks as needed
});
```

This must happen before any `@pyreon/rocketstyle` or `@pyreon/elements` components render, as they rely on the configured engine to generate and inject styles.

## Context and Provider

UI Core provides a shared context and `Provider` component for distributing configuration through the component tree:

```tsx
import { Provider, context } from "@pyreon/ui-core";

<Provider value={{ breakpoints: { sm: 576, md: 768, lg: 992, xl: 1200 } }}>
  <App />
</Provider>;
```

## Utilities

### Object Helpers

```tsx
import { merge, omit, pick, get, set } from "@pyreon/ui-core";

merge({ a: 1 }, { b: 2 }); // { a: 1, b: 2 }
omit({ a: 1, b: 2, c: 3 }, ["b"]); // { a: 1, c: 3 }
pick({ a: 1, b: 2, c: 3 }, ["a"]); // { a: 1 }
get({ a: { b: 1 } }, "a.b"); // 1
set({}, "a.b", 1); // { a: { b: 1 } }
```

### Comparison Helpers

```tsx
import { isEqual, isEmpty } from "@pyreon/ui-core";

isEqual({ a: 1 }, { a: 1 }); // true
isEmpty({}); // true
isEmpty({ a: 1 }); // false
```

### Component Composition

```tsx
import { compose, hoistNonReactStatics } from "@pyreon/ui-core";

// compose applies a chain of higher-order components
const EnhancedComponent = compose(withAuth, withTheme, withLogger)(BaseComponent);

// hoistNonReactStatics copies statics from source to target
hoistNonReactStatics(WrappedComponent, OriginalComponent);
```

### Other

```tsx
import { throttle, useStableValue } from "@pyreon/ui-core";

const throttled = throttle(handleResize, 100);
```

## HTML Tag Constants

UI Core exports lists of valid HTML tags used by other UI packages for prop filtering and element creation:

```tsx
import { HTML_TAGS, HTML_TEXT_TAGS } from "@pyreon/ui-core";
```

## API Reference

| Export                 | Type      | Description                                 |
| ---------------------- | --------- | ------------------------------------------- |
| `init`                 | Function  | Configures the CSS engine connector         |
| `config`               | Object    | Current CSS engine configuration            |
| `Provider`             | Component | Shared context provider                     |
| `context`              | Context   | Raw Pyreon context object                   |
| `compose`              | Function  | HOC composition utility                     |
| `render`               | Function  | Component render helper                     |
| `hoistNonReactStatics` | Function  | Copies static properties between components |
| `merge`                | Function  | Deep merge objects                          |
| `omit`                 | Function  | Omit keys from an object                    |
| `pick`                 | Function  | Pick keys from an object                    |
| `get`                  | Function  | Get nested value by path                    |
| `set`                  | Function  | Set nested value by path                    |
| `throttle`             | Function  | Throttle a function                         |
| `isEqual`              | Function  | Deep equality check                         |
| `isEmpty`              | Function  | Check if a value is empty                   |
| `useStableValue`       | Hook      | Returns a stable reference for a value      |
| `HTML_TAGS`            | Array     | List of all valid HTML tag names            |
| `HTML_TEXT_TAGS`       | Array     | List of HTML tags that contain text content |

## Types

| Type                 | Description                                                  |
| -------------------- | ------------------------------------------------------------ |
| `CSSEngineConnector` | Interface for connecting a CSS engine to UI Core             |
| `Breakpoints`        | Breakpoint size map (e.g., `&#123; sm: 576, md: 768 &#125;`) |
| `BreakpointKeys`     | String union of breakpoint names                             |
| `HTMLTags`           | Union type of all valid HTML tag names                       |
| `HTMLTextTags`       | Union type of text-content HTML tags                         |
| `Render`             | Render function type                                         |

## Key Features

- `init()` configures the CSS engine at app startup
- Shared context provider for theme and breakpoint state
- Pure utility functions for object manipulation and comparison
- HOC composition and static hoisting tools
- HTML tag constants for prop filtering
- Foundation package for `@pyreon/attrs`, `@pyreon/rocketstyle`, and `@pyreon/elements`
