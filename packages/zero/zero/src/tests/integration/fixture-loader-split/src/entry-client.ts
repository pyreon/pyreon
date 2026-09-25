import { routes } from 'virtual:zero/routes'

// Keep the route table live so the build bundles every route.
;(globalThis as { __routes?: unknown }).__routes = routes
