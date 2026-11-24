/**
 * `@pyreon/vite-plugin/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds the plugin's `_`-prefixed helpers that the package's own tests (and
 * sibling Pyreon packages) exercise directly: the compat alias tables and
 * resolution checks, the truthy-env parser, the dev-server SSR request
 * handler, and the source-text scanners the transform passes use.
 */

export {
  _compatAliasTable,
  _getCompatTarget,
  _isPyreonWorkspaceFile,
  _isUnaliasedFrameworkImport,
  _unaliasedImportWarning,
} from './compat-aliases'
export { _handleSsrRequest, _requestUrlFromTarget } from './dev-ssr'
export { _isTruthyEnv } from './env'
export {
  _collectImportedNames,
  _computeLineStarts,
  _extractBalancedArgs,
  _maskComments,
  _maskCommentsAndStrings,
  _maskStringsAndComments,
  _offsetToLineCol,
  _reactiveCalleeStarts,
  _skipStringLiteral,
} from './source-scan'
