/**
 * Native (multiplatform) hazard detection for the MCP `validate` tool.
 *
 * The detector lives in `@pyreon/native-compiler/audit` -- the native story --
 * which is an OPTIONAL peer of this server (a web-only user never installs a
 * Swift/Kotlin compiler). It is therefore loaded lazily, and its absence must
 * never be silent: a snippet that imports `@pyreon/primitives` IS a
 * multiplatform component, so reporting "No issues found" without having run
 * the native checks would certify code nothing examined. Snippets that do not
 * import it are unaffected -- the detector would have returned nothing for them
 * anyway -- so a pure-web user sees no change and no noise.
 */
import type { NativePatternDiagnostic } from '@pyreon/native-compiler/audit'

export interface NativeDetectorModule {
  detectNativePatterns: (code: string, filename?: string) => NativePatternDiagnostic[]
}

export const NATIVE_CHECKS_SKIPPED_NOTE =
  'Native (multiplatform) checks were SKIPPED: this snippet imports `@pyreon/primitives`, but ' +
  '`@pyreon/native-compiler` is not installed. Install it (`bun add -d @pyreon/native-compiler`) ' +
  'to also catch web-only imports and unsupported enum/class declarations that break the iOS/Android build.'

// Only a miss of the PEER ITSELF is "not installed": the message names the
// missing specifier, so a transitive miss inside the audit (say `oxc-parser`)
// names a different package and surfaces as the defect it is.
const PEER = '@pyreon/native-compiler'

const isPeerMissing = (err: unknown, peer: string): boolean =>
  new RegExp(`Cannot find (?:module|package) '${peer}(?:/[^']*)?'`).test(
    String((err as Error | null)?.message),
  )

/**
 * Dynamic import of the audit subpath; `undefined` when the optional peer is
 * absent. `specifier` exists so a test can point the REAL loader at an
 * unresolvable name -- the default keeps a literal `import()`.
 */
export async function loadNativeDetector(
  specifier?: string,
): Promise<NativeDetectorModule | undefined> {
  try {
    const mod =
      specifier === undefined
        ? await import('@pyreon/native-compiler/audit')
        : await import(/* @vite-ignore */ specifier)
    return mod as NativeDetectorModule
  } catch (err) {
    if (isPeerMissing(err, specifier === undefined ? PEER : specifier.split('/').slice(0, 2).join('/'))) {
      return undefined
    }
    throw err
  }
}

export interface NativeDetection {
  diags: NativePatternDiagnostic[]
  /** True when native checks WOULD have applied but the peer is missing. */
  skipped: boolean
}

export async function detectNative(
  code: string,
  filename: string,
  load: () => Promise<NativeDetectorModule | undefined> = loadNativeDetector,
): Promise<NativeDetection> {
  const mod = await load()
  if (mod) return { diags: mod.detectNativePatterns(code, filename), skipped: false }
  return { diags: [], skipped: /['"]@pyreon\/primitives['"]/.test(code) }
}
