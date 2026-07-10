/**
 * Project scanner — extracts route, component, and island information from source files.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
import {
  apiFilePathToPattern,
  filePathToUrlPath,
  isApiRoute,
  ROUTE_EXTENSIONS,
  SPECIAL_ROUTE_FILES,
  stripRouteExtension,
} from './fs-route-convention'
import { deriveIslandName, islandRelPath } from './island-naming'
import { assertClassicTs } from './ts'

export interface RouteInfo {
  path: string
  name?: string | undefined
  component?: string | undefined
  hasLoader: boolean
  hasGuard: boolean
  params: string[]
  /**
   * True when this is a file-based API route — a `.ts`/`.js` file under the
   * TOP-LEVEL `api/` directory of the routes dir (exactly `@pyreon/zero`'s
   * `isApiRoute`). Absent for page routes. Note zero registers everything
   * else — nested `posts/api/x.ts`, method-handler `.ts` files outside
   * `api/` — as PAGE routes, so the scanner reports them the same way.
   */
  isApi?: boolean | undefined
}

export interface ComponentInfo {
  name: string
  file: string
  hasSignals: boolean
  signalNames: string[]
  props: string[]
}

export interface IslandInfo {
  /**
   * The island's REGISTRY name — what zero's hydration registry actually
   * keys on. Explicit `name:` option verbatim; const-bound islands without
   * one get the derived `X$<fnv1a6(relPath)>` name, the SAME derivation
   * `@pyreon/vite-plugin`'s auto-naming injects at transform time (shared
   * `island-naming.ts`; assumes the Vite root is the scanned cwd — true for
   * a standard zero app). A bindingless nameless `island()` call falls back
   * to the file basename — that is a PLACEHOLDER, not a registry name (the
   * runtime rejects unnamed bindingless islands with guidance).
   */
  name: string
  file: string
  hydrate: string
}

export interface ProjectContext {
  framework: 'pyreon'
  version: string
  generatedAt: string
  routes: RouteInfo[]
  components: ComponentInfo[]
  islands: IslandInfo[]
}

export function generateContext(cwd: string): ProjectContext {
  const files = collectSourceFiles(cwd)
  const version = readVersion(cwd)

  return {
    framework: 'pyreon',
    version,
    generatedAt: new Date().toISOString(),
    routes: extractRoutes(files, cwd),
    components: extractComponents(files, cwd),
    islands: extractIslands(files, cwd),
  }
}

function collectSourceFiles(cwd: string): string[] {
  const results: string[] = []
  const extensions = new Set(['.tsx', '.jsx', '.ts', '.js'])
  const ignoreDirs = new Set(['node_modules', 'dist', 'lib', '.pyreon', '.git', 'build'])

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.isDirectory()) continue
      if (ignoreDirs.has(entry.name) && entry.isDirectory()) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
        results.push(fullPath)
      }
    }
  }

  walk(cwd)
  return results
}

/**
 * Extract every route the project declares. Two sources, in priority order:
 *
 *  1. **File-based routes** (`@pyreon/zero`) — the dominant modern shape. Route
 *     files live under `src/routes/` (or `app/routes/` / `routes/`) and the URL
 *     is derived from the file path via the SHARED `./fs-route-convention`
 *     module (`filePathToUrlPath` / `isApiRoute` / `apiFilePathToPattern`) —
 *     the SAME functions `@pyreon/zero`'s fs-router re-exports, so scanner
 *     output can never drift from what zero actually serves.
 *  2. **Manual route arrays** — `createRouter([...])` / `const routes = [...]`
 *     with `path:` keys. Kept for non-zero apps that wire the router by hand.
 *
 * When both exist, file-based routes are the zero truth: a manual array route
 * is added only if its URL isn't already covered by a file-based route.
 */
function extractRoutes(files: string[], cwd: string): RouteInfo[] {
  const routes = extractFileRoutes(cwd)
  const seen = new Set(routes.map((r) => r.path))
  for (const manual of extractManualRoutes(files)) {
    if (seen.has(manual.path)) continue
    seen.add(manual.path)
    routes.push(manual)
  }
  return routes
}

function extractManualRoutes(files: string[]): RouteInfo[] {
  const routes: RouteInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }

    const routeArrayRe =
      /(?:createRouter\s*\(\s*\[|(?:const|let)\s+routes\s*(?::\s*RouteRecord\[\])?\s*=\s*\[)([\s\S]*?)\]/g
    let match: RegExpExecArray | null
    for (match = routeArrayRe.exec(code); match; match = routeArrayRe.exec(code)) {
      const block = match[1] ?? ''
      const routeObjRe = /path\s*:\s*["']([^"']+)["']/g
      let routeMatch: RegExpExecArray | null
      for (routeMatch = routeObjRe.exec(block); routeMatch; routeMatch = routeObjRe.exec(block)) {
        const routePath = routeMatch[1] ?? ''
        const surroundingStart = Math.max(0, routeMatch.index - 50)
        const surroundingEnd = Math.min(block.length, routeMatch.index + 200)
        const surrounding = block.slice(surroundingStart, surroundingEnd)

        routes.push({
          path: routePath,
          name: surrounding.match(/name\s*:\s*["']([^"']+)["']/)?.[1],
          hasLoader: /loader\s*:/.test(surrounding),
          hasGuard: /beforeEnter\s*:|beforeLeave\s*:/.test(surrounding),
          params: extractParams(routePath),
        })
      }
    }
  }

  return routes
}

/** Locate the fs-router routes directory, checking each convention in order. */
function findRoutesDir(cwd: string): string | undefined {
  for (const candidate of ['src/routes', 'app/routes', 'routes']) {
    const full = path.join(cwd, candidate)
    try {
      if (fs.statSync(full).isDirectory()) return full
    } catch {
      // not present — try the next candidate
    }
  }
  return undefined
}

/** Enumerate route files under `routesDir`, returned as forward-slash paths relative to it. */
function enumerateRouteFiles(routesDir: string): string[] {
  const out: string[] = []
  const exts = new Set(ROUTE_EXTENSIONS)

  function walk(dir: string, prefix: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        walk(full, rel)
      } else if (entry.isFile() && exts.has(path.extname(entry.name))) {
        // Skip test/spec/story fixtures + serverLoader (`*.server.ts`) siblings —
        // none are navigable routes.
        if (/\.(test|spec|stories)\.(tsx?|jsx?)$/.test(entry.name)) continue
        if (/\.server\.(tsx?|jsx?)$/.test(entry.name)) continue
        out.push(rel)
      }
    }
  }

  walk(routesDir, '')
  return out
}

function extractFileRoutes(cwd: string): RouteInfo[] {
  const routesDir = findRoutesDir(cwd)
  if (!routesDir) return []

  const routes: RouteInfo[] = []
  for (const rel of enumerateRouteFiles(routesDir)) {
    const noExt = stripRouteExtension(rel)
    const fileName = noExt.split('/').pop() ?? ''
    if (SPECIAL_ROUTE_FILES.has(fileName)) continue

    let source = ''
    try {
      source = fs.readFileSync(path.join(routesDir, rel), 'utf-8')
    } catch {
      // unreadable — still emit the path (empty source ⇒ no loader/guard flags)
    }

    // The SHARED zero convention decides API-vs-page — a `.ts`/`.js` file
    // under the TOP-LEVEL `api/` dir only. Everything else (nested
    // `posts/api/x.ts`, method-handler `.ts` outside `api/`) is a page
    // route, exactly as zero registers it.
    const api = isApiRoute(rel)
    const urlPath = api ? apiFilePathToPattern(rel) : filePathToUrlPath(noExt)

    routes.push({
      path: urlPath,
      hasLoader: detectFileExport(source, 'loader') || detectFileExport(source, 'serverLoader'),
      hasGuard: detectFileExport(source, 'guard') || detectFileExport(source, 'middleware'),
      params: extractParams(urlPath),
      ...(api ? { isApi: true } : {}),
    })
  }

  // Stable, human-friendly ordering for the generated context.json.
  routes.sort((a, b) => a.path.localeCompare(b.path))
  return routes
}

/** Detect a top-level `export const|let|var|function NAME` or `export { NAME }`. */
function detectFileExport(source: string, name: string): boolean {
  const decl = new RegExp(`export\\s+(?:async\\s+)?(?:const|let|var|function)\\s+${name}\\b`)
  if (decl.test(source)) return true
  const list = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`)
  return list.test(source)
}

function extractComponents(files: string[], cwd: string): ComponentInfo[] {
  const components: ComponentInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }

    const componentRe =
      /(?:export\s+)?(?:const|function)\s+([A-Z]\w*)\s*(?::\s*ComponentFn<[^>]+>\s*)?=?\s*\(?(?:\s*\{?\s*([^)]*?)\s*\}?\s*)?\)?\s*(?:=>|{)/g
    let match: RegExpExecArray | null

    for (match = componentRe.exec(code); match; match = componentRe.exec(code)) {
      const name = match[1] ?? 'Unknown'
      const propsStr = match[2] ?? ''
      const props = propsStr
        .split(/[,;]/)
        .map((p) => p.trim().replace(/[{}]/g, '').trim().split(':')[0]?.split('=')[0]?.trim() ?? '')
        .filter((p) => p && p !== 'props')

      const bodyStart = match.index + match[0].length
      const body = code.slice(bodyStart, Math.min(code.length, bodyStart + 2000))
      const signalNames: string[] = []
      const signalRe = /(?:const|let)\s+(\w+)\s*=\s*signal\s*[<(]/g
      let sigMatch: RegExpExecArray | null
      for (sigMatch = signalRe.exec(body); sigMatch; sigMatch = signalRe.exec(body)) {
        if (sigMatch[1]) signalNames.push(sigMatch[1])
      }

      components.push({
        name,
        file: path.relative(cwd, file),
        hasSignals: signalNames.length > 0,
        signalNames,
        props,
      })
    }
  }

  return components
}

/**
 * Extract `island()` declarations via the TS AST. Handles BOTH shapes:
 *   • explicit name — `island(() => import('./x'), { name: 'X', hydrate: 'load' })`
 *   • auto-named    — `const Widget = island(() => import('./w'), { hydrate: 'visible' })`
 *     (zero auto-names const-bound islands off the binding identifier — the #1
 *     modern shape the old `name:`-requiring regex missed entirely)
 *
 * The name is resolved in priority order: explicit `name:` option →
 * `deriveIslandName(binding, relPath)` for an enclosing `const/let/var
 * <Name> = island(...)` binding (the registry name the vite-plugin injects)
 * → file basename fallback (for a bindingless nameless call — a placeholder,
 * see IslandInfo.name). The loader-argument shape is NOT constrained, so
 * `island(loader, opts)` with a hoisted loader is captured too.
 */
function extractIslands(files: string[], cwd: string): IslandInfo[] {
  const islands: IslandInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    // Cheap pre-filter so we only pay for AST parsing on files that could
    // contain an island() call.
    if (!code.includes('island')) continue

    let sf: ts.SourceFile
    try {
      assertClassicTs()
      sf = ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
    } catch {
      continue
    }

    const relFile = path.relative(cwd, file)

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'island' &&
        node.arguments.length >= 1
      ) {
        let nameVal: string | undefined
        let hydrateVal: string | undefined

        const optsArg = node.arguments[1]
        if (optsArg && ts.isObjectLiteralExpression(optsArg)) {
          for (const prop of optsArg.properties) {
            if (!ts.isPropertyAssignment(prop)) continue
            const key = ts.isIdentifier(prop.name)
              ? prop.name.text
              : ts.isStringLiteral(prop.name)
                ? prop.name.text
                : ''
            if (key === 'name') nameVal = stringLiteralValue(prop.initializer)
            else if (key === 'hydrate') hydrateVal = stringLiteralValue(prop.initializer)
          }
        }

        // No explicit `name:` → derive the REGISTRY name from the enclosing
        // const-binding identifier, exactly as the vite-plugin's auto-naming
        // does (`X$<fnv1a6(relPath)>` — shared `deriveIslandName`). Last
        // resort (bindingless nameless call): file-basename placeholder —
        // documented on IslandInfo.name as NOT a registry name.
        if (!nameVal) {
          const binding = bindingNameOf(node)
          if (binding) nameVal = deriveIslandName(binding, islandRelPath(cwd, file))
        }
        if (!nameVal) nameVal = path.basename(relFile).replace(/\.(tsx?|jsx?)$/, '') || 'island'

        islands.push({ name: nameVal, file: relFile, hydrate: hydrateVal ?? 'load' })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }

  return islands
}

/** The identifier of an enclosing `const/let/var <Name> = <call>` binding, if any. */
function bindingNameOf(call: ts.CallExpression): string | undefined {
  const parent = call.parent
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text
  }
  return undefined
}

/** Read a string-literal / no-substitution-template value, else undefined. */
function stringLiteralValue(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return undefined
}

function extractParams(routePath: string): string[] {
  const params: string[] = []
  const paramRe = /:(\w+)\??/g
  let match: RegExpExecArray | null
  for (match = paramRe.exec(routePath); match; match = paramRe.exec(routePath)) {
    if (match[1]) params.push(match[1])
  }
  return params
}

function readVersion(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
    const deps: Record<string, unknown> = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const [name, ver] of Object.entries(deps)) {
      if (name.startsWith('@pyreon/') && typeof ver === 'string') return ver.replace(/^[\^~]/, '')
    }
    return (pkg.version as string) || 'unknown'
  } catch {
    return 'unknown'
  }
}
