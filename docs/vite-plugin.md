# Vite Plugin

`@pyreon/vite-plugin` configures Vite for Pyreon projects. It sets up the JSX transform, handles `.pyreon` single-file components, and enables HMR for signals and components.

## Installation

```bash
bun add @pyreon/vite-plugin --dev
```

## vite.config.ts

```ts
import { defineConfig } from "vite"
import pyreonPlugin from "@pyreon/vite-plugin"

export default defineConfig({
  plugins: [pyreonPlugin()],
})
```

That is the minimal config. The plugin automatically:

- Configures Babel to transform JSX using `@pyreon/core` as the JSX import source
- Registers the `.pyreon` file extension for single-file components
- Enables HMR for components and signal state

## Plugin Options

```ts
pyreonPlugin({
  // JSX source package (default: "@pyreon/core")
  jsxImportSource: "@pyreon/core",

  // Include .tsx, .jsx, .pyreon files in JSX transform (default: true)
  include: /\.(tsx|jsx|pyreon)$/,

  // Exclude node_modules (default: true)
  exclude: /node_modules/,

  // Enable HMR (default: true in dev, false in prod)
  hmr: true,
})
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@pyreon/core",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src", "vite.config.ts"]
}
```

The key settings:

| Setting | Value | Why |
|---|---|---|
| `jsx` | `"react-jsx"` | Use the automatic JSX transform (no manual imports) |
| `jsxImportSource` | `"@pyreon/core"` | Pyreon's JSX runtime instead of React's |

## .pyreon Files

`.pyreon` files are treated as pure JSX — they have no `<template>`, `<script>`, or `<style>` sections (unlike Vue's SFCs). The extension is just a convention for Pyreon components.

```tsx
// src/components/Button.pyreon
import { signal } from "@pyreon/reactivity"

interface ButtonProps {
  label: string
  onClick?: () => void
}

export default function Button({ label, onClick }: ButtonProps) {
  const pressed = signal(false)

  const handleClick = () => {
    pressed.set(true)
    onClick?.()
    setTimeout(() => pressed.set(false), 150)
  }

  return (
    <button
      class={() => pressed() ? "btn btn-pressed" : "btn"}
      onClick={handleClick}
    >
      {label}
    </button>
  )
}
```

Import `.pyreon` files the same way as `.tsx`:

```ts
import Button from "./components/Button.pyreon"
```

## HMR

Pyreon's HMR support hot-replaces component functions without losing signal state. When a component file changes:

1. The new component function is evaluated.
2. Existing mounted instances are re-rendered with the new function.
3. Signal values from the previous version are preserved.
4. `onMount` re-runs; `onUnmount` runs for the old instance first.

This means you can edit styles, layout, and logic and see changes instantly without losing counter values, form inputs, or other interactive state.

### HMR Boundary

Each component is an HMR boundary by default. Changes to a component file only re-run that component and its children, not the entire application.

### Signals Persist Across HMR

```tsx
// Editing this file while the counter is at 5 preserves the value
function Counter() {
  const count = signal(0)  // initial value only used on first mount
  return (
    <div>
      <span>{count()}</span>
      <button onClick={() => count.update(n => n + 1)}>+</button>
    </div>
  )
}
```

Store-level state also persists across HMR updates.

### Automatic Signal Debug Names

In dev mode, the plugin automatically injects debug names into `signal()` calls:

```tsx
// You write:
const count = signal(0)

// Plugin transforms to:
const count = signal(0, { name: "count" })
```

This means `signal.debug()`, `why()`, and devtools show `"count"` instead of `"anonymous"` — with zero effort from the developer. Names are not injected in production builds.

## Project Structure

A typical Vite + Pyreon project:

```
my-app/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── src/
    ├── main.ts        # mount entry point
    ├── App.tsx        # root component
    ├── components/
    │   ├── Header.pyreon
    │   └── Button.tsx
    ├── stores/
    │   └── user.ts
    └── pages/
        ├── Home.tsx
        └── About.tsx
```

**index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pyreon App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**src/main.ts**

```ts
import { mount } from "@pyreon/runtime-dom"
import { h } from "@pyreon/core"
import { App } from "./App"

mount(document.getElementById("app")!, h(App, null))
```

Or with JSX in main.tsx:

```tsx
import { mount } from "@pyreon/runtime-dom"
import { App } from "./App"

mount(document.getElementById("app")!, <App />)
```

## CSS

Pyreon does not include a CSS-in-JS solution. Use Vite's built-in CSS support:

```tsx
// Component-scoped CSS module
import styles from "./Button.module.css"

function Button() {
  return <button class={styles.btn}>Click me</button>
}
```

```tsx
// Global CSS import
import "./global.css"
```

## Build

```bash
bun run vite build
```

Output goes to `dist/`. The plugin tree-shakes Pyreon framework code — only the primitives you use are included in the bundle.

## Environment Variables

Standard Vite env variables work as expected:

```ts
// Access in components
const API_URL = import.meta.env.VITE_API_URL
```

## Gotchas

**Do not import from `react` or `react-dom`.** The Vite plugin does not alias React imports. If you need the React compat layer, import from `@pyreon/react-compat` explicitly.

**HMR does not work for top-level effects.** Effects created at module scope (outside components) are not HMR-aware. Move them inside components or stores.

```ts
// Not HMR-aware — runs once when module loads, never again
effect(() => console.log("module-level effect"))

// HMR-aware — runs inside component setup
function MyComponent() {
  effect(() => console.log("component-level effect"))
  return <div />
}
```

**TypeScript type errors in `.pyreon` files.** If your editor does not recognize `.pyreon` as JSX, add it to the `include` array in `tsconfig.json` and configure your editor's TypeScript plugin to treat `.pyreon` files as TSX.
