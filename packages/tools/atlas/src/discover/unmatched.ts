/**
 * Files that LOOK like components and produced none.
 *
 * ── The failure this exists to end ────────────────────────────────────────
 *
 * A component the scanner does not recognise is not an error. It is an
 * ABSENCE — the file is read, nothing is extracted, and the catalog is quietly
 * one component smaller. Nothing in the output distinguishes "you have 12
 * components" from "you have 14 components and I found 12".
 *
 * That is the worst failure mode a discovery tool has, and it is the one Atlas
 * exists to prevent everywhere else: a scenario that was never checked says
 * `unverified` rather than `pass`; a bare name matching two components refuses
 * rather than guessing. Discovery was the remaining place where the tool was
 * silent about what it did not do.
 *
 * ── The signal ────────────────────────────────────────────────────────────
 *
 * A file with a PascalCase export that yielded no component. That is a cheap,
 * high-signal heuristic: it is exactly the shape of every gap the scanner
 * actually has (a `styled()` call, a class, a re-export, a member-call
 * wrapper), and it does not fire on the ordinary case of a file full of
 * helpers, hooks and types.
 *
 * Reported, never fatal. A design system legitimately exports PascalCase things
 * that are not components — a `ThemeProvider`, a `Schema`, an enum-like const —
 * so this is a list to look at, not a gate to fail.
 */
import ts from 'typescript'

/** One file that looked like it held a component and yielded none. */
export interface UnmatchedFile {
  /** Path, as recorded on components (relative to the scan root). */
  file: string
  /** The PascalCase exports that were seen but not catalogued. */
  exports: readonly string[]
  /** A guess at WHY, when the shape is one of the known gaps. */
  reason?: string
}

const isPascal = (name: string): boolean => /^[A-Z]/.test(name)

/**
 * Recognise the shapes that are known not to be catalogued, so the report can
 * say more than "not found".
 *
 * Each of these is a real, documented gap rather than a mystery — naming it
 * turns the report from "something is wrong" into "this is why, and here is
 * what to do".
 */
function diagnose(initializer: ts.Expression | undefined): string | undefined {
  if (!initializer) return undefined
  if (ts.isCallExpression(initializer)) {
    const callee = initializer.expression
    if (ts.isIdentifier(callee) && callee.text === 'styled') {
      return 'a `styled()` component declares no props a static reader can see — it needs runtime discovery, which today covers only rocketstyle'
    }
    if (ts.isPropertyAccessExpression(callee)) {
      return 'a chained/member call — rocketstyle chains are found by the runtime pass (needs `theme` in your config); other member-call wrappers are not unwrapped'
    }
    return 'a call expression with no inline component function — the props are not written anywhere this scan can read them'
  }
  return undefined
}

/**
 * Scan one file for PascalCase exports.
 *
 * Deliberately a second, much simpler pass than `scanSource`: its job is to
 * answer "did this file OFFER something?", not "what is it?". Reusing the real
 * extractor would make the report blind to exactly the shapes it exists to
 * surface — it would agree there is nothing here, which is the bug.
 */
export function pascalExports(code: string, fileName: string): { name: string; reason?: string }[] {
  const kind = fileName.endsWith('.tsx') || fileName.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS
  let sf: ts.SourceFile
  try {
    sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, kind)
  } catch {
    return [] // unparseable — a different problem, and not this report's to make
  }

  const out: { name: string; reason?: string }[] = []
  const exported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && exported(node) && node.name && isPascal(node.name.text)) {
      out.push({ name: node.name.text })
      return
    }
    if (ts.isClassDeclaration(node) && exported(node) && node.name && isPascal(node.name.text)) {
      out.push({
        name: node.name.text,
        reason: 'a class component — Pyreon components are functions, so classes are not catalogued',
      })
      return
    }
    if (ts.isVariableStatement(node) && exported(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !isPascal(decl.name.text)) continue
        const reason = diagnose(decl.initializer)
        out.push({ name: decl.name.text, ...(reason ? { reason } : {}) })
      }
      return
    }
    // `export { Button } from './button'` — a re-export the scanner does not follow.
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        if (!isPascal(element.name.text)) continue
        out.push({
          name: element.name.text,
          reason: 'a re-export — the scan reads declarations, not re-export chains; it will find the original where it is declared',
        })
      }
    }
  })
  return out
}

export interface UnmatchedOptions {
  /** Reads a file's source. Injected so the report is testable without a disk. */
  readSource: (file: string) => string
}

/**
 * Which scanned files offered a PascalCase export and produced no component.
 *
 * `found` is the set of source paths that DID yield components, so this is a
 * difference rather than a re-scan: every file discovery looked at, minus the
 * ones it succeeded on.
 */
export function findUnmatched(
  files: readonly string[],
  found: ReadonlySet<string>,
  options: UnmatchedOptions,
): UnmatchedFile[] {
  const out: UnmatchedFile[] = []
  for (const file of files) {
    if (found.has(file)) continue
    let code: string
    try {
      code = options.readSource(file)
    } catch {
      continue
    }
    const candidates = pascalExports(code, file)
    if (candidates.length === 0) continue
    const reason = candidates.find((c) => c.reason)?.reason
    out.push({
      file,
      exports: candidates.map((c) => c.name),
      ...(reason ? { reason } : {}),
    })
  }
  return out
}

/**
 * The report, as lines.
 *
 * Written as guidance rather than a warning list: every entry here may be
 * perfectly fine (a provider, a schema, a const), so the framing is "look at
 * these" and the reasons carry the actionable part.
 */
export function formatUnmatched(unmatched: readonly UnmatchedFile[]): string[] {
  if (unmatched.length === 0) return []
  const lines = [
    `atlas: ${unmatched.length} file(s) export something PascalCase that produced no component:`,
  ]
  for (const entry of unmatched) {
    lines.push(`  · ${entry.file} — ${entry.exports.join(', ')}`)
    if (entry.reason) lines.push(`    ${entry.reason}`)
  }
  lines.push(
    '  Not necessarily wrong — a provider, a schema or a const belongs here too.',
    '  But a component you expected in the catalog would show up in this list.',
  )
  return lines
}
