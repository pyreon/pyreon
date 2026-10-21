// native-companions — resolve the native files a co-located runtime compiles AGAINST
// but does not own.
//
// The co-source gate compiles each package's native sources on their own, while a
// real app build compiles them in one module together with the base runtime and
// every wired first-party package. A co-sourced file that uses a type the app build
// provides (`KeychainSecureBackend` from @pyreon/storage, `PyreonHttp` from the Kotlin
// base runtime) therefore compiled in every app and failed the gate — so packages
// re-implemented those types instead of using them.
//
// A companion reference names exactly one file:
//
//   @base/<File>              the base runtime — KOTLIN ONLY (runtime-kotlin)
//   @pyreon/<pkg>/<File>      another package's co-located native sources
//
// `@base/` is refused for Swift. On Android every wired source set compiles into one
// `com.pyreon.runtime` package, so a base-runtime file is simply visible. On iOS the base
// runtime is a separate Swift PACKAGE (module `PyreonRuntime`) while co-located package
// sources compile into the app target: a co-located file can only see a base type through
// `import PyreonRuntime`, which a standalone typecheck cannot model. Compiling the base file
// alongside would make the gate pass code a real app build rejects (found by building one).
// Co-located packages DO share the app module with each other, so `@pyreon/<pkg>` is sound.
//
// A `@pyreon/<pkg>` reference is only legal when <pkg> is a declared dependency:
// that is what makes `pyreon-native wire` (which follows first-party dependencies)
// put the file in the app build. A reference the app build would not have is the
// exact divergence this exists to prevent, so it fails instead of resolving.

import { join } from 'node:path'

export type NativeLang = 'swift' | 'kotlin'

export interface CompanionPackage {
  name: string
  swiftDir?: string
  kotlinDir?: string
}

export interface CompanionContext {
  /** Repo root, for `@base/`. */
  root: string
  /** The package doing the referencing. */
  owner: { name: string; dependencies: readonly string[] }
  /** Every package with co-located native sources, by name. */
  packages: ReadonlyMap<string, CompanionPackage>
}

export type CompanionResult = { ok: true; path: string } | { ok: false; error: string }

const BASE_DIRS: Record<NativeLang, string[]> = {
  swift: ['packages', 'native', 'runtime-swift', 'Sources', 'PyreonRuntime'],
  kotlin: ['packages', 'native', 'runtime-kotlin', 'src', 'main', 'kotlin', 'com', 'pyreon', 'runtime'],
}

/** True for a reference into another package or the base runtime (vs a file of the owner's own). */
export function isCompanionRef(ref: string): boolean {
  return ref.startsWith('@base/') || ref.startsWith('@pyreon/')
}

/**
 * Resolve a companion reference to an absolute path. Existence is the caller's
 * check (it reports every missing file at once); this decides WHERE and WHETHER
 * the reference is allowed.
 */
export function resolveCompanion(ref: string, lang: NativeLang, ctx: CompanionContext): CompanionResult {
  const ext = lang === 'swift' ? '.swift' : '.kt'
  if (!ref.endsWith(ext)) return { ok: false, error: `${ref}: a ${lang} companion must name a ${ext} file` }
  if (ref.startsWith('@base/')) {
    if (lang === 'swift') {
      return {
        ok: false,
        error: `${ref}: the base runtime is a separate Swift module (PyreonRuntime) in an iOS app, so a co-located file cannot use it without \`import PyreonRuntime\` — compiling it alongside would pass code a real build rejects. Keep the package self-contained instead.`,
      }
    }
    const file = ref.slice('@base/'.length)
    if (!file || file.includes('/')) return { ok: false, error: `${ref}: expected @base/<File>${ext}` }
    return { ok: true, path: join(ctx.root, ...BASE_DIRS[lang], file) }
  }
  const m = /^(@pyreon\/[^/]+)\/([^/]+)$/.exec(ref)
  if (!m) return { ok: false, error: `${ref}: expected @base/<File>${ext} or @pyreon/<pkg>/<File>${ext}` }
  const [, pkgName, file] = m as unknown as [string, string, string]
  if (pkgName === ctx.owner.name) {
    return { ok: false, error: `${ref}: names the package itself — list its own files directly` }
  }
  if (!ctx.owner.dependencies.includes(pkgName)) {
    return {
      ok: false,
      error: `${ref}: ${pkgName} is not a dependency of ${ctx.owner.name}, so an app build would not contain it — add it to "dependencies"`,
    }
  }
  const pkg = ctx.packages.get(pkgName)
  const dir = lang === 'swift' ? pkg?.swiftDir : pkg?.kotlinDir
  if (!dir) return { ok: false, error: `${ref}: ${pkgName} ships no ${lang} sources` }
  return { ok: true, path: lang === 'swift' ? join(dir, file) : join(dir, 'com', 'pyreon', 'runtime', file) }
}
