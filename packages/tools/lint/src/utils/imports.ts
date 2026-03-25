import type { ImportInfo } from "../types"

/** Pyreon package prefixes we recognize */
const PYREON_PREFIX = "@pyreon/"

/** Known Pyreon reactivity APIs */
export const REACTIVITY_APIS = new Set([
  "signal",
  "computed",
  "effect",
  "batch",
  "untrack",
  "onCleanup",
  "createSelector",
  "createStore",
])

/** Known Pyreon lifecycle APIs */
export const LIFECYCLE_APIS = new Set(["onMount", "onUnmount"])

/** Known Pyreon context APIs */
export const CONTEXT_APIS = new Set(["provide", "createContext", "useContext"])

/** Known Pyreon JSX components */
export const JSX_COMPONENTS = new Set([
  "For",
  "Show",
  "Switch",
  "Match",
  "Dynamic",
  "ErrorBoundary",
  "Suspense",
  "Portal",
])

/** Known heavy packages that should be lazy-loaded */
export const HEAVY_PACKAGES = new Set([
  "@pyreon/charts",
  "@pyreon/code",
  "@pyreon/document",
  "@pyreon/flow",
])

/** Browser-only globals that are unsafe in SSR */
export const BROWSER_GLOBALS = new Set([
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "location",
  "history",
  "performance",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "IntersectionObserver",
  "ResizeObserver",
  "MutationObserver",
  "matchMedia",
  "getComputedStyle",
  "XMLHttpRequest",
  "fetch",
  "WebSocket",
  "EventSource",
  "Audio",
  "Image",
  "HTMLElement",
  "customElements",
])

/** Check if an import source is a Pyreon package */
export function isPyreonImport(source: string): boolean {
  return source.startsWith(PYREON_PREFIX)
}

/** Check if an import source is a specific Pyreon package */
export function isPyreonPackage(source: string, pkg: string): boolean {
  return source === `${PYREON_PREFIX}${pkg}` || source.startsWith(`${PYREON_PREFIX}${pkg}/`)
}

/**
 * Extract import information from an ImportDeclaration node.
 * Works with ESTree AST from oxc-parser.
 */
export function extractImportInfo(node: any): ImportInfo {
  const source = node.source?.value ?? ""
  const specifiers: ImportInfo["specifiers"] = []
  let hasDefault = false
  let hasNamespace = false

  for (const spec of node.specifiers ?? []) {
    if (spec.type === "ImportDefaultSpecifier") {
      hasDefault = true
      specifiers.push({ imported: "default", local: spec.local.name })
    } else if (spec.type === "ImportNamespaceSpecifier") {
      hasNamespace = true
      specifiers.push({ imported: "*", local: spec.local.name })
    } else if (spec.type === "ImportSpecifier") {
      const imported = spec.imported?.name ?? spec.imported?.value ?? spec.local.name
      specifiers.push({ imported, local: spec.local.name })
    }
  }

  return { source, specifiers, hasDefault, hasNamespace }
}

/** Check if any specifier imports a specific name from a source */
export function importsName(imports: ImportInfo[], source: string, name: string): boolean {
  return imports.some((i) => i.source === source && i.specifiers.some((s) => s.imported === name))
}

/** Get the local name for an imported symbol */
export function getLocalName(imports: ImportInfo[], source: string, name: string): string | undefined {
  for (const imp of imports) {
    if (imp.source === source) {
      const spec = imp.specifiers.find((s) => s.imported === name)
      if (spec) return spec.local
    }
  }
  return undefined
}
