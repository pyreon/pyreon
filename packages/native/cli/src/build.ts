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
  /** Canonical font name → iOS PostScript name (Swift Font.custom). */
  fonts?: Record<string, string>
}

export interface BuildResult {
  /** Number of `.tsx` files successfully compiled. */
  filesCompiled: number
  /** Aggregated warnings across all transform invocations. */
  warnings: { file: string; warning: string }[]
  /** Per-file outputs — useful for tests + consumer scripts. */
  outputs: { source: string; output: string; code: string }[]
  /**
   * Web-only entry files skipped by the native build (they import a
   * web-only runtime — see `isWebOnlyEntry`). Surfaced (not silently
   * dropped) so the CLI can report what it skipped — a web entry left in
   * a `--source` tree is a normal, expected shape, but a SHARED file
   * accidentally importing the DOM runtime should be visible.
   */
  skippedWebEntries: string[]
}

/**
 * A `.tsx` that imports a web-only runtime — `@pyreon/runtime-dom` (the
 * client `mount`/`hydrateRoot` DOM renderer) or `@pyreon/runtime-server`
 * (SSR `renderToString`) — is a WEB ENTRY POINT, not a shared component
 * source. It calls platform-only APIs (`document.getElementById`,
 * `mount(App, root)`) that have no native equivalent, so PMTC must skip
 * it: compiling it emits `document.getElementById(...)` into Swift /
 * Kotlin, which can't compile. The scaffold's `entry-web.tsx` is the
 * canonical case; detecting by IMPORT (not filename) also covers
 * `main.tsx` / `entry-client.tsx` / any user-named web entry, and never
 * false-skips a shared component (a shared file importing the DOM
 * runtime is itself a bug this surfaces).
 */
const WEB_ONLY_IMPORT_RE = /\bfrom\s+['"]@pyreon\/(?:runtime-dom|runtime-server)['"]/
export function isWebOnlyEntry(code: string): boolean {
  return WEB_ONLY_IMPORT_RE.test(code)
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
export function conditionalKotlinImports(emitted: string): string {
  const imports: string[] = []
  if (emitted.includes('withContext(')) imports.push('import kotlinx.coroutines.withContext')
  if (emitted.includes('Dispatchers.')) imports.push('import kotlinx.coroutines.Dispatchers')
  if (emitted.includes('Json.')) imports.push('import kotlinx.serialization.json.Json')
  // Bundled-image emit (asset-pipeline arc): the Image composable +
  // painterResource + ContentScale live outside the unconditional
  // star-import set (Kotlin star imports are single-package).
  if (emitted.includes('painterResource(')) {
    imports.push('import androidx.compose.foundation.Image')
    imports.push('import androidx.compose.ui.res.painterResource')
  }
  if (emitted.includes('ContentScale.')) {
    imports.push('import androidx.compose.ui.layout.ContentScale')
  }
  // Color / RoundedCornerShape (PR-1.3 device-found): the emit produces
  // `Color(0xFF…)` (any `color=` prop, e.g. an Icon tint) and
  // `RoundedCornerShape(…)` (a `radius` prop), but neither lives in a
  // star-imported package. The kotlinc validate loop MASKED this — its
  // stubs provide both — so only a REAL Android build surfaced the
  // unresolved reference (same stub-masked class as the fetch imports +
  // the phantom pyreonIcon). The icons showcase's `color="primary"`
  // header was the first real-build Color() in any example.
  if (emitted.includes('Color(')) {
    imports.push('import androidx.compose.ui.graphics.Color')
  }
  if (emitted.includes('RoundedCornerShape(')) {
    imports.push('import androidx.compose.foundation.shape.RoundedCornerShape')
  }
  // <Field kind="password"> / dynamic kind: PasswordVisualTransformation +
  // VisualTransformation.None both live in androidx.compose.ui.text.input — the
  // unconditional set only imports `ImeAction` from that package (Kotlin star
  // imports are single-package). Same stub-masked class as Color /
  // RoundedCornerShape: the kotlinc validate stub provides both, so a REAL
  // gradle build was the only thing that would surface the missing import —
  // and no example had used `kind="password"` yet, so the STATIC-password path
  // shipped with a latent unresolved-reference bug this closes alongside the
  // dynamic-kind lowering.
  if (emitted.includes('PasswordVisualTransformation(')) {
    imports.push('import androidx.compose.ui.text.input.PasswordVisualTransformation')
  }
  if (emitted.includes('VisualTransformation.')) {
    imports.push('import androidx.compose.ui.text.input.VisualTransformation')
  }
  // A11y emit (<… accessibilityLabel>): the `.semantics { contentDescription
  // = … }` modifier + the `contentDescription` semantics property both live in
  // androidx.compose.ui.semantics — a sub-package NOT covered by the
  // star-imported androidx.compose.ui.* (Kotlin star imports are
  // single-package). Same stub-masked class as Color / RoundedCornerShape:
  // the kotlinc validate loop's stub provides them, so only a REAL Android
  // build would surface a missing import — these conditional imports keep the
  // real gradle build resolvable.
  if (emitted.includes('.semantics {')) {
    imports.push('import androidx.compose.ui.semantics.semantics')
  }
  // `contentDescription` (accessibilityLabel) — gated precisely so a role-only
  // `.semantics { role = … }` emit doesn't pull an unused import.
  if (emitted.includes('contentDescription =')) {
    imports.push('import androidx.compose.ui.semantics.contentDescription')
  }
  // A11y emit (<… accessibilityRole>): button/image emit `role = Role.X` (needs
  // both the `role` extension property + the `Role` class), header emits
  // `heading()` — all in the androidx.compose.ui.semantics sub-package, same
  // stub-masked-on-validate / needs-real-import-on-gradle shape as the above.
  if (emitted.includes('Role.')) {
    imports.push('import androidx.compose.ui.semantics.Role')
    imports.push('import androidx.compose.ui.semantics.role')
  }
  if (emitted.includes('heading()')) {
    imports.push('import androidx.compose.ui.semantics.heading')
  }
  // A11y emit (<… accessibilityHidden>): clearAndSetSemantics also lives in the
  // androidx.compose.ui.semantics sub-package (single-package star import
  // doesn't cover it). Same stub-masked class — the conditional import keeps
  // the real gradle build resolvable.
  if (emitted.includes('.clearAndSetSemantics {')) {
    imports.push('import androidx.compose.ui.semantics.clearAndSetSemantics')
  }
  // Scroll emit (<Scroll>): verticalScroll/horizontalScroll/
  // rememberScrollState live in the ROOT androidx.compose.foundation
  // package — NOT covered by the star-imported foundation.layout/.lazy/
  // .text sub-packages. Stub-masked like Color; latent until an example
  // first <Scroll>s on a real Android build.
  if (emitted.includes('verticalScroll(') || emitted.includes('horizontalScroll(')) {
    imports.push('import androidx.compose.foundation.rememberScrollState')
  }
  if (emitted.includes('verticalScroll(')) {
    imports.push('import androidx.compose.foundation.verticalScroll')
  }
  if (emitted.includes('horizontalScroll(')) {
    imports.push('import androidx.compose.foundation.horizontalScroll')
  }
  // useColorScheme emit (`if (isSystemInDarkTheme()) "dark" else "light"`):
  // isSystemInDarkTheme is a top-level @Composable in the ROOT
  // androidx.compose.foundation package — NOT covered by the star-imported
  // .layout/.lazy/.text sub-packages. Same stub-masked class as
  // verticalScroll/clickable: the validate-kotlin loop concatenates stubs, so
  // it resolves the symbol regardless of import and CANNOT catch a missing
  // one — latent until the counter (M2.5) became the first Android example to
  // read useColorScheme on a real `gradle assembleDebug` (the device gate).
  if (emitted.includes('isSystemInDarkTheme(')) {
    imports.push('import androidx.compose.foundation.isSystemInDarkTheme')
  }
  // <Transition show> emit (`AnimatedVisibility(visible = …) { … }`):
  // AnimatedVisibility lives in androidx.compose.animation — NOT covered by any
  // star-imported package (runtime / foundation.layout|lazy|text / material /
  // ui). Same stub-masked class as isSystemInDarkTheme: the validate-kotlin
  // loop concatenates stubs, so it resolves the symbol regardless of import and
  // CANNOT catch a missing one — added PROACTIVELY here (caught while probing
  // the emit for the M2.7 animations device-assertion, before any real
  // `gradle assembleDebug` failed on it — the counter is the first Android
  // example to render a <Transition>).
  if (emitted.includes('AnimatedVisibility(')) {
    imports.push('import androidx.compose.animation.AnimatedVisibility')
  }
  // <Press> clickable modifiers live in the ROOT androidx.compose.foundation
  // package (NOT the star-imported .layout/.lazy/.text sub-packages), same
  // stub-masked class as verticalScroll. NO Android example had used <Press>
  // on a real gradle build before the M2.3 gesture arc, so `.clickable`
  // itself was a latent missing import — added here alongside the new
  // `.combinedClickable` (onPress + onLongPress). combinedClickable is
  // stable since Compose 1.6 (no @OptIn); if a device build proves an older
  // BOM needs the opt-in, that's the follow-up the Android CI catches.
  if (emitted.includes('.clickable(')) {
    imports.push('import androidx.compose.foundation.clickable')
  }
  if (emitted.includes('.combinedClickable(')) {
    imports.push('import androidx.compose.foundation.combinedClickable')
  }
  // M3.1 haptics (`const h = useHaptics()`): the Compose haptic surface
  // `LocalHapticFeedback` lives in androidx.compose.ui.platform — NOT
  // covered by the star-imported androidx.compose.ui.* (single-package).
  // No gated Android app used haptics before, so this is a first-use
  // import (the same latent-missing class as `.clickable` in M2.3);
  // keyed on the emitted `LocalHapticFeedback.current` read.
  if (emitted.includes('LocalHapticFeedback.current')) {
    imports.push('import androidx.compose.ui.platform.LocalHapticFeedback')
  }
  // M3.2 share (`const share = useShare()`): the emitted code reads
  // `LocalContext.current` to inject the Context into PyreonShare. Lives
  // in androidx.compose.ui.platform (not the star-imported ui.*). No
  // gated Android app used LocalContext before (clipboard's was a latent-
  // missing import — no gated app exercised it), so add it here keyed on
  // the emitted read. (The Intent / createChooser / ACTION_SEND symbols
  // live inside PyreonShare.kt's own imports, not the emitted app code.)
  if (emitted.includes('LocalContext.current')) {
    imports.push('import androidx.compose.ui.platform.LocalContext')
  }
  // M2.2 size-class (`const sizeClass = useSizeClass()`): the emitted code
  // reads `LocalConfiguration.current.screenWidthDp`. LocalConfiguration
  // lives in androidx.compose.ui.platform (same single-package as
  // LocalContext, NOT the star-imported ui.*), so it needs its own
  // conditional import keyed on the emitted read.
  if (emitted.includes('LocalConfiguration.current')) {
    imports.push('import androidx.compose.ui.platform.LocalConfiguration')
  }
  // Modal emit (<Modal>): Dialog is androidx.compose.ui.window — not in
  // the star-imported ui.* (single-package).
  if (emitted.includes('Dialog(')) {
    imports.push('import androidx.compose.ui.window.Dialog')
  }
  // Remote image (<Image src="http…">): AsyncImage is Coil's
  // composable — needs the import AND the io.coil-kt:coil-compose dep
  // (wired into the host + scaffold gradle).
  if (emitted.includes('AsyncImage(')) {
    imports.push('import coil.compose.AsyncImage')
  }
  // Icon emit (PR-1.3): compile-time Icons.Filled references need the
  // Icons object + one import per used glyph (Kotlin star imports are
  // single-package; the filled glyphs each live as a top-level val).
  const glyphs = [...new Set([...emitted.matchAll(/Icons\.Filled\.(\w+)/g)].map((m) => m[1]!))]
  if (glyphs.length > 0) {
    imports.push('import androidx.compose.material.icons.Icons')
    for (const g of glyphs.sort()) {
      imports.push(`import androidx.compose.material.icons.filled.${g}`)
    }
  }
  return imports.length === 0 ? '' : imports.join('\n') + '\n'
}

function importHeader(target: TargetLanguage): string {
  if (target === 'swift') {
    return [
      'import SwiftUI',
      'import Foundation', // String(format:) for toFixed, NumberFormatter, etc.
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
  const skippedWebEntries: string[] = []

  for (const input of inputs) {
    const code = readFileSync(input, 'utf8')
    // Web entry points (mount/hydrateRoot against the DOM) have no native
    // equivalent — skip them instead of emitting `document.getElementById`
    // into Swift/Kotlin, which can't compile.
    if (isWebOnlyEntry(code)) {
      skippedWebEntries.push(input)
      continue
    }
    const result = transform(code, {
      target: options.target,
      ...(options.fonts ? { fonts: options.fonts } : {}),
    })
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
    // `@file:OptIn(...)` file annotations MUST precede the package
    // directive. `combinedClickable` (<Press onLongPress>) is an
    // experimental foundation API on the examples' Compose BOM — device
    // build-found: it compiles nowhere without the opt-in. FQN keeps it
    // import-free. Only emitted when the file actually uses it.
    const fileAnnotations =
      options.target === 'kotlin' && result.code.includes('.combinedClickable(')
        ? '@file:OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)\n\n'
        : ''
    const finalCode =
      fileAnnotations +
      packageHeader +
      sourceMapHeader(options.target, input) +
      importHeader(options.target) +
      (options.target === 'kotlin' ? conditionalKotlinImports(result.code) : '') +
      result.code
    writeFileSync(outPath, finalCode, 'utf8')
    outputs.push({ source: input, output: outPath, code: finalCode })
  }

  return { filesCompiled: outputs.length, warnings, outputs, skippedWebEntries }
}
