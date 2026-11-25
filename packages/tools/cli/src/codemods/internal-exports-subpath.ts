/* oxlint-disable complexity -- one pass over import/export declarations; each branch is a syntax shape the rewrite must preserve */
import { loadTs } from './load-ts'
import type { Codemod } from './types'

/** One entry point's moved names: each name in `names` left `from` for `to`. */
export interface ExportMove {
  from: string
  to: string
  names: readonly string[]
}

/**
 * Every export the 1.0 API freeze moved off a public entry (0.55.0). `_`
 * helpers that are not compiler ABI went to each package's `./internal`
 * (`./internal-server` for the Node-only ones of zero and zero-content), and
 * the compat-layer plumbing of `@pyreon/core` went to `@pyreon/core/compat`.
 * (The `@pyreon/ambient/testing` hooks renamed in the same release are a clean
 * break: imports of `_resetClockState` / `_resetLocaleState` must be renamed
 * by hand.)
 */
export const EXPORT_MOVES: readonly ExportMove[] = [
  {
    from: '@pyreon/core',
    to: '@pyreon/core/internal',
    names: [
      '_IslandIds',
      '_childText',
      '_copyProp',
      '_devMarkOwnerAlias',
      '_isStructuralChild',
      '_isVNodeLike',
      '_mergePropsExcept',
      '_mergePropsOmit',
      '_nextIslandIdPrefix',
      '_pickProps',
      '_requestIdFrame',
      '_resetAsyncWarning',
      '_resetIdCounter',
      '_runHooked',
      '_setSuspenseHydrating',
      '_takeHooks',
    ],
  },
  {
    from: '@pyreon/core',
    to: '@pyreon/core/compat',
    names: ['_compatProps', 'NATIVE_COMPAT_MARKER', 'isNativeCompat', 'mapCompatDomProps', 'shallowEqualProps'],
  },
  {
    from: '@pyreon/reactivity',
    to: '@pyreon/reactivity/internal',
    names: [
      '__resetReactiveDevtoolsForTesting',
      '_abortOwnerFrame',
      '_captureRun',
      '_claimContextOwner',
      '_closeOwnerFrame',
      '_currentScope',
      '_devOwner',
      '_enterCleanupFrame',
      '_exitCleanupFrame',
      '_frameReads',
      '_hasSubscribers',
      '_noopDispose',
      '_openOwnerFrame',
      '_rdCloseBindingFrame',
      '_rdDropBinding',
      '_rdLabelBinding',
      '_rdLabelDirect',
      '_rdLabelSubscribers',
      '_rdNodeId',
      '_rdNoteTarget',
      '_rdOpenBindingFrame',
      '_rdPreview',
      '_rdRegistrySize',
      '_rdScopeNodes',
      '_releaseRun',
      '_renderBind',
      '_replayReads',
      '_resetSentinel',
      '_resumeSoleSubscriber',
      '_resumeSubscriber',
      '_sampleReads',
      '_setRequestOwnerReader',
      '_suspendSoleSubscriber',
      '_suspendSubscriber',
      '_swapPendingOwner',
    ],
  },
  { from: '@pyreon/runtime-dom', to: '@pyreon/runtime-dom/internal', names: ['_declareRootDecoration'] },
  { from: '@pyreon/runtime-server', to: '@pyreon/runtime-server/internal', names: ['_setStreamFlushBytes'] },
  { from: '@pyreon/server', to: '@pyreon/server/internal', names: ['_resetServerIslands'] },
  { from: '@pyreon/form/devtools', to: '@pyreon/form/internal', names: ['_resetDevtools'] },
  { from: '@pyreon/zero', to: '@pyreon/zero/internal', names: ['_registerI18nConfig'] },
  {
    from: '@pyreon/zero/i18n-routing',
    to: '@pyreon/zero/internal',
    names: ['_registerI18nConfig', '_setLocaleStoreReader'],
  },
  { from: '@pyreon/zero/theme', to: '@pyreon/zero/internal', names: ['_resetInitThemeForTests'] },
  { from: '@pyreon/zero/rate-limit', to: '@pyreon/zero/internal', names: ['_resetRateLimitWarning'] },
  {
    from: '@pyreon/zero/actions',
    to: '@pyreon/zero/internal',
    names: [
      '_actionDeclaringRoute',
      '_actionStub',
      '_defineActionWithId',
      '_getAction',
      '_isKnownAction',
      '_registerActionModules',
      '_registerActionRoutes',
      '_resetActions',
      '_resetSubmissions',
      '_resolveAction',
      '_setActionSnapshotReader',
    ],
  },
  { from: '@pyreon/zero/server', to: '@pyreon/zero/internal-server', names: ['_resetVercelRevalidateHandlerCache'] },
  {
    from: '@pyreon/zero-content',
    to: '@pyreon/zero-content/internal',
    names: [
      '_exampleCount',
      '_exampleKeys',
      '_getRegistry',
      '_hasSharedSignal',
      '_listCollections',
      '_resetExampleRegistry',
      '_resetRegistryForTesting',
      '_resetSearchForTesting',
      '_setRegistry',
      '_sharedSignalCount',
    ],
  },
  {
    from: '@pyreon/zero-content/plugin',
    to: '@pyreon/zero-content/internal-server',
    names: ['_resetCompileCacheForTesting', '_setResolvedRootForPaths'],
  },
  { from: '@pyreon/primitives', to: '@pyreon/primitives/internal', names: ['_resetNativeModules'] },
  { from: '@pyreon/solid-compat', to: '@pyreon/solid-compat/internal', names: ['_STORE_SIGNAL_CACHE'] },
  {
    from: '@pyreon/vite-plugin',
    to: '@pyreon/vite-plugin/internal',
    names: [
      '_collectImportedNames',
      '_compatAliasTable',
      '_computeLineStarts',
      '_extractBalancedArgs',
      '_getCompatTarget',
      '_handleSsrRequest',
      '_isPyreonWorkspaceFile',
      '_isTruthyEnv',
      '_isUnaliasedFrameworkImport',
      '_maskComments',
      '_maskCommentsAndStrings',
      '_maskStringsAndComments',
      '_offsetToLineCol',
      '_reactiveCalleeStarts',
      '_requestUrlFromTarget',
      '_skipStringLiteral',
      '_unaliasedImportWarning',
    ],
  },
  { from: '@pyreon/lint', to: '@pyreon/lint/internal', names: ['_workerEntry'] },
  { from: '@pyreon/store', to: '@pyreon/store/internal', names: ['__clearStoreHydrationForTesting'] },
  { from: '@pyreon/store/devtools', to: '@pyreon/store/internal', names: ['_notifyChange'] },
  { from: '@pyreon/i18n/devtools', to: '@pyreon/i18n/internal', names: ['_resetDevtools'] },
  { from: '@pyreon/state-tree/devtools', to: '@pyreon/state-tree/internal', names: ['_resetDevtools'] },
  { from: '@pyreon/command', to: '@pyreon/command/internal', names: ['_resetDefaultCommands'] },
  { from: '@pyreon/http/server', to: '@pyreon/http/internal', names: ['_resetRequestSource'] },
  { from: '@pyreon/http/json', to: '@pyreon/http/internal', names: ['_setSourceTextSupport'] },
  {
    from: '@pyreon/storage',
    to: '@pyreon/storage/internal',
    names: ['_resetDBCache', '_resetRegistry', '_resetStorageListener'],
  },
  { from: '@pyreon/document', to: '@pyreon/document/internal', names: ['_resetRenderers'] },
  { from: '@pyreon/hotkeys', to: '@pyreon/hotkeys/internal', names: ['_resetHotkeys'] },
  { from: '@pyreon/toast', to: '@pyreon/toast/internal', names: ['_reset'] },
  { from: '@pyreon/ambient/testing', to: '@pyreon/ambient/internal', names: ['_fireAll', '_tickerStats'] },
]

/** `from` specifier → exported name → the specifier it moved to. */
function indexMoves(moves: readonly ExportMove[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()
  for (const m of moves) {
    let byName = out.get(m.from)
    if (byName === undefined) out.set(m.from, (byName = new Map()))
    for (const n of m.names) byName.set(n, m.to)
  }

  return out
}

/**
 * Build the codemod for a move table. Exported so the tests can drive the
 * rewrite logic with a small table of their own.
 */
export function createExportMoveCodemod(moves: readonly ExportMove[]): Codemod['transform'] {
  const index = indexMoves(moves)

  return (source, relPath) => {
    if (!source.includes('@pyreon/')) return null
    let candidate = false
    for (const from of index.keys()) {
      if (source.includes(`'${from}'`) || source.includes(`"${from}"`)) candidate = true
    }
    if (!candidate) return null

    const ts = loadTs('internal-exports-subpath')
    const kind = /\.[mc]?tsx$|\.jsx$/.test(relPath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sf = ts.createSourceFile(relPath, source, ts.ScriptTarget.ESNext, true, kind)
    const edits: { start: number; end: number; text: string }[] = []

    for (const st of sf.statements) {
      const isImport = ts.isImportDeclaration(st)
      if (!isImport && !ts.isExportDeclaration(st)) continue
      const spec = st.moduleSpecifier
      if (spec === undefined || !ts.isStringLiteral(spec)) continue
      const byName = index.get(spec.text)
      if (byName === undefined) continue

      let braces: import('typescript').NamedImports | import('typescript').NamedExports
      let hasDefault = false
      let declTypeOnly: boolean
      if (isImport) {
        const clause = st.importClause
        const nb = clause?.namedBindings
        if (clause === undefined || nb === undefined || !ts.isNamedImports(nb)) continue
        braces = nb
        hasDefault = clause.name !== undefined
        declTypeOnly = clause.isTypeOnly
      } else {
        const ec = st.exportClause
        if (ec === undefined || !ts.isNamedExports(ec)) continue
        braces = ec
        declTypeOnly = st.isTypeOnly
      }

      const stay: string[] = []
      const moved = new Map<string, string[]>()
      for (const el of braces.elements) {
        const to = byName.get((el.propertyName ?? el.name).text)
        if (to === undefined) {
          stay.push(el.getText(sf))
          continue
        }
        let list = moved.get(to)
        if (list === undefined) moved.set(to, (list = []))
        list.push(el.getText(sf))
      }
      if (moved.size === 0) continue

      const quote = source[spec.getStart(sf)] === '"' ? '"' : "'"
      const semi = st.getText(sf).trimEnd().endsWith(';') ? ';' : ''
      const keyword = isImport ? 'import' : 'export'
      const typeKw = declTypeOnly ? ' type' : ''
      // Keep the declaration's own layout: a multi-line `{ … }` list stays
      // multi-line, so the rewrite does not leave a formatter diff behind.
      const multiline = braces.getText(sf).includes('\n')
      const extra = [...moved].map(([to, names]) => {
        const list = multiline ? `{\n  ${names.join(',\n  ')},\n}` : `{ ${names.join(', ')} }`
        return `${keyword}${typeKw} ${list} from ${quote}${to}${quote}${semi}`
      })

      if (stay.length === 0 && !hasDefault) {
        // Nothing left on the old specifier: the new declaration(s) replace it.
        edits.push({ start: st.getStart(sf), end: st.getEnd(), text: extra.join('\n') })
      } else {
        const text =
          stay.length === 0 ? '' : multiline ? `{\n  ${stay.join(',\n  ')},\n}` : `{ ${stay.join(', ')} }`
        // A default import left on its own drops the `, { … }` entirely.
        const start = stay.length === 0 ? (st as import('typescript').ImportDeclaration).importClause!.name!.getEnd() : braces.getStart(sf)
        edits.push({ start, end: braces.getEnd(), text })
        edits.push({ start: st.getEnd(), end: st.getEnd(), text: `\n${extra.join('\n')}` })
      }
    }

    if (edits.length === 0) return null
    let out = source
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)

    return out
  }
}

/**
 * The 1.0 API freeze (0.55.0) moved every `_` export that is not compiler ABI
 * off the public entries, to each package's `./internal` subpath, and the
 * compat-layer plumbing of `@pyreon/core` to `@pyreon/core/compat`. This
 * rewrites the import and re-export specifiers that name a moved export; the
 * imported bindings keep their local names, so no other code changes.
 *
 * Only static `import { … } from` / `export { … } from` declarations are
 * touched. A namespace import (`import * as core from '@pyreon/core'`) that
 * reads a moved name, and a dynamic `import()`, are left alone: the type
 * checker reports them.
 */
export const internalExportsSubpath: Codemod = {
  id: 'internal-exports-subpath',
  package: '@pyreon/core',
  alsoMigrates: [
    ...new Set(EXPORT_MOVES.map((m) => m.from.split('/').slice(0, 2).join('/') as `@pyreon/${string}`)),
  ].filter((p) => p !== '@pyreon/core'),
  introducedIn: '0.55.0',
  description:
    'Move imports of the `_` internals and the compat plumbing that left the public entries to their new `./internal` / `@pyreon/core/compat` subpaths (same bindings).',
  matches: (p) => /\.[mc]?[jt]sx?$/.test(p),
  transform: createExportMoveCodemod(EXPORT_MOVES),
}
