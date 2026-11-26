#!/usr/bin/env bun
/**
 * swift-package — run SwiftPM (`swift build` / `swift test`) for a Swift
 * package in this repo, with a private `TMPDIR` that is removed afterwards.
 *
 * Usage (from the package directory, as its package.json scripts do):
 *   bun ../../../scripts/swift-package.ts build|test|typecheck
 *
 * The Swift driver leaves a `TemporaryDirectory.XXXXXX` in `$TMPDIR` on every
 * invocation and never removes it. `packages/native/compiler/src/swift-tool.ts`
 * fixed that for the compiler's own spawns (#4679), but the SwiftPM packages'
 * `build` / `test` / `typecheck` scripts ran a bare `swift build`, and
 * `bun install` (bootstrap) runs every `build` script. This goes through the
 * same helper, so it has the same contract: one private `TMPDIR` per spawn,
 * deleted when the process exits. `swift-tool-spawn-policy.test.ts` rejects a
 * package.json script that runs `swift` / `swiftc` directly.
 *
 * SwiftUI is Darwin-only: on another OS, or without `swift` on PATH, it prints
 * a skip line and exits 0 (the behaviour the inline scripts had).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSwiftToolSync } from '../packages/native/compiler/src/swift-tool'

/** package.json script name → SwiftPM subcommand. `typecheck` is a build. */
const SUBCOMMAND = { build: 'build', test: 'test', typecheck: 'build' } as const
type Action = keyof typeof SUBCOMMAND

function isAction(value: string | undefined): value is Action {
  return value !== undefined && Object.hasOwn(SUBCOMMAND, value)
}

/** Whether `swift` resolves on PATH. */
function swiftOnPath(): boolean {
  return Bun.which('swift') !== null
}

function packageLabel(cwd: string): string {
  try {
    const pkg: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
    if (typeof pkg === 'object' && pkg !== null && 'name' in pkg && typeof pkg.name === 'string') {
      return pkg.name.replace(/^@pyreon\//, '')
    }
  } catch {
    // Fall through to the directory name.
  }
  return cwd.split('/').pop() ?? 'swift-package'
}

if (import.meta.main) {
  const action = process.argv[2]
  if (!isAction(action)) {
    console.error(
      `[Pyreon] swift-package: unknown action ${JSON.stringify(action)}. Use one of: ${Object.keys(SUBCOMMAND).join(', ')}.`,
    )
    process.exit(2)
  }
  const cwd = process.cwd()
  const label = packageLabel(cwd)
  if (process.platform !== 'darwin' || !swiftOnPath()) {
    console.log(
      `[${label}] non-Darwin or no swift on PATH; skipping ${action} (SwiftUI is Darwin-only)`,
    )
    process.exit(0)
  }
  const r = spawnSwiftToolSync('swift', [SUBCOMMAND[action]], { cwd, stdio: 'inherit' })
  if (r.error) {
    console.error(`[Pyreon] swift-package: could not run swift ${SUBCOMMAND[action]}: ${r.error.message}`)
    process.exit(1)
  }
  process.exit(r.status ?? 1)
}
