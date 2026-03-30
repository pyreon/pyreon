export {
  getJSXAttribute,
  getJSXTagName,
  getSpan,
  hasJSXAttribute,
  hasJSXChild,
  isArrayMapCall,
  isBrowserGlobal,
  isCallTo,
  isCallToAny,
  isDestructuring,
  isFunction,
  isInsideDevGuard,
  isInsideFunction,
  isInsideJSX,
  isInsideOnMount,
  isInsideTypeofGuard,
  isJSXElement,
  isLogicalAndWithJSX,
  isMemberCallTo,
  isPeekCall,
  isSetCall,
  isTernaryWithJSX,
} from "./ast"
export {
  BROWSER_GLOBALS,
  CONTEXT_APIS,
  extractImportInfo,
  getLocalName,
  HEAVY_PACKAGES,
  importsName,
  isPyreonImport,
  isPyreonPackage,
  JSX_COMPONENTS,
  LIFECYCLE_APIS,
  PYREON_PREFIX,
  REACTIVITY_APIS,
} from "./imports"
export { LineIndex } from "./source"

/** Supported JS/TS file extensions for linting. */
export const JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"])

/** Check if a file path has a supported JS/TS extension. */
export function hasJsExtension(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf("."))
  return JS_EXTENSIONS.has(ext)
}
