---
title: Getting Started
description: Install and configure Pyreon in your project.
---

## Installation

Install the core packages:

::: code-group

```bash [npm]
npm install @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```

```bash [bun]
bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```

```bash [pnpm]
pnpm add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```

```bash [yarn]
yarn add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```

:::

## Vite Setup

Add the Pyreon plugin to your Vite config:

```ts title="vite.config.ts"
import { defineConfig } from "vite";
import { pyreonPlugin } from "@pyreon/vite-plugin";

export default defineConfig({
  plugins: [pyreonPlugin()],
});
```

## Your First Component

```tsx title="src/main.tsx"
import { signal, computed } from "@pyreon/reactivity";
import { defineComponent, Show } from "@pyreon/core";
import { mount } from "@pyreon/runtime-dom";

const count = signal(0);

const App = defineComponent(() => {
  const doubled = computed(() => count() * 2);

  return () => (
    <div>
      <h1>Hello Pyreon!</h1>
      <button onClick={() => count(count() + 1)}>Clicks: {count()}</button>
      <p>Doubled: {doubled()}</p>
      <Show when={() => count() > 0}>
        <p>You've started clicking!</p>
      </Show>
    </div>
  );
});

mount(App, document.getElementById("app")!);
```

## HTML Entry Point

```html title="index.html"
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pyreon App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

## Adding SSR

For server-side rendering, install the server runtime:

::: code-group

```bash [npm]
npm install @pyreon/runtime-server
```

```bash [bun]
bun add @pyreon/runtime-server
```

```bash [pnpm]
pnpm add @pyreon/runtime-server
```

```bash [yarn]
yarn add @pyreon/runtime-server
```

:::

```tsx title="src/entry-server.tsx"
import { renderToString } from "@pyreon/runtime-server";
import App from "./App";

export async function render() {
  return await renderToString(App);
}
```

For streaming SSR with Suspense support:

```tsx title="src/entry-server.tsx"
import { renderToStream } from "@pyreon/runtime-server";
import App from "./App";

export function render(res: WritableStream) {
  return renderToStream(App, res);
}
```

## Adding Routing

::: code-group

```bash [npm]
npm install @pyreon/router
```

```bash [bun]
bun add @pyreon/router
```

```bash [pnpm]
pnpm add @pyreon/router
```

```bash [yarn]
yarn add @pyreon/router
```

:::

```tsx title="src/router.ts"
import { createRouter } from "@pyreon/router";

export const router = createRouter({
  routes: [
    { path: "/", component: () => import("./pages/Home") },
    { path: "/about", component: () => import("./pages/About") },
    { path: "/users/:id", component: () => import("./pages/User") },
  ],
});
```

```tsx title="src/App.tsx"
import { defineComponent } from "@pyreon/core";
import { RouterProvider, RouterView, RouterLink } from "@pyreon/router";
import { router } from "./router";

export default defineComponent(() => {
  return () => (
    <RouterProvider router={router}>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
      <RouterView />
    </RouterProvider>
  );
});
```

## Using a Compatibility Layer

If you're coming from React, you can use familiar hooks:

::: code-group

```bash [npm]
npm install @pyreon/react-compat
```

```bash [bun]
bun add @pyreon/react-compat
```

```bash [pnpm]
pnpm add @pyreon/react-compat
```

```bash [yarn]
yarn add @pyreon/react-compat
```

:::

```tsx
import { useState, useEffect, memo } from "@pyreon/react-compat";

const Counter = memo(() => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    document.title = `Count: ${count}`;
  }, [count]);

  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
});
```

## What's Next?

- Learn about [Reactivity](/docs/reactivity) — the signal engine at the core
- Explore the [Component Model](/docs/core) — defineComponent, lifecycle, control flow
- Set up [Routing](/docs/router) — type-safe nested routes
- Add [State Management](/docs/store) — Pinia-inspired stores
- Style with [Styler](/docs/styler) — CSS-in-JS for signals
