/**
 * Lowerability verification.
 *
 * The generator claims its native output compiles to Swift and Kotlin. This is
 * where that claim is MEASURED rather than asserted: every emitted native
 * module is run through `@pyreon/native-compiler`'s real `transform()`, on both
 * targets, and the result is checked.
 *
 * The check is deliberately POSITIVE. `warnings.length === 0` is not evidence —
 * a standalone hook function wrapping `useQuery` produces zero warnings and
 * emits Swift that references `useQuery`, a symbol that does not exist on the
 * target, so the native build fails later with `cannot find 'useQuery' in
 * scope`. Absence of a complaint is not presence of a lowering. So the verifier
 * asserts the MARKER — `PyreonQuery<` / `PyreonFetch<` / a generated schema
 * struct — and separately asserts that no un-lowered framework symbol survived
 * into the output.
 *
 * `@pyreon/native-compiler` is an OPTIONAL peer. A project without it gets a
 * SKIPPED verdict that says so, never a silent pass — a verification that
 * cannot run must not look like one that ran and succeeded.
 */

import type { GeneratedFile } from '../emit/writer'

/**
 * `partial` — the module lowers, but PMTC DROPPED part of it (a field it
 * cannot represent), so the native app decodes less than the web one. Named
 * rather than folded into `lowers` (audit G2): a Pet without its `category`
 * and `tags` is a different app, and the verdict has to say so.
 */
export type Verdict = 'lowers' | 'partial' | 'web-only' | 'broken' | 'skipped'

/** What one compiler warning means, decided by its CLASS rather than one phrase (audit G1). */
export type WarningClass = 'fatal' | 'unlowered' | 'dropped' | 'info'

/** One declaration's outcome, when a warning names it. */
export interface DeclarationVerdict {
  name: string
  verdict: Exclude<Verdict, 'skipped'>
  /** The warnings that decided it, verbatim. */
  reasons: string[]
}

export interface FileVerdict {
  path: string
  target: 'swift' | 'kotlin'
  verdict: Verdict
  /** Compiler warnings, verbatim. */
  warnings: string[]
  /** Positive markers found in the emitted native source. */
  markers: string[]
  /** Framework symbols that survived into the output un-lowered. */
  leaked: string[]
  /** Per-declaration outcomes (audit G2). Only declarations a warning names. */
  declarations: DeclarationVerdict[]
  /**
   * The emitted source run through the platform compiler, when it was
   * available: `ok`, the first errors, or why it did not run.
   */
  compiled?: { ok: boolean; errors: string[] } | { skipped: string } | undefined
}

export interface VerifyReport {
  ran: boolean
  /** Why, when `ran` is false. */
  reason?: string
  files: FileVerdict[]
}

/** Emitted-source markers that prove a real lowering happened. */
const MARKERS: readonly string[] = [
  'PyreonQuery<',
  'PyreonFetch<',
  'PyreonHttpRequest(',
  'PyreonZodSchema_',
  'PyreonSchemaError',
]

/**
 * Symbols that must NOT appear in emitted native source.
 *
 * Each is a web-only framework binding. Its presence means PMTC reproduced the
 * call verbatim instead of lowering it — which compiles here and fails at
 * `swiftc` / `kotlinc` time, far from the cause.
 */
const LEAKS: readonly string[] = [
  'useQuery(',
  'useMutation(',
  'createHttp(',
  's.object(',
  's.array(',
  'z.object(',
  'z.array(',
  'zodSchema(',
  'useFetch(',
]

/**
 * Warning classes, by what PMTC SAYS happened rather than by one magic phrase.
 *
 * The verifier used to treat only `does NOT compile` as fatal. PMTC reports a
 * verbatim reproduction as "reproduced VERBATIM — the native build then fails
 * on a symbol", and that is exactly as fatal; it was read as advisory, and a
 * module that could not compile reported `lowers` (audit G1).
 */
const WARNING_CLASSES: readonly [WarningClass, RegExp][] = [
  ['fatal', /does NOT compile|reproduced VERBATIM|fails on a symbol|cannot find|unresolved reference|will not (?:build|link)/i],
  ['unlowered', /no recognized fields|silent-drop|stays web|call stays web|cannot be lowered|not lowered|is OMITTED/i],
  ['dropped', /\bdropping\b|dropping field|\bdropped\b/i],
]

/**
 * Classify one PMTC warning.
 *
 * @example
 * ```ts
 * classifyWarning('null declaration `Pet`: field `tags` … Dropping field.') // 'dropped'
 * ```
 */
export function classifyWarning(warning: string): WarningClass {
  for (const [cls, re] of WARNING_CLASSES) if (re.test(warning)) return cls
  return 'info'
}

/** The declaration a PMTC warning is about, when it names one. */
function declarationOf(warning: string): string | undefined {
  return (
    /declaration `([^`]+)`/i.exec(warning)?.[1] ??
    /\bDeclaration ([A-Za-z_$][\w$]*)/.exec(warning)?.[1] ??
    /\bendpoint ([A-Za-z_$][\w$]*)/.exec(warning)?.[1]
  )
}

const CLASS_VERDICT: Record<Exclude<WarningClass, 'info'>, Exclude<Verdict, 'skipped' | 'lowers'>> = {
  fatal: 'broken',
  unlowered: 'web-only',
  dropped: 'partial',
}

const RANK: Record<Verdict, number> = { skipped: 0, lowers: 1, partial: 2, 'web-only': 3, broken: 4 }

function worse(a: Verdict, b: Verdict): Verdict {
  return RANK[b] > RANK[a] ? b : a
}

type TransformFn = (source: string, options: { target: 'swift' | 'kotlin' }) => {
  code: string
  warnings: string[]
}

/** A platform compile of emitted native source — `@pyreon/native-compiler`'s validators. */
export type CompileFn = (code: string) => { ok: boolean; skipped?: boolean; skipReason?: string; error?: string }

export interface NativeCompilers {
  swift?: CompileFn | undefined
  kotlin?: CompileFn | undefined
}

/**
 * Verify native modules.
 *
 * `transform` is injected so the verifier is unit-testable without the native
 * compiler installed, and so the CLI can resolve the PROJECT'S copy rather than
 * one bundled here — the version that will actually build the app is the only
 * one whose verdict means anything. `compile`, when given, runs the emitted
 * source through `swiftc` / `kotlinc`: a compile error is the strongest
 * evidence there is, and it outranks every heuristic below.
 */
export function verifyNative(
  files: GeneratedFile[],
  transform: TransformFn | undefined,
  compile?: NativeCompilers,
): VerifyReport {
  const native = files.filter((f) => f.path.endsWith('.native.tsx'))
  if (native.length === 0) {
    return { ran: false, reason: 'no native modules were generated (target is `web`)', files: [] }
  }
  if (!transform) {
    return {
      ran: false,
      reason:
        '@pyreon/native-compiler is not installed — lowerability was NOT checked. Install it to verify, or generate with `--target web`.',
      files: [],
    }
  }

  const out: FileVerdict[] = []
  for (const file of native) {
    for (const target of ['swift', 'kotlin'] as const) {
      let code = ''
      let warnings: string[] = []
      try {
        const r = transform(file.contents, { target })
        code = r.code
        warnings = r.warnings
      } catch (err) {
        out.push({
          path: file.path,
          target,
          verdict: 'broken',
          warnings: [`transform threw: ${(err as Error).message}`],
          markers: [],
          leaked: [],
          declarations: [],
        })
        continue
      }
      const markers = MARKERS.filter((m) => code.includes(m))
      const leaked = LEAKS.filter((l) => code.includes(l))
      const declarations = declarationVerdicts(warnings)
      const compiled = runCompile(compile?.[target], code)
      let verdict = decide(markers, leaked, warnings, file.contents)
      for (const d of declarations) verdict = worse(verdict, d.verdict)
      if (compiled && 'ok' in compiled && !compiled.ok) verdict = 'broken'
      out.push({ path: file.path, target, verdict, warnings, markers, leaked, declarations, compiled })
    }
  }
  return { ran: true, files: out }
}

function runCompile(fn: CompileFn | undefined, code: string): FileVerdict['compiled'] {
  if (!fn) return undefined
  try {
    const r = fn(code)
    if (r.skipped) return { skipped: r.skipReason ?? 'compiler not available' }
    const errors = (r.error ?? '')
      .split('\n')
      .filter((l) => /\berror:/.test(l))
      .map((l) => l.replace(/^.*?\berror:\s*/, '').trim())
      .filter((l, i, all) => l.length > 0 && all.indexOf(l) === i)
    return { ok: r.ok, errors: r.ok ? [] : errors.slice(0, 5) }
  } catch (err) {
    return { skipped: `compile threw: ${(err as Error).message}` }
  }
}

/** Group warnings by the declaration they name; each takes its worst class. */
function declarationVerdicts(warnings: readonly string[]): DeclarationVerdict[] {
  const byName = new Map<string, DeclarationVerdict>()
  for (const w of warnings) {
    const cls = classifyWarning(w)
    if (cls === 'info') continue
    const name = declarationOf(w) ?? '(module)'
    const entry = byName.get(name) ?? { name, verdict: 'lowers' as const, reasons: [] }
    entry.verdict = worse(entry.verdict, CLASS_VERDICT[cls]) as DeclarationVerdict['verdict']
    entry.reasons.push(w)
    byName.set(name, entry)
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * Reduce one transform to a verdict.
 *
 * Deliberately per-CONCERN rather than "any marker wins". A module whose
 * schemas lowered but whose query did not would otherwise report `lowers`
 * while shipping a native build that cannot decode a response — the schema
 * marker is real, and it is answering a different question.
 *
 * Warning CLASSES are folded in by the caller, per declaration, identically
 * for both targets — so the same warnings yield the same verdict on Swift and
 * Kotlin (audit G4) unless a real compile says otherwise.
 */
function decide(markers: string[], leaked: string[], warnings: string[], source: string): Verdict {
  // A leak outranks everything: the emitted source references a symbol the
  // target does not have, so the native build cannot link.
  if (leaked.length > 0) return 'broken'
  // Expectations are read off the SOURCE, so a file that never asked for a
  // query is not penalised for lacking a query marker.
  const wantsSchema = /\b[sz]\.object\(/.test(source)
  const wantsQuery = source.includes('useQuery')
  if (wantsSchema && !markers.some((m) => m.startsWith('PyreonZodSchema_'))) return 'web-only'
  if (wantsQuery && !markers.some((m) => m === 'PyreonQuery<')) return 'web-only'
  if (markers.length === 0) return warnings.length > 0 ? 'web-only' : 'broken'
  return 'lowers'
}

/** Reduce per-file verdicts to a single exit-worthy answer. */
export function worstVerdict(report: VerifyReport): Verdict {
  if (!report.ran) return 'skipped'
  if (report.files.length === 0) return 'skipped'
  return report.files.reduce<Verdict>((acc, f) => worse(acc, f.verdict), 'lowers')
}

/**
 * Resolve the project's own `@pyreon/native-compiler`.
 *
 * Resolved, never fetched — the same rule `pyreon doctor`'s dependency-fabric
 * gate follows. A verdict from a different version of the compiler than the one
 * that will build the app is worse than no verdict.
 */
export async function resolveTransform(): Promise<TransformFn | undefined> {
  return (await resolveNativeCompiler()).transform
}

/**
 * The project's `@pyreon/native-compiler`: its `transform`, and its platform
 * validators when the installed version exports them. The validators SKIP
 * themselves when `swiftc` / `kotlinc` is absent, so this never fails a run
 * on a machine without a toolchain — it reports that the compile did not run.
 *
 * @example
 * ```ts
 * const { transform, compile } = await resolveNativeCompiler()
 * const report = verifyNative(files, transform, compile)
 * ```
 */
export async function resolveNativeCompiler(): Promise<{
  transform: TransformFn | undefined
  compile: NativeCompilers
}> {
  try {
    const mod = (await import('@pyreon/native-compiler')) as {
      transform?: TransformFn
      validateSwiftWithStubs?: CompileFn
      validateKotlin?: CompileFn
    }
    return {
      transform: typeof mod.transform === 'function' ? mod.transform : undefined,
      compile: {
        swift: typeof mod.validateSwiftWithStubs === 'function' ? mod.validateSwiftWithStubs : undefined,
        kotlin: typeof mod.validateKotlin === 'function' ? mod.validateKotlin : undefined,
      },
    }
  } catch {
    return { transform: undefined, compile: {} }
  }
}
