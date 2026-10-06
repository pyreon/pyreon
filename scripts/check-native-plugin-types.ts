#!/usr/bin/env bun
/**
 * Gate: every Swift/Kotlin type a library-owned native plugin names is DECLARED.
 *
 * A plugin's `services` say "`useShare` lowers to `PyreonShare()` /
 * `remember { PyreonShare(ctx) }`". Nothing in the compile gates proves
 * `PyreonShare` exists: the validation stubs declare it, so a type that lives
 * ONLY in a stub passes every check and then fails the real device build — the
 * phantom-capability class. This gate reads the plugin's service descriptors
 * (`verifyServiceTypes`) against the sources that really ship: the library's own
 * `native/{swift,kotlin}` plus the shared runtimes (`runtime-swift`,
 * `runtime-kotlin`), where some service types live.
 *
 * It fails on ANY finding, and on an empty source set (a gate that read nothing
 * proved nothing).
 *
 * Today the one library-owned plugin is `@pyreon/hooks`
 * (`packages/fundamentals/hooks/src/native-plugin.ts`).
 *
 * Usage: bun scripts/check-native-plugin-types.ts
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  verifyServiceTypes,
  type ServiceTypeFinding,
} from '../packages/native/compiler/src/plugin-verify'
import hooksPlugin from '../packages/fundamentals/hooks/src/native-plugin'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readSources(dir: string, extension: '.swift' | '.kt'): string[] {
  const texts: string[] = []
  // Directory entries carry their own type: no stat-then-read pair on a path
  // (CodeQL js/file-system-race).
  const walk = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (path.endsWith(extension)) texts.push(readFileSync(path, 'utf8'))
    }
  }
  walk(dir)
  return texts
}

export interface PluginTypeCheck {
  readonly findings: readonly ServiceTypeFinding[]
  readonly swiftFiles: number
  readonly kotlinFiles: number
}

/** Verify one plugin against its own native dirs plus the shared runtimes. */
export function checkPluginTypes(
  plugin: Parameters<typeof verifyServiceTypes>[0],
  ownNativeDir: string,
): PluginTypeCheck {
  const swiftSources = [
    ...readSources(join(ownNativeDir, 'swift'), '.swift'),
    ...readSources(join(REPO_ROOT, 'packages/native/runtime-swift/Sources'), '.swift'),
  ]
  const kotlinSources = [
    ...readSources(join(ownNativeDir, 'kotlin'), '.kt'),
    ...readSources(join(REPO_ROOT, 'packages/native/runtime-kotlin/src/main'), '.kt'),
  ]
  return {
    findings: verifyServiceTypes(plugin, { swiftSources, kotlinSources }),
    swiftFiles: swiftSources.length,
    kotlinFiles: kotlinSources.length,
  }
}

if (import.meta.main) {
  const result = checkPluginTypes(
    hooksPlugin,
    join(REPO_ROOT, 'packages/fundamentals/hooks/native'),
  )
  const hooks = Object.keys(hooksPlugin.services).length
  if (result.swiftFiles === 0 || result.kotlinFiles === 0 || hooks === 0) {
    console.error(
      `✗ check-native-plugin-types read nothing (swift files: ${result.swiftFiles}, kotlin files: ${result.kotlinFiles}, hooks: ${hooks}) — it would prove nothing.`,
    )
    process.exit(1)
  }
  if (result.findings.length > 0) {
    console.error(`✗ @pyreon/hooks native plugin names types that no shipped source declares:`)
    for (const f of result.findings)
      console.error(`  [${f.hook} / ${f.target}] ${f.name || '(none)'} — ${f.message}`)
    process.exit(1)
  }
  console.log(
    `✓ @pyreon/hooks native plugin: ${hooks} hooks, every Swift/Kotlin type declared (${result.swiftFiles} swift + ${result.kotlinFiles} kotlin files read)`,
  )
}
