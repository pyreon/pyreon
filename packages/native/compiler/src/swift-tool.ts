// Every Swift toolchain spawn in the repo goes through this module.
//
// The Swift driver (`swiftc`, and `swift` for SwiftPM) creates its own
// `TemporaryDirectory.XXXXXX` under `$TMPDIR` on EVERY invocation, including
// `swiftc --version`, and does not remove it. The call sites already compile
// inside a `mkdtemp` directory that they delete in `finally`, but the driver's
// directory is not inside it: it lands at the top of the shared temp directory.
// About 7,000 of them were found on one development machine.
//
// So each spawn gets a private `TMPDIR` that is deleted when the process exits.
// A raw `execFileSync('swiftc', …)` outside this module is rejected by
// `swift-tool-spawn-policy.test.ts` (in `@pyreon/test-utils`), so a new call
// site cannot forget it.
import {
  execFileSync,
  spawnSync,
  type ExecFileSyncOptions,
  type ExecFileSyncOptionsWithStringEncoding,
  type SpawnSyncOptions,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Swift toolchain executables whose driver writes into `$TMPDIR`. */
export type SwiftTool = 'swiftc' | 'swift' | 'xcrun'

/** Prefix of the private `TMPDIR` each spawn gets (removed after the spawn). */
export const SWIFT_TOOL_TMP_PREFIX = 'pyreon-swift-tmp-'

function withPrivateTmp<T>(
  env: NodeJS.ProcessEnv | undefined,
  run: (env: NodeJS.ProcessEnv) => T,
): T {
  const dir = mkdtempSync(join(tmpdir(), SWIFT_TOOL_TMP_PREFIX))
  try {
    return run({ ...(env ?? process.env), TMPDIR: dir })
  } finally {
    // `rmSync` does not follow symlinks out of `dir`; it unlinks them.
    rmSync(dir, { recursive: true, force: true })
  }
}

/** `execFileSync` for a Swift tool, with a private `TMPDIR` the driver's scratch goes into. */
export function execSwiftToolSync(
  command: SwiftTool,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding,
): string
export function execSwiftToolSync(
  command: SwiftTool,
  args: readonly string[],
  options?: ExecFileSyncOptions,
): string | Buffer
export function execSwiftToolSync(
  command: SwiftTool,
  args: readonly string[],
  options: ExecFileSyncOptions = {},
): string | Buffer {
  return withPrivateTmp(options.env, (env) => execFileSync(command, args, { ...options, env }))
}

/** `spawnSync` for a Swift tool, with a private `TMPDIR` the driver's scratch goes into. */
export function spawnSwiftToolSync(
  command: SwiftTool,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
): SpawnSyncReturns<string>
export function spawnSwiftToolSync(
  command: SwiftTool,
  args: readonly string[],
  options?: SpawnSyncOptions,
): SpawnSyncReturns<string | Buffer>
export function spawnSwiftToolSync(
  command: SwiftTool,
  args: readonly string[],
  options: SpawnSyncOptions = {},
): SpawnSyncReturns<string | Buffer> {
  return withPrivateTmp(options.env, (env) => spawnSync(command, args, { ...options, env }))
}
