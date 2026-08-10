/**
 * Classify the files a scan could not LOAD.
 *
 * ── Why "fix the import" is sometimes wrong advice ────────────────────────
 *
 * Every scan of a `@pyreon/zero` app prints this:
 *
 *     atlas: 2 file(s) could not be LOADED …
 *       2× Cannot find module 'virtual:zero/routes'
 *          · src/entry-client.ts
 *       These threw on import — fix the import and re-run.
 *
 * There is nothing to fix. `virtual:zero/routes` is a module SYNTHESISED by
 * zero's Vite plugin; the import is correct, and it is unresolvable here only
 * because Atlas's loader does not run that plugin. Sending a reader to repair a
 * correct import is worse than saying nothing — it costs them a search that
 * ends in confusion, every single scan, forever.
 *
 * A genuinely broken import is a different finding with a different fix, and it
 * is the one worth being loud about. So they are separated, and each is told
 * what it actually means.
 *
 * `virtual:` (Vite) and `\0` (Rollup) are the two documented conventions for a
 * plugin-provided module id, which is what makes this a rule rather than a
 * guess about particular filenames.
 */

/** What kind of load failure this is. */
export type LoadErrorKind =
  /** A module a build plugin synthesises. Atlas does not run that plugin. */
  | 'plugin-virtual'
  /** An import that does not resolve. Actionable. */
  | 'broken-import'

export interface LoadError {
  file: string
  message: string
}

export interface ClassifiedLoadErrors {
  kind: LoadErrorKind
  message: string
  /** The unresolvable specifier, when the message names one. */
  specifier?: string
  files: readonly string[]
}

/**
 * The module specifier a loader error is about.
 *
 * Vite and Node word this differently (`Failed to load url X (resolved id: X)`
 * vs `Cannot find module 'X'`), and the specifier is the only part that lets
 * the two be classified by the same rule.
 */
export function specifierFrom(message: string): string | undefined {
  // Ordered most-specific first: Vite's phrasing contains a bare url that the
  // quoted pattern would miss, and Node's is quoted.
  const quoted = /(?:Cannot find (?:module|package)|Failed to resolve import)\s+['"]([^'"]+)['"]/.exec(
    message,
  )
  if (quoted?.[1]) return quoted[1]
  const url = /Failed to load url\s+(\S+)/.exec(message)
  if (url?.[1]) return url[1]
  return undefined
}

/** Is this id one a build plugin would have supplied? */
export function isPluginVirtual(specifier: string | undefined): boolean {
  if (!specifier) return false
  // `\0` is Rollup's convention for an id no plugin but its owner should touch;
  // `virtual:` is Vite's. Both mean "synthesised", never "on disk".
  return specifier.startsWith('virtual:') || specifier.startsWith('\0')
}

/**
 * Group load errors by message, and say which kind each is.
 *
 * Grouped by MESSAGE because one broken import upstream throws the identical
 * error in every file that reaches it: the distinct causes are the finding and
 * the file count is how bad it is. Ordered with the actionable kind FIRST, and
 * by file count within each kind, so the loudest real problem leads.
 */
export function classifyLoadErrors(errors: readonly LoadError[]): ClassifiedLoadErrors[] {
  const byMessage = new Map<string, string[]>()
  for (const e of errors) {
    byMessage.set(e.message, [...(byMessage.get(e.message) ?? []), e.file])
  }
  return [...byMessage.entries()]
    .map(([message, files]) => {
      const specifier = specifierFrom(message)
      const kind: LoadErrorKind = isPluginVirtual(specifier) ? 'plugin-virtual' : 'broken-import'
      return { kind, message, files, ...(specifier ? { specifier } : {}) }
    })
    .sort(
      (a, b) =>
        Number(a.kind === 'plugin-virtual') - Number(b.kind === 'plugin-virtual') ||
        b.files.length - a.files.length ||
        a.message.localeCompare(b.message),
    )
}

/** Lines for the errors a reader can actually fix. */
export function formatBrokenImports(groups: readonly ClassifiedLoadErrors[]): string[] {
  const broken = groups.filter((g) => g.kind === 'broken-import')
  if (broken.length === 0) return []
  const total = broken.reduce((n, g) => n + g.files.length, 0)
  return [
    `atlas: ${total} file(s) could not be LOADED, so any component in them is missing from this catalog:`,
    ...broken.map((g) => `  ${g.files.length}× ${g.message}\n     · ${g.files[0]}`),
    '  These threw on import — fix the import and re-run; a `theme` in your config cannot help.',
  ]
}

/**
 * Lines for the modules a build plugin owns.
 *
 * Deliberately NOT silent, and deliberately not an error. The honest statement
 * has two halves and needs both: a component in one of these files really is
 * absent from the catalog, AND the import is not broken — so the reader should
 * not go looking for a bug in it. Claiming "nothing is missing" would be the
 * easier sentence and would not be true: a file CAN both import a virtual
 * module and export a component.
 */
export function formatPluginVirtuals(groups: readonly ClassifiedLoadErrors[]): string[] {
  const virtuals = groups.filter((g) => g.kind === 'plugin-virtual')
  if (virtuals.length === 0) return []
  const total = virtuals.reduce((n, g) => n + g.files.length, 0)
  const ids = [...new Set(virtuals.map((g) => g.specifier).filter(Boolean))]
  return [
    `atlas: ${total} file(s) import a module supplied by a build plugin Atlas does not run ` +
      `(${ids.join(', ')}) — typically app entry points.`,
    '  Nothing to fix: the import is correct. Atlas cannot load these files, so a component',
    '  defined in one of them would be absent — move it to its own file if you want it catalogued.',
  ]
}
