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
import type { TargetLanguage } from '@pyreon/native-compiler'

interface ParsedArgs {
  command: string
  target?: TargetLanguage
  source?: string
  out?: string
  kotlinPackage?: string
}

function parseArgs(argv: string[]): ParsedArgs {
  // First positional arg = command (only `build` for now). Subsequent
  // args are `--key=value` or `--key value`.
  const out: ParsedArgs = { command: argv[0] ?? '' }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
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
      if (value === 'ios' || value === 'swift') out.target = 'swift'
      else if (value === 'android' || value === 'kotlin') out.target = 'kotlin'
      // Unknown targets are flagged in main() so usage prints once.
    } else if (key === 'source') out.source = value
    else if (key === 'out') out.out = value
    else if (key === 'kotlin-package') out.kotlinPackage = value
  }
  return out
}

function printUsage(): void {
  console.error(`pyreon-native — PMTC build CLI (PRIVATE / EXPERIMENTAL)

Usage:
  pyreon-native build --target=<ios|android> --source=<dir> --out=<dir>

Targets:
  ios        emit Swift / SwiftUI
  android    emit Kotlin / Jetpack Compose

Options:
  --target=ios|android   Required.
  --source=<dir>         Directory of .tsx files. Required.
  --out=<dir>            Output directory for emitted .swift / .kt. Required.
  --kotlin-package=<fqn> Kotlin package name prepended to emitted .kt files
                         (e.g. "com.pyreon.generated"). Required when the emit
                         is consumed by an Android host that imports it by FQN.
                         Ignored for the Swift target.

This is an internal experimental CLI for the Pyreon Multi-Target
Compiler (PMTC). See packages/native/cli/README.md for status.`)
}

export function main(argv: string[]): number {
  const parsed = parseArgs(argv)
  if (parsed.command !== 'build') {
    printUsage()
    return 1
  }
  if (!parsed.target) {
    console.error('error: --target is required (ios | android)')
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

  try {
    const result = build({
      target: parsed.target,
      source: parsed.source,
      out: parsed.out,
      ...(parsed.kotlinPackage ? { kotlinPackage: parsed.kotlinPackage } : {}),
    })
    console.log(
      `[pyreon-native] compiled ${result.filesCompiled} file(s) → ${parsed.out}`,
    )
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
