// Where a native runtime source (`PyreonX.swift` / `PyreonX.kt`) can live.
//
// The co-location architecture (PRs #2790/#2793/#2795 …) moved each feature
// package's native runtime OUT of the monolith
// (`@pyreon/native-runtime-{swift,kotlin}`) and into the package's own
// `native/{swift,kotlin}/` dir. A test that resolves a runtime file at the
// monolith path alone therefore ENOENTs for a moved runtime (picker
// isAvailable) — or, worse, silently drops it from a coverage set
// (`isFrameworkType`), quietly shrinking a gate as runtimes relocate.
//
// This resolver looks in BOTH homes: the monolith runtime dirs AND every
// co-located `packages/<cat>/<pkg>/native/{swift,kotlin/com/pyreon/runtime}`.
// It is the single place the tests learn about co-location, so a future move
// (a Category-C runtime, a further relocation) needs no test edits.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** All directories that can hold a native runtime source of the given kind. */
export function nativeRuntimeRoots(repo: string, kind: 'swift' | 'kotlin'): string[] {
  const roots: string[] = []

  // Monolith base runtimes (framework-base runtimes STAY here).
  roots.push(
    kind === 'swift'
      ? join(repo, 'packages/native/runtime-swift/Sources/PyreonRuntime')
      : join(repo, 'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime'),
  )

  // Co-located feature runtimes: packages/<cat>/<pkg>/native/{swift | kotlin/com/pyreon/runtime}.
  const pkgsDir = join(repo, 'packages')
  if (existsSync(pkgsDir)) {
    for (const cat of readdirSync(pkgsDir)) {
      const catDir = join(pkgsDir, cat)
      if (!statSync(catDir).isDirectory()) continue
      for (const pkg of readdirSync(catDir)) {
        const nativeDir = join(catDir, pkg, 'native')
        if (!existsSync(nativeDir)) continue
        roots.push(
          kind === 'swift'
            ? join(nativeDir, 'swift')
            : join(nativeDir, 'kotlin/com/pyreon/runtime'),
        )
      }
    }
  }

  return roots.filter(existsSync)
}

/** Absolute path of `PyreonX`'s runtime source on the given platform, or null. */
export function findNativeRuntime(
  repo: string,
  name: string,
  kind: 'swift' | 'kotlin',
): string | null {
  const ext = kind === 'swift' ? 'swift' : 'kt'
  for (const root of nativeRuntimeRoots(repo, kind)) {
    const f = join(root, `${name}.${ext}`)
    if (existsSync(f)) return f
  }
  return null
}

/** True iff `PyreonX` ships a same-named source on the given platform. */
export function nativeRuntimeExists(repo: string, name: string, kind: 'swift' | 'kotlin'): boolean {
  return findNativeRuntime(repo, name, kind) !== null
}

/** Read `PyreonX`'s runtime source; throws a located error if absent. */
export function readNativeRuntime(repo: string, name: string, kind: 'swift' | 'kotlin'): string {
  const f = findNativeRuntime(repo, name, kind)
  if (f === null) {
    throw new Error(
      `[native-runtime-locations] ${name}.${kind === 'swift' ? 'swift' : 'kt'} not found in any runtime location (monolith or co-located native/ dirs)`,
    )
  }
  return readFileSync(f, 'utf8')
}
