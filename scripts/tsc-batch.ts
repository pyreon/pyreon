/**
 * An in-process TypeScript batch typechecker for the doc/manifest gates.
 *
 * ## Why this exists
 *
 * `check-manifest-examples` synthesizes ~770 snippet files and typechecks them
 * against every `@pyreon/*` package's `src/`. It did that by spawning
 * `bunx tsc` — once to probe exports, then again per round of its
 * syntax-exclusion loop. Measured on this repo that is FOUR runs, and each one
 * builds a complete TypeScript program from scratch: 3,191 source files parsed,
 * bound and checked, four times over, for a gate whose entire output is derived
 * from the ~770 snippet files.
 *
 * That made one gate 74% of the warm `validate-fast` wall — the command the
 * pre-push hook runs on every push. A gate people wait on is a gate people
 * start bypassing.
 *
 * ## What it changes
 *
 * Two things, both of which the CLI structurally cannot do:
 *
 *   1. **The workspace is parsed once.** The compiler host caches `SourceFile`s
 *      by path, and each program is created with the previous one as
 *      `oldProgram`, so rounds after the first re-parse NOTHING. Measured: 3,191
 *      files parsed on round 0, then 0, then 0.
 *   2. **Only the files we classify are checked.** The callers discard every
 *      diagnostic that is not in a synthesized file, but the CLI still computes
 *      the whole program's. Asking for per-file diagnostics computes the same
 *      answers for the files that matter and skips the rest.
 *
 * Measured CPU (the honest metric here — this machine's wall-clock swings by
 * 6x under parallel-worktree load), same 3 rounds, same inputs:
 *
 *     whole-program diagnostics   15.52s + 5.79s + 5.32s = 26.6s
 *     scoped to synthesized files  7.61s + 1.89s + 1.20s = 10.7s
 *
 * against ~25.8s for the three `bunx tsc` spawns it replaces.
 *
 * ## Why scoping cannot change a verdict
 *
 * A semantic diagnostic belongs to exactly one file — `getSemanticDiagnostics(f)`
 * returns the errors located IN `f`, computed against the whole program. So for
 * any file the caller classifies, the scoped answer and the whole-program answer
 * are the same set. The difference is only which files we bother to ask about.
 *
 * The one behavioural edge is the CLI's exit code, which meant "no errors
 * ANYWHERE, workspace included". Callers used it only as a shortcut to "no
 * errors in my files" — and when the workspace has an error but the snippets do
 * not, the old code fell through to parsing stdout, found no matching lines, and
 * reached the same conclusion. `errorCount` here reports the scoped count, which
 * is what both paths actually acted on.
 */
import * as ts from 'typescript'

/** One diagnostic, flattened to what the gates classify on. */
export interface BatchDiagnostic {
  /** Basename, matching the `ex-0001.tsx` / `p-0001.ts` form gates key on. */
  file: string
  code: number
  /** `(line,col)`, 1-based — the shape tsc prints, kept for message parity. */
  loc: string
  message: string
}

export interface BatchResult {
  diagnostics: BatchDiagnostic[]
  /** Diagnostics found in the scoped files. Zero means those files are clean. */
  errorCount: number
}

export interface TscBatchOptions {
  /** Directory holding the synthesized files and their `tsconfig.json`. */
  dir: string
  /** Compiler options, already resolved (see `resolveOptions`). */
  options: ts.CompilerOptions
}

/**
 * Resolve a `tsconfig.json`-shaped object into compiler options.
 *
 * Goes through `parseJsonConfigFileContent` rather than a hand-rolled cast so
 * string enums (`"module": "ESNext"`) become the numeric flags the API wants —
 * silently wrong options here would change what the gate reports, not just how
 * fast it reports it.
 */
export function resolveOptions(configObject: unknown, dir: string): ts.CompilerOptions {
  const parsed = ts.parseJsonConfigFileContent(configObject, ts.sys, dir)
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!
    throw new Error(
      `[tsc-batch] invalid compiler options: ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`,
    )
  }
  return parsed.options
}

/**
 * A reusable program factory over one set of compiler options.
 *
 * Hold ONE of these for the lifetime of a gate and call `check()` per round.
 * The saving is entirely in the sharing: a fresh instance per round would
 * re-parse the workspace every time, which is the behaviour being replaced.
 */
export class TscBatch {
  readonly #host: ts.CompilerHost
  readonly #options: ts.CompilerOptions
  readonly #cache = new Map<string, ts.SourceFile | undefined>()
  #previous: ts.Program | undefined
  /** Files parsed from disk, for tests that assert reuse actually happens. */
  #parsed = 0

  constructor(opts: TscBatchOptions) {
    this.#options = opts.options
    const host = ts.createCompilerHost(opts.options, /* setParentNodes */ true)
    const readThrough = host.getSourceFile.bind(host)
    // The cache is what makes `oldProgram` reuse possible: TypeScript can only
    // carry a file forward when the host hands back an identical SourceFile.
    // Nothing on disk changes inside one gate run, so caching unconditionally
    // is sound — and a `has` check rather than a truthiness check keeps a
    // legitimately-missing file (undefined) from being re-read every round.
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
      if (this.#cache.has(fileName)) return this.#cache.get(fileName)
      this.#parsed++
      const file = readThrough(fileName, languageVersion, onError, shouldCreate)
      this.#cache.set(fileName, file)
      return file
    }
    this.#host = host
  }

  /** How many files have been read from disk so far. Reuse should hold this flat. */
  get filesParsed(): number {
    return this.#parsed
  }

  /**
   * Typecheck `rootNames`, reporting diagnostics only for files `scope` accepts.
   *
   * `scope` is not a filter over a computed list — it decides which files get
   * checked at all, which is where the time goes.
   */
  check(rootNames: readonly string[], scope: (fileName: string) => boolean): BatchResult {
    // `oldProgram` is spread in only when present: the repo runs
    // `exactOptionalPropertyTypes`, so an explicit `undefined` is not the same
    // as an absent key and does not typecheck.
    const program = ts.createProgram({
      rootNames: [...rootNames],
      options: this.#options,
      host: this.#host,
      ...(this.#previous ? { oldProgram: this.#previous } : {}),
    })
    // Held for the next round's reuse. This keeps the previous program alive
    // for the gate's lifetime, which is the point — these are short-lived
    // one-shot processes, and the alternative is re-parsing 3,191 files.
    this.#previous = program

    const diagnostics: BatchDiagnostic[] = []
    for (const file of program.getSourceFiles()) {
      if (!scope(file.fileName)) continue
      // Syntactic first, mirroring tsc: a file that does not parse produces
      // meaningless semantic output, and the gates classify the two together.
      for (const d of program.getSyntacticDiagnostics(file)) diagnostics.push(flatten(d))
      for (const d of program.getSemanticDiagnostics(file)) diagnostics.push(flatten(d))
    }
    return { diagnostics, errorCount: diagnostics.length }
  }
}

/** A diagnostic in the `{ file, code, loc, message }` shape gates classify on. */
function flatten(d: ts.Diagnostic): BatchDiagnostic {
  const fileName = d.file?.fileName ?? ''
  const base = fileName.slice(fileName.lastIndexOf('/') + 1)
  let loc = ''
  if (d.file && typeof d.start === 'number') {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start)
    loc = `(${line + 1},${character + 1})`
  }
  return {
    file: base,
    code: d.code,
    loc,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }
}
