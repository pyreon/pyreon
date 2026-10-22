// The last line of defence for a call to a Pyreon package function nothing lowered.
//
// Every lowering seam (`services`, `calls`, `functions`, `receivers`, the emitters' own arms) turns a call it claims into
// something else. A call NOBODY claims is re-emitted verbatim: `getSnapshot(model)` becomes a Swift / Kotlin call to a
// function that does not exist, and the native build fails with "cannot find 'getSnapshot' in scope" and no warning from
// this compiler. Found by compiling every package's documented `api[].example` (inside a component, with its imports)
// through the real compiler: 38 of 121 plain examples ended exactly there. The import-keyed warnings cover hooks
// (`use*`), the web-only packages and the modules with per-export advice; this covers a partial package's other exports.
//
// It reads the FINAL emitted text, not the emitter's call tail, on purpose. The tail is also reached while computing
// output that is later discarded (a plugin that dropped a declaration still has its expression visited), and a warning
// from there blamed calls that never reached the file. "Reproduced verbatim" is a statement about the output.

/** A function imported from a Pyreon package, by local name (see `collectAliasImports`). */
export type PyreonFunctionImports = ReadonlyMap<string, { readonly source: string; readonly imported: string }>

/** Strip string literals and comments so a name inside embedded HTML / JS text does not count as a call. */
function stripLiteralsAndComments(code: string): string {
  let out = ''
  let i = 0
  while (i < code.length) {
    const c = code[i]!
    const n = code[i + 1]
    if (c === '/' && n === '/') {
      while (i < code.length && code[i] !== '\n') i++
    } else if (c === '/' && n === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++
      i += 2
    } else if (c === '"' && code.startsWith('"""', i)) {
      i += 3
      while (i < code.length && !code.startsWith('"""', i)) i++
      i += 3
    } else if (c === '"') {
      i++
      while (i < code.length && code[i] !== '"') i += code[i] === '\\' ? 2 : 1
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

/**
 * Warnings for functions imported from a `@pyreon/*` package whose call survives in the emitted `code`, skipping any
 * name an earlier warning already mentions (a plugin's own diagnostic is more specific than this one).
 */
export function verbatimPyreonCallWarnings(
  imports: PyreonFunctionImports,
  source: string,
  code: string,
  existingWarnings: readonly string[],
): string[] {
  if (imports.size === 0) return []
  const body = stripLiteralsAndComments(code)
  const out: string[] = []
  const reported = new Set<string>()
  for (const [local, imp] of imports) {
    // Functions only: `collectAliasImports` also tracks JSX tags (`Row`), which the emitters lower into a native
    // composable of the same spelling — a `Row(` in the output is theirs, not a leftover call.
    if (!/^[a-z]/.test(imp.imported) || !imp.source.startsWith('@pyreon/') || reported.has(imp.imported)) continue
    // A call of the LOCAL name as written, not a member call (`x.getSnapshot(` is some other object's method) and not
    // a declaration of a function that happens to share the name.
    const call = new RegExp(`(?<![\\w.$])${local.replace(/\\$/g, '\\\\$')}\\s*\\(`)
    if (!call.test(body)) continue
    // The SOURCE must call it too. A preset or helper passed as a VALUE (`.preset(scaleIn)`) is consumed by its
    // package's lowering, and the emitted text can still contain the same spelling as a native API (Compose's own
    // `scaleIn(`), which is not the import surviving.
    if (!call.test(source)) continue
    if (new RegExp(`(?<![\\w$])${imp.imported}(?![\\w$])`).test(existingWarnings.join('\n'))) continue
    if (new RegExp(`\\b(?:func|fun)\\s+${local}\\b`).test(body)) continue
    reported.add(imp.imported)
    out.push(
      `${imp.imported}() (from ${imp.source}) has NO native lowering — the call is reproduced verbatim in the emitted ` +
        `Swift/Kotlin, where no such function exists, so the native build fails with "cannot find '${imp.imported}' in scope". ` +
        `Keep it behind a \`<Web>\` escape hatch (web target only), or replace it with an API that lowers (the package's ` +
        `\`multiplatform\` rationale and the lowering table in the docs say which).`,
    )
  }
  return out
}
