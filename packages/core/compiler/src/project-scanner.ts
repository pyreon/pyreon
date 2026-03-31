/**
 * Project scanner — extracts route, component, and island information from source files.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface RouteInfo {
  path: string
  name?: string | undefined
  component?: string | undefined
  hasLoader: boolean
  hasGuard: boolean
  params: string[]
}

export interface ComponentInfo {
  name: string
  file: string
  hasSignals: boolean
  signalNames: string[]
  props: string[]
}

export interface IslandInfo {
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

function extractRoutes(files: string[], _cwd: string): RouteInfo[] {
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

function extractIslands(files: string[], cwd: string): IslandInfo[] {
  const islands: IslandInfo[] = []

  for (const file of files) {
    let code: string
    try {
      code = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }

    const islandRe =
      /island\s*\(\s*\(\)\s*=>\s*import\(.+?\)\s*,\s*\{[^}]*name\s*:\s*["']([^"']+)["'][^}]*?(?:hydrate\s*:\s*["']([^"']+)["'])?[^}]*\}/g
    let match: RegExpExecArray | null
    for (match = islandRe.exec(code); match; match = islandRe.exec(code)) {
      if (match[1]) {
        islands.push({
          name: match[1],
          file: path.relative(cwd, file),
          hydrate: match[2] ?? 'load',
        })
      }
    }
  }

  return islands
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
