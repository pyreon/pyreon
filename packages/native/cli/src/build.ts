// Core build orchestration — turn a directory of Pyreon TSX into a
// directory of native (Swift / Kotlin) source files.
//
// Phase 0 scope (per roadmap PR 2):
//   - Walk a source directory for `*.tsx` files (skip nested directories
//     and `*.test.tsx` for now — Phase 1 expands)
//   - For each input file, call `@pyreon/native-compiler` `transform()`
//     with the requested target
//   - Write output to a mirrored path in the out directory, with the
//     target-appropriate extension (.swift / .kt)
//   - Prepend source-map directives so downstream debug tooling can
//     point at Pyreon source lines
//
// What's NOT here (deferred):
//   - File watching / hot reload — Phase 3
//   - Incremental compilation — Phase 1+
//   - Per-component output splitting beyond 1-file-in-1-file-out
//   - Cross-file symbol resolution

import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { TargetLanguage } from '@pyreon/native-compiler'
import { transform } from '@pyreon/native-compiler'

export interface BuildOptions {
  /** Directory containing `.tsx` sources to compile. */
  source: string
  /** Directory where emitted native code is written. */
  out: string
  /** Which native language to emit. */
  target: TargetLanguage
  /**
   * Kotlin package name prepended to each emitted `.kt` file's first
   * line. Ignored for the Swift target. Required when the emitted code
   * is consumed from a Kotlin host that imports it by fully-qualified
   * name (e.g. an Android Compose `MainActivity` doing
   * `import com.pyreon.generated.TodoApp`). Without this option the
   * emit lives in Kotlin's anonymous root package, which is fine for
   * single-file `kotlinc` validation but doesn't work in real Android
   * apps where the JVM module loader needs FQNs.
   */
  kotlinPackage?: string
}

export interface BuildResult {
  /** Number of `.tsx` files successfully compiled. */
  filesCompiled: number
  /** Aggregated warnings across all transform invocations. */
  warnings: { file: string; warning: string }[]
  /** Per-file outputs — useful for tests + consumer scripts. */
  outputs: { source: string; output: string; code: string }[]
}

/** Map a TSX source path to the target's expected file extension. */
function outputExtension(target: TargetLanguage): string {
  return target === 'swift' ? '.swift' : '.kt'
}

/**
 * Source-map directive prepended to each emitted file. Swift uses
 * `#sourceLocation(file:line:)`; Kotlin doesn't have an equivalent
 * pragma, so we use a leading line comment that debug tooling can
 * parse out by convention. This keeps debugging hops from compiled
 * native back to original Pyreon source possible.
 */
function sourceMapHeader(target: TargetLanguage, originalPath: string): string {
  if (target === 'swift') {
    // Swift's directive expects an absolute path; relative paths work
    // too but are harder for IDE breakpoints to resolve.
    return `#sourceLocation(file: "${originalPath}", line: 1)\n`
  }
  return `// pyreon-source: ${originalPath}\n`
}

/**
 * Import preamble prepended to each emitted file. PMTC emits SwiftUI /
 * Compose vocabulary (`View`, `@State`, `VStack`, `@Composable`,
 * `mutableStateOf`, `Column`, `Arrangement`, etc.) — those symbols need
 * a `import SwiftUI` / `import androidx.compose.*` line at the top of
 * every generated file or the compiler can't resolve them.
 *
 * Pyreon-runtime imports (`PyreonRuntime`, `PyreonRouter` on Swift;
 * `com.pyreon.runtime.*`, `com.pyreon.router.*` on Kotlin) are also
 * included because most emitted files reference at least one of:
 * `@PyreonAppStorage`, `rememberPyreonStorage`, `PyreonRouter`, the
 * canonical-primitive impls. Unused imports are harmless on both
 * targets — Swift's `-warnings-as-errors` for unused-imports is opt-in,
 * and Kotlin's `-Werror` flag isn't enabled by the standard project
 * templates.
 *
 * Kotlin gets wildcard imports for breadth; specific deep imports
 * (KeyboardOptions, ImeAction, etc.) come from the same package roots
 * already named.
 */
/**
 * Imports needed only by SOME emitted shapes, keyed on the emitted
 * code's content. Kept OUT of the unconditional header because they
 * pull artifacts not every host declares: `kotlinx.serialization.json`
 * needs the -json artifact (the unconditional `Serializable` import
 * only needs -core), and while Compose pulls kotlinx-coroutines
 * transitively, hosts that never fetch shouldn't carry the imports.
 *
 * Device-found (fetch-arc): the kotlinc validate loop concatenates the
 * STUBS into the same file — no imports needed — so the missing
 * `withContext` / `Dispatchers` / `Json` imports only surfaced on the
 * first REAL `gradle assembleDebug` of a useFetch screen.
 */
function conditionalKotlinImports(emitted: string): string {
  const imports: string[] = []
  if (emitted.includes('withContext(')) imports.push('import kotlinx.coroutines.withContext')
  if (emitted.includes('Dispatchers.')) imports.push('import kotlinx.coroutines.Dispatchers')
  if (emitted.includes('Json.')) imports.push('import kotlinx.serialization.json.Json')
  return imports.length === 0 ? '' : imports.join('\n') + '\n'
}

function importHeader(target: TargetLanguage): string {
  if (target === 'swift') {
    return [
      'import SwiftUI',
      'import PyreonRuntime',
      'import PyreonRouter',
      '',
    ].join('\n')
  }
  return [
    'import androidx.compose.runtime.*',
    'import androidx.compose.foundation.layout.*',
    'import androidx.compose.foundation.lazy.*',
    'import androidx.compose.foundation.text.*',
    'import androidx.compose.material.*',
    'import androidx.compose.ui.*',
    'import androidx.compose.ui.Modifier',
    'import androidx.compose.ui.Alignment',
    'import androidx.compose.ui.platform.testTag',
    'import androidx.compose.ui.unit.*',
    'import androidx.compose.ui.text.input.ImeAction',
    'import kotlinx.serialization.Serializable',
    'import com.pyreon.runtime.*',
    'import com.pyreon.router.*',
    '',
  ].join('\n')
}

/** Walk a directory recursively, returning all `.tsx` files (excluding tests). */
export function findTsxFiles(sourceDir: string): string[] {
  const found: string[] = []
  function walk(dir: string): void {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        walk(path)
      } else if (stat.isFile() && path.endsWith('.tsx') && !path.endsWith('.test.tsx')) {
        found.push(path)
      }
    }
  }
  walk(sourceDir)
  return found.sort()
}

/**
 * Run the build over a source tree. Returns the result; throws only on
 * unrecoverable IO errors (missing source dir, write failure). Compiler
 * warnings are collected into `result.warnings`; transform errors on a
 * single file abort the whole build (matches the canonical compiler-CLI
 * contract — partial-success builds are misleading).
 */
export function build(options: BuildOptions): BuildResult {
  const sourceAbs = resolve(options.source)
  const outAbs = resolve(options.out)
  const ext = outputExtension(options.target)

  const inputs = findTsxFiles(sourceAbs)
  const warnings: BuildResult['warnings'] = []
  const outputs: BuildResult['outputs'] = []

  for (const input of inputs) {
    const code = readFileSync(input, 'utf8')
    const result = transform(code, { target: options.target })
    for (const w of result.warnings) warnings.push({ file: input, warning: w })

    const relPath = relative(sourceAbs, input)
    // foo/bar.tsx → foo/bar.swift (or .kt). Replace path separators
    // with the platform's separator so Windows builds aren't broken.
    const outPath = join(outAbs, relPath.replace(/\.tsx$/, ext)).split('/').join(sep)
    mkdirSync(dirname(outPath), { recursive: true })
    const packageHeader =
      options.target === 'kotlin' && options.kotlinPackage
        ? `package ${options.kotlinPackage}\n\n`
        : ''
    const finalCode =
      packageHeader +
      sourceMapHeader(options.target, input) +
      importHeader(options.target) +
      (options.target === 'kotlin' ? conditionalKotlinImports(result.code) : '') +
      result.code
    writeFileSync(outPath, finalCode, 'utf8')
    outputs.push({ source: input, output: outPath, code: finalCode })
  }

  return { filesCompiled: inputs.length, warnings, outputs }
}
