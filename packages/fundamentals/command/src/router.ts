import type { Command, Text } from './types'

/** The part of a `@pyreon/router` route record this needs: its path, name, meta and children. */
export interface RouteLike {
  path: string
  name?: string
  meta?: { title?: string; [key: string]: unknown }
  redirect?: unknown
  children?: readonly RouteLike[]
}

/** What `filter`, `title` and `keywords` are given about a route. */
export interface RouteInfo {
  /** The full path, from the root: `/settings/profile`. */
  path: string
  name: string | undefined
  meta: { title?: string; [key: string]: unknown }
}

export interface RouteCommandsOptions {
  /** Go to a path: `(path) => router.push(path)`. */
  navigate: (path: string) => unknown
  /** Leave a route out (an admin area, a route the user may not enter). */
  filter?: (route: RouteInfo) => boolean
  /** The title of the command: a string, or a function that follows the locale. Default: `meta.title`, else the name or the last segment, made readable; "/" is "Home". */
  title?: (route: RouteInfo) => Text
  /** The group the commands are listed in. */
  group?: string
  /** Extra match terms. The path is always one. */
  keywords?: (route: RouteInfo) => readonly string[]
  /** The command id of a path. Default `route:/path`. */
  id?: (path: string) => string
}

function join(parent: string, path: string): string {
  if (path.startsWith('/')) return path
  const base = parent === '/' ? '' : parent

  return `${base}/${path}`.replace(/\/+/g, '/')
}

function readable(segment: string): string {
  const words = segment.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim()

  return words === '' ? words : words.charAt(0).toUpperCase() + words.slice(1)
}

/** A path with a parameter, a wildcard or a pattern cannot be navigated to without more information. */
function isNavigable(path: string): boolean {
  return !/[:*()?]/.test(path)
}

function defaultTitle(route: RouteInfo): string {
  if (typeof route.meta.title === 'string' && route.meta.title !== '') return route.meta.title
  if (route.path.length <= 1) return 'Home'
  const last = route.path.split('/').filter(Boolean).at(-1) ?? ''

  return readable(route.name ?? last)
}

function collect(routes: readonly RouteLike[], parent: string, into: RouteInfo[]): void {
  for (const route of routes) {
    const path = join(parent, route.path)
    if (route.redirect === undefined && isNavigable(path)) into.push({ path, name: route.name, meta: route.meta ?? {} })
    if (route.children !== undefined) collect(route.children, path, into)
  }
}

/**
 * Navigation commands from the routes you gave `createRouter`: one per route you can go to without more information (a path
 * with a parameter or a wildcard, and a redirect, are left out; a child path is joined to its parent). The router does not
 * expose its route table, so this takes the same array. Register the result: `commands.register(routeCommands(routes, { navigate }))`.
 */
export function routeCommands(routes: readonly RouteLike[], options: RouteCommandsOptions): Command[] {
  const found: RouteInfo[] = []
  collect(routes, '', found)
  const seen = new Set<string>()
  const out: Command[] = []
  for (const route of found) {
    if (seen.has(route.path) || options.filter?.(route) === false) continue
    seen.add(route.path)
    const command: Command = {
      id: options.id?.(route.path) ?? `route:${route.path}`,
      title: options.title === undefined ? defaultTitle(route) : options.title(route),
      keywords: [route.path, ...(options.keywords?.(route) ?? [])],
      run: async () => {
        await options.navigate(route.path)
      },
    }
    if (options.group !== undefined) command.group = options.group
    out.push(command)
  }

  return out
}
