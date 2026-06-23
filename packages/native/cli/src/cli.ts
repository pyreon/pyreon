#!/usr/bin/env bun
// Command-line entry point for @pyreon/native-cli.
//
// Usage:
//   pyreon-native build --target=ios --source=./src --out=./generated
//   pyreon-native build --target=android --source=./src --out=./generated
//
// Exit codes:
//   0 — build succeeded
//   1 — argv / usage error
//   2 — build error (compiler threw on a source file)

import { build } from './build'
import { check, type CheckFinding } from './check'
import { materializeAssets, type AssetTarget } from './assets'
import { scanFontDir } from './fonts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { TargetLanguage } from '@pyreon/native-compiler'

interface ParsedArgs {
  command: string
  target?: TargetLanguage
  /** `assets` keeps the raw target token — it ALSO accepts `web`. */
  rawTarget?: string
  source?: string
  out?: string
  kotlinPackage?: string
  /** Dir to scan for bundled fonts (canonical→PostScript map for the Swift emit). */
  fonts?: string
  /** `check` only: also run `swiftc -typecheck` on the Swift emit. */
  typecheck?: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  // First positional arg = command (only `build` for now). Subsequent
  // args are `--key=value` or `--key value`.
  const out: ParsedArgs = { command: argv[0] ?? '' }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
    // Boolean flags (no value, don't consume the next arg).
    if (a === '--typecheck') {
      out.typecheck = true
      continue
    }
    let key: string
    let value: string
    if (a.startsWith('--') && a.includes('=')) {
      const eq = a.indexOf('=')
      key = a.slice(2, eq)
      value = a.slice(eq + 1)
    } else if (a.startsWith('--')) {
      key = a.slice(2)
      value = argv[i + 1] ?? ''
      i++
    } else {
      continue
    }
    if (key === 'target') {
      out.rawTarget = value
      if (value === 'ios' || value === 'swift') out.target = 'swift'
      else if (value === 'android' || value === 'kotlin') out.target = 'kotlin'
      // Unknown targets are flagged in main() so usage prints once.
    } else if (key === 'source') out.source = value
    else if (key === 'out') out.out = value
    else if (key === 'kotlin-package') out.kotlinPackage = value
    else if (key === 'fonts') out.fonts = value
  }
  return out
}

function printUsage(): void {
  console.error(`pyreon-native — PMTC build CLI (PRIVATE / EXPERIMENTAL)

Usage:
  pyreon-native build  --target=<ios|android|all> --source=<dir> --out=<dir>
  pyreon-native check  [--target=<ios|android>] [--typecheck] --source=<file|dir>
  pyreon-native assets --target=<ios|android|web> --source=<dir> --out=<dir>

check is the fast authoring-loop command: it runs the PMTC compiler for
both targets IN MEMORY (no build, no xcodegen/gradle, no file writes) and
reports per file — transform errors + unsupported-TS-subset warnings.
--source accepts a single .tsx (edit-loop) or a directory (walk). Add
--typecheck to ALSO run 'swiftc -typecheck' against the real SwiftUI SDK
(macOS-only; skips elsewhere), catching type-corruption that the subset
warnings + a -parse check miss. Exit 0 on clean-or-warnings, 2 on errors.

assets materializes a shared assets/ directory of images
(name.png, name@2x.png, name@3x.png) into the platform's bundled
format: Assets.xcassets (ios), res/drawable-* density buckets
(android), or a plain assets/ copy for the web host's public dir.

Targets:
  ios        emit Swift / SwiftUI
  android    emit Kotlin / Jetpack Compose
  all        emit BOTH — into <out>/ios + <out>/android (one command,
             every target — the "write once, ship everywhere" build)

Options:
  --target=ios|android|all  Required.
  --source=<dir>            Directory of .tsx files. Required.
  --out=<dir>               Output directory for emitted .swift / .kt. Required.
                            With --target=all, the ios/ + android/ subdirs.
  --kotlin-package=<fqn> Kotlin package name prepended to emitted .kt files
                         (e.g. "com.pyreon.generated"). Required when the emit
                         is consumed by an Android host that imports it by FQN.
                         Ignored for the Swift target.

This is an internal experimental CLI for the Pyreon Multi-Target
Compiler (PMTC). See packages/native/cli/README.md for status.`)
}

export function main(argv: string[]): number {
  const parsed = parseArgs(argv)
  if (parsed.command === 'assets') {
    return runAssets(parsed)
  }
  if (parsed.command === 'check') {
    return runCheck(parsed)
  }
  if (parsed.command !== 'build') {
    printUsage()
    return 1
  }

  // `--target=all` builds BOTH native targets in one invocation, into
  // `<out>/ios` (Swift) + `<out>/android` (Kotlin) subdirectories. The
  // one-codebase story shouldn't require two separate build commands — this
  // is the single command that mirrors "write once, ship every target".
  if (parsed.rawTarget === 'all') {
    if (!parsed.source) {
      console.error('error: --source is required')
      printUsage()
      return 1
    }
    if (!parsed.out) {
      console.error('error: --out is required')
      printUsage()
      return 1
    }
    let worst = 0
    for (const t of ['swift', 'kotlin'] as const) {
      const sub = t === 'swift' ? 'ios' : 'android'
      const outDir = join(parsed.out, sub)
      console.log(`[pyreon-native] building ${sub} → ${outDir}`)
      const code = executeBuild(parsed, t, outDir)
      // Keep building the other target even if one fails (surface BOTH
      // sets of errors in one run); return the worst exit code.
      if (code !== 0) worst = code
    }
    return worst
  }

  if (!parsed.target) {
    console.error('error: --target is required (ios | android | all)')
    printUsage()
    return 1
  }
  if (!parsed.source) {
    console.error('error: --source is required')
    printUsage()
    return 1
  }
  if (!parsed.out) {
    console.error('error: --out is required')
    printUsage()
    return 1
  }

  return executeBuild(parsed, parsed.target, parsed.out)
}

/**
 * Transpile `parsed.source` to one native target, writing into `outDir`.
 * Extracted so the single-target path and the `--target=all` multi-target
 * loop share one build + reporting + error-handling contract. Returns the
 * process exit code (0 ok, 2 on a thrown build error).
 */
function executeBuild(parsed: ParsedArgs, target: TargetLanguage, outDir: string): number {
  try {
    // Build the canonical→PostScript font map from --fonts (the shared
    // assets dir). Only iOS uses it (Font.custom needs the PostScript
    // name); Android resolves res/font at runtime.
    let fonts: Record<string, string> | undefined
    if (parsed.fonts && existsSync(parsed.fonts)) {
      fonts = {}
      for (const f of scanFontDir(parsed.fonts)) fonts[f.name] = f.postScriptName
    }
    const result = build({
      target,
      source: parsed.source!,
      out: outDir,
      ...(parsed.kotlinPackage ? { kotlinPackage: parsed.kotlinPackage } : {}),
      ...(fonts ? { fonts } : {}),
    })
    console.log(`[pyreon-native] compiled ${result.filesCompiled} file(s) → ${outDir}`)
    if (result.skippedWebEntries.length > 0) {
      console.log(
        `[pyreon-native] skipped ${result.skippedWebEntries.length} web-only entry file(s) (import @pyreon/runtime-dom|runtime-server):`,
      )
      for (const f of result.skippedWebEntries) console.log(`  ${f}`)
    }
    if (result.warnings.length > 0) {
      console.warn(`[pyreon-native] ${result.warnings.length} warning(s):`)
      for (const w of result.warnings) {
        console.warn(`  ${w.file}: ${w.warning}`)
      }
    }
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[pyreon-native] build failed: ${message}`)
    return 2
  }
}

// Only run main() if invoked directly (not when imported in tests).
// Bun sets `import.meta.main` to true for the entry script.
interface BunImportMeta {
  readonly main?: boolean
}
const meta = import.meta as ImportMeta & BunImportMeta
if (meta.main === true) {
  process.exit(main(process.argv.slice(2)))
}


function runAssets(parsed: ParsedArgs): number {
  const target = parsed.rawTarget === 'ios' ? 'ios'
    : parsed.rawTarget === 'android' ? 'android'
    : parsed.rawTarget === 'web' ? 'web'
    : undefined
  if (!target) {
    console.error('error: assets --target must be ios | android | web')
    printUsage()
    return 1
  }
  if (!parsed.source || !parsed.out) {
    console.error('error: assets requires --source and --out')
    printUsage()
    return 1
  }
  try {
    const result = materializeAssets(parsed.source, target as AssetTarget, parsed.out)
    console.log(
      `[pyreon-native] materialized ${result.assets} asset(s) (${result.files} file(s)) → ${parsed.out}`,
    )
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[pyreon-native] assets failed: ${message}`)
    return 2
  }
}

/** Print one check finding with a severity glyph + file:target prefix. */
function printFinding(f: CheckFinding): void {
  const glyph =
    f.kind === 'error' || f.kind === 'typecheck-error'
      ? '✗'
      : f.kind === 'typecheck-skipped'
        ? 'ℹ'
        : '!'
  const line = `  ${glyph} ${f.file} [${f.target}] ${f.message}`
  if (f.kind === 'error' || f.kind === 'typecheck-error') console.error(line)
  else console.warn(line)
}

function runCheck(parsed: ParsedArgs): number {
  if (!parsed.source) {
    console.error('error: check requires --source (a .tsx file or a directory)')
    printUsage()
    return 1
  }
  // `--target` narrows to one platform; default checks BOTH (the DX
  // default — you want to know if your component works everywhere).
  const targets: TargetLanguage[] = parsed.target ? [parsed.target] : ['swift', 'kotlin']
  try {
    const result = check({
      source: parsed.source,
      targets,
      ...(parsed.typecheck ? { typecheck: true } : {}),
    })
    for (const f of result.findings) printFinding(f)
    const skipped = result.findings.filter((f) => f.kind === 'typecheck-skipped').length
    console.log(
      `[pyreon-native] checked ${result.filesChecked} file(s) [${targets.join(', ')}] — ` +
        `${result.errorCount} error(s), ${result.warningCount} warning(s)` +
        (parsed.typecheck ? `, ${skipped} type-check skipped` : ''),
    )
    if (result.skippedWebEntries.length > 0) {
      console.log(
        `[pyreon-native] skipped ${result.skippedWebEntries.length} web-only entry file(s)`,
      )
    }
    return result.errorCount > 0 ? 2 : 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[pyreon-native] check failed: ${message}`)
    return 2
  }
}
