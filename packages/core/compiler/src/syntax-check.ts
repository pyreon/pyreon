/**
 * Syntax check for the static detectors' input.
 *
 * The detectors (`detectPyreonPatterns`, `detectReactPatterns`), the codemods
 * and the Reactivity Lens all parse with `ts.createSourceFile`, which RECOVERS
 * from syntax errors instead of failing: an unclosed `<div>`, stray tokens or a
 * paragraph of prose still yield a tree, just one with the broken region
 * missing or mangled. A detector walking that tree finds nothing and returns
 * `[]`, and every surface that turns "no findings" into a verdict (MCP
 * `validate`, `pyreon check`, the static section of `diagnose`) then reported
 * broken input as clean.
 *
 * `findSyntaxErrors` is the one place that answers "did this parse?", with the
 * same parser the detectors use, so every surface can refuse to give a clean
 * verdict for input it could not read.
 */
import ts from 'typescript'
import { assertClassicTs } from './ts'

export interface SourceSyntaxError {
  /** The parser's message, e.g. `';' expected.` */
  message: string
  /** 1-based line. */
  line: number
  /** 0-based column, the same convention as the detectors' diagnostics. */
  column: number
}

/**
 * The parse mode for a filename: `.ts`/`.mts`/`.cts` parse as TypeScript (no
 * JSX), `.jsx` as JSX, `.js`/`.mjs`/`.cjs` as JavaScript, everything else
 * (including no extension) as TSX, which is what a snippet usually is.
 */
function scriptKindFor(filename: string): ts.ScriptKind {
  const ext = /\.([cm]?[jt]sx?)$/i.exec(filename)?.[1]?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return ts.ScriptKind.TS
    case 'jsx':
      return ts.ScriptKind.JSX
    case 'js':
    case 'mjs':
    case 'cjs':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.TSX
  }
}

/**
 * Every syntax error the TypeScript parser reports for `code`, in source order.
 * Empty means the code parsed. Syntax only: type errors are not checked.
 *
 * Reads `SourceFile.parseDiagnostics`, the list `createSourceFile` fills while
 * recovering (it is what `program.getSyntacticDiagnostics` returns for a file,
 * without building a program). A test locks that it is populated.
 */
export function findSyntaxErrors(code: string, filename = 'input.tsx'): SourceSyntaxError[] {
  assertClassicTs()
  const sf = ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.ESNext,
    true,
    scriptKindFor(filename),
  )

  return syntaxErrorsIn(sf)
}

/**
 * The syntax errors of an already-parsed source file. A scanner that parsed a
 * file as TSX can call this first and only re-check with the file's own parse
 * mode (`findSyntaxErrors(code, path)`) when this is non-empty, so a clean file
 * costs no second parse.
 */
export function syntaxErrorsIn(sf: ts.SourceFile): SourceSyntaxError[] {
  const diagnostics =
    (sf as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] })
      .parseDiagnostics ?? []

  return [...diagnostics]
    .sort((a, b) => a.start - b.start)
    .map((d) => {
      const pos = sf.getLineAndCharacterOfPosition(d.start)
      return {
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        line: pos.line + 1,
        column: pos.character,
      }
    })
}
