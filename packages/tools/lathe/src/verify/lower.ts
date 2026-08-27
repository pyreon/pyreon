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

export type Verdict = 'lowers' | 'web-only' | 'broken' | 'skipped'

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
const LEAKS: readonly string[] = ['useQuery(', 'useMutation(', 'createHttp(', 's.object(', 'useFetch(']

type TransformFn = (source: string, options: { target: 'swift' | 'kotlin' }) => {
  code: string
  warnings: string[]
}

/**
 * Verify native modules.
 *
 * `transform` is injected so the verifier is unit-testable without the native
 * compiler installed, and so the CLI can resolve the PROJECT'S copy rather than
 * one bundled here — the version that will actually build the app is the only
 * one whose verdict means anything.
 */
export function verifyNative(files: GeneratedFile[], transform: TransformFn | undefined): VerifyReport {
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
        })
        continue
      }
      const markers = MARKERS.filter((m) => code.includes(m))
      const leaked = LEAKS.filter((l) => code.includes(l))
      out.push({
        path: file.path,
        target,
        verdict: decide(markers, leaked, warnings, file.contents),
        warnings,
        markers,
        leaked,
      })
    }
  }
  return { ran: true, files: out }
}

/**
 * Reduce one transform to a verdict.
 *
 * Deliberately per-CONCERN rather than "any marker wins". A module whose
 * schemas lowered but whose query did not would otherwise report `lowers`
 * while shipping a native build that cannot decode a response — the schema
 * marker is real, and it is answering a different question.
 *
 * Warnings are also read for the class PMTC calls out as fatal. It emits
 * `does NOT compile` for shapes it reproduced verbatim, and treating that as
 * advisory is precisely how a broken native build reaches a device.
 */
function decide(markers: string[], leaked: string[], warnings: string[], source: string): Verdict {
  // A leak outranks everything: the emitted source references a symbol the
  // target does not have, so the native build cannot link.
  if (leaked.length > 0) return 'broken'
  if (warnings.some((w) => w.includes('does NOT compile'))) return 'broken'
  // Expectations are read off the SOURCE, so a file that never asked for a
  // query is not penalised for lacking a query marker.
  const wantsSchema = source.includes('s.object(')
  const wantsQuery = source.includes('useQuery')
  if (wantsSchema && !markers.some((m) => m.startsWith('PyreonZodSchema_'))) return 'web-only'
  if (wantsQuery && !markers.some((m) => m === 'PyreonQuery<')) return 'web-only'
  if (markers.length === 0) return warnings.length > 0 ? 'web-only' : 'broken'
  return 'lowers'
}

/** Reduce per-file verdicts to a single exit-worthy answer. */
export function worstVerdict(report: VerifyReport): Verdict {
  if (!report.ran) return 'skipped'
  if (report.files.some((f) => f.verdict === 'broken')) return 'broken'
  if (report.files.some((f) => f.verdict === 'web-only')) return 'web-only'
  return report.files.length > 0 ? 'lowers' : 'skipped'
}

/**
 * Resolve the project's own `@pyreon/native-compiler`.
 *
 * Resolved, never fetched — the same rule `pyreon doctor`'s dependency-fabric
 * gate follows. A verdict from a different version of the compiler than the one
 * that will build the app is worse than no verdict.
 */
export async function resolveTransform(): Promise<TransformFn | undefined> {
  try {
    const mod = (await import('@pyreon/native-compiler')) as { transform?: TransformFn }
    return typeof mod.transform === 'function' ? mod.transform : undefined
  } catch {
    return undefined
  }
}
