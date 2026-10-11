import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface CommandResult {
  status: number | null
  stdout?: string | null
  stderr?: string | null
  error?: Error | undefined
}

type RunCommand = (command: string, args: readonly string[]) => CommandResult

const runCommand: RunCommand = (command, args) => spawnSync(command, args, { encoding: 'utf8' })

/** Compile and execute one smoke test without sharing its binary with another gate run. */
export function runSwiftSmoke(
  sources: readonly string[],
  tests: readonly string[],
  run: RunCommand = runCommand,
): CommandResult & { phase: 'compile' | 'run' } {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-cosource-'))
  const bin = join(dir, 'smoke')
  try {
    // The test supplies @main; source files are ordinary library types.
    const compile = run('swiftc', ['-parse-as-library', ...sources, ...tests, '-o', bin])
    if (compile.status !== 0) return { ...compile, phase: 'compile' }
    return { ...run(bin, []), phase: 'run' }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
