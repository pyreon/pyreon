// Generated Kotlin must never share a package with the runtime sources (#4765).
//
// Kotlin resolves a bare name to a declaration of the file's OWN package before
// a default import (`kotlin.*`), so a generated `data class Error` placed in
// `com.pyreon.runtime` would replace `kotlin.Error` in every runtime file that
// spells it bare — the class that breaks Swift, where every app file shares one
// module. On Kotlin the generated code lives in `--kotlin-package`
// (`com.pyreon.generated` in the examples), which no runtime file imports, so
// the only way in is a `--kotlin-package` naming a runtime package. `build`
// refuses those; this file keeps the refused list total over the packages the
// shipped runtime sources actually declare.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, RUNTIME_KOTLIN_PACKAGES } from '../build'

const PACKAGES = resolve(import.meta.dirname, '../../../..')

/** Every shipped runtime `.kt` file: co-located `native/kotlin`, and the two Gradle packages' `src/main`. */
function shippedRuntimeKotlin(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'lib' || e === 'build' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) shippedRuntimeKotlin(p, out)
    else if (p.endsWith('.kt') && (p.includes('/native/kotlin/') || p.includes('/src/main/'))) out.push(p)
  }

  return out
}

describe('generated Kotlin stays out of the runtime packages', () => {
  const files = shippedRuntimeKotlin(PACKAGES)

  it('the refused list is every package the shipped runtime Kotlin declares', () => {
    expect(files.length).toBeGreaterThan(100)
    const declared = new Set<string>()
    for (const f of files) {
      const m = /^package\s+([\w.]+)/m.exec(readFileSync(f, 'utf8'))
      if (m) declared.add(m[1]!)
    }
    expect([...declared].sort()).toEqual([...RUNTIME_KOTLIN_PACKAGES].sort())
  })

  it('build refuses a --kotlin-package that names a runtime package, and accepts the examples’ package', () => {
    const src = mkdtempSync(join(tmpdir(), 'pyreon-kt-pkg-src-'))
    const out = mkdtempSync(join(tmpdir(), 'pyreon-kt-pkg-out-'))
    try {
      writeFileSync(
        join(src, 'App.tsx'),
        `import { Text } from '@pyreon/primitives'\ninterface Error { code: number }\nexport function App() { return <Text>hi</Text> }\n`,
      )
      for (const pkg of RUNTIME_KOTLIN_PACKAGES) {
        expect(() => build({ source: src, out, target: 'kotlin', kotlinPackage: pkg })).toThrow(
          `--kotlin-package=${pkg} is a package of the Pyreon runtime`,
        )
      }
      const ok = build({ source: src, out, target: 'kotlin', kotlinPackage: 'com.pyreon.generated' })
      expect(ok.filesCompiled).toBe(1)
      // Kotlin keeps the user's name: only Swift renames (its runtime shares the app module).
      expect(ok.outputs[0]!.code).toContain('data class Error(')
    } finally {
      rmSync(src, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })
})
