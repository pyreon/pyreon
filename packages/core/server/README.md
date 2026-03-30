# @pyreon/server

SSR handler, static site generation, and island architecture for Pyreon.

## Install

```bash
bun add @pyreon/server
```

## SSR

Create a request handler that renders your Pyreon app on the server:

```ts
import { createHandler } from '@pyreon/server'
import { App } from './App'
import { routes } from './routes'

const handler = createHandler({
  App,
  routes,
  template: await Bun.file('index.html').text(),
})

Bun.serve({ fetch: handler, port: 3000 })
```

## SSG (Static Site Generation)

Pre-render pages to static HTML files:

```ts
import { createHandler, prerender } from '@pyreon/server'

const handler = createHandler({ App, routes })
const result = await prerender({
  handler,
  paths: ['/', '/about', '/blog'],
  outDir: 'dist',
})
console.log(`Generated ${result.pages} pages in ${result.elapsed}ms`)
```

## Islands

Render mostly-static pages with interactive islands that hydrate independently:

```ts
// Server
import { island } from '@pyreon/server'

const Counter = island(() => import('./Counter'), {
  name: 'Counter',
  hydrate: 'visible', // load | idle | visible | media(query) | never
})
```

```ts
// Client entry
import { startClient, hydrateIslands } from '@pyreon/server/client'

// Full app hydration
startClient({ App, routes, container: '#app' })

// Or island-only hydration
hydrateIslands({
  Counter: () => import('./Counter'),
  Search: () => import('./Search'),
})
```

## API

### Server Exports (`@pyreon/server`)

- `createHandler(options: HandlerOptions)` -- create an SSR request handler
- `prerender(options: PrerenderOptions)` -- generate static HTML files
- `island(loader, options: IslandOptions)` -- define an island component
- `processTemplate(template, data)` -- inject rendered HTML into an HTML template
- `buildScripts(data)` -- generate script tags for hydration
- `DEFAULT_TEMPLATE` -- built-in HTML template

### Client Exports (`@pyreon/server/client`)

- `startClient(options: StartClientOptions)` -- hydrate a full SSR app
- `hydrateIslands(registry)` -- hydrate island components on the page

### Types

`HandlerOptions`, `PrerenderOptions`, `PrerenderResult`, `IslandOptions`, `IslandMeta`, `HydrationStrategy`, `Middleware`, `MiddlewareContext`, `TemplateData`, `StartClientOptions`
