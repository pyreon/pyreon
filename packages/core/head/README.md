# @pyreon/head

Manage document head tags (title, meta, link, style, script, JSON-LD) with Pyreon's reactivity system. Supports SSR via `renderWithHead`.

## Install

```bash
bun add @pyreon/head
```

## Quick Start

```tsx
import { HeadProvider, useHead } from "@pyreon/head";

const App = () => {
  useHead({
    title: "My App",
    meta: [
      { name: "description", content: "A Pyreon application" },
      { property: "og:title", content: "My App" },
    ],
    link: [{ rel: "canonical", href: "https://example.com" }],
  });

  return <div>Hello</div>;
};

// Wrap your app with HeadProvider
const Root = () => (
  <HeadProvider>
    <App />
  </HeadProvider>
);
```

## SSR

Use `renderWithHead` to capture head tags during server-side rendering:

```tsx
import { renderWithHead } from "@pyreon/head";

const { html, head } = renderWithHead(<App />);
// `head` contains the serialized <title>, <meta>, <link>, etc.
```

## API

### Components

- `HeadProvider` -- context provider that collects head entries from the tree

### Hooks

- `useHead(input: UseHeadInput)` -- declare head tags from any component

### SSR

- `renderWithHead(vnode)` -- render to string and extract head tags as `RenderWithHeadResult`
- `createHeadContext()` -- create a standalone head context for manual integration

### Types

`HeadTag`, `HeadEntry`, `UseHeadInput`, `HeadContextValue`, `HeadProviderProps`, `RenderWithHeadResult`
