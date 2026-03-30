import type { ImportInfo } from '../types'

export type { ImportInfo }

// ── Constants ───────────────────────────────────────────────────────────────

export const PYREON_PREFIX = '@pyreon/'

export const REACTIVITY_APIS = new Set([
  'signal',
  'computed',
  'effect',
  'batch',
  'onCleanup',
  'createSelector',
  'createStore',
  'untrack',
])

export const LIFECYCLE_APIS = new Set(['onMount', 'onUnmount'])

export const CONTEXT_APIS = new Set(['createContext', 'provide', 'pushContext', 'popContext'])

export const JSX_COMPONENTS = new Set([
  'For',
  'Show',
  'Switch',
  'Match',
  'Dynamic',
  'ErrorBoundary',
  'Suspense',
  'Portal',
])

export const HEAVY_PACKAGES = new Set([
  '@pyreon/charts',
  '@pyreon/code',
  '@pyreon/document',
  '@pyreon/flow',
])

export const BROWSER_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IntersectionObserver',
  'MutationObserver',
  'ResizeObserver',
  'matchMedia',
  'getComputedStyle',
  'addEventListener',
  'removeEventListener',
])

// ── Functions ───────────────────────────────────────────────────────────────

export function isPyreonImport(source: string): boolean {
  return source.startsWith(PYREON_PREFIX)
}

export function isPyreonPackage(source: string): boolean {
  return source.startsWith(PYREON_PREFIX)
}

export function extractImportInfo(node: any): ImportInfo | null {
  if (node.type !== 'ImportDeclaration') return null

  const source = node.source?.value as string
  if (!source) return null

  const specifiers: ImportInfo['specifiers'] = []
  let isDefault = false
  let isNamespace = false

  for (const spec of node.specifiers ?? []) {
    if (spec.type === 'ImportDefaultSpecifier') {
      isDefault = true
      specifiers.push({ imported: 'default', local: spec.local?.name ?? '' })
    } else if (spec.type === 'ImportNamespaceSpecifier') {
      isNamespace = true
      specifiers.push({ imported: '*', local: spec.local?.name ?? '' })
    } else if (spec.type === 'ImportSpecifier') {
      const imported =
        spec.imported?.type === 'Identifier' ? spec.imported.name : (spec.imported?.value ?? '')
      specifiers.push({ imported, local: spec.local?.name ?? '' })
    }
  }

  return { source, specifiers, isDefault, isNamespace }
}

export function importsName(imports: ImportInfo[], name: string, fromPackage?: string): boolean {
  return imports.some(
    (imp) =>
      (!fromPackage || imp.source === fromPackage) &&
      imp.specifiers.some((s) => s.imported === name),
  )
}

export function getLocalName(
  imports: ImportInfo[],
  name: string,
  fromPackage?: string,
): string | null {
  for (const imp of imports) {
    if (fromPackage && imp.source !== fromPackage) continue
    for (const s of imp.specifiers) {
      if (s.imported === name) return s.local
    }
  }
  return null
}
