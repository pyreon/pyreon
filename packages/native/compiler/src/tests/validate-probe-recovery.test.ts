import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  _resetObservationCache,
  _resetSwiftcCache,
  validateSwiftFilesWithStubs,
  validateSwiftWithStubs,
} from '../validate'
import { _resetValidateCache, readToolProbe, writeToolProbe } from '../validate-cache'

let realSwift: string | undefined
let sdkRoot: string | undefined
try {
  const find =
    process.platform === 'darwin'
      ? (['xcrun', ['--find', 'swiftc']] as const)
      : (['which', ['swiftc']] as const)
  realSwift = execFileSync(find[0], [...find[1]], { encoding: 'utf8', timeout: 20_000 }).trim()
  if (process.platform === 'darwin')
    sdkRoot = execFileSync('xcrun', ['--show-sdk-path'], {
      encoding: 'utf8',
      timeout: 20_000,
    }).trim()
} catch {}
const envKeys = [
  'PATH',
  'SDKROOT',
  'PYREON_VALIDATE_CACHE_DIR',
  'PYREON_VALIDATE_NO_CACHE',
  'PYREON_REQUIRE_NATIVE_VALIDATE',
  'PYREON_SKIP_NATIVE_VALIDATE',
] as const
let saved: Map<string, string | undefined> | undefined
let scratch: string | undefined

afterEach(() => {
  for (const [key, value] of saved ?? []) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  _resetSwiftcCache()
  _resetObservationCache()
  _resetValidateCache()
  if (scratch) rmSync(scratch, { recursive: true, force: true })
})

describe('native capability recovery through real child processes', () => {
  it.skipIf(!realSwift || process.platform === 'win32').each(['single', 'module'] as const)(
    '%s-file validation rejects an interrupted probe, retries and compiles real Observation source',
    (mode) => {
      saved = new Map(envKeys.map((key) => [key, process.env[key]]))
      scratch = mkdtempSync(join(tmpdir(), 'pyreon-probe-recovery-'))
      const binary = join(scratch, 'swiftc')
      const marker = join(scratch, 'interrupted')
      writeFileSync(
        binary,
        `#!${process.execPath}
const fs = require('node:fs'); const cp = require('node:child_process');
const args = process.argv.slice(2);
if (args.some(arg => arg.includes('pyreon-observation-probe-')) && !fs.existsSync(${JSON.stringify(marker)})) {
  fs.writeFileSync(${JSON.stringify(marker)}, 'interrupted');
  process.kill(process.pid, 'SIGTERM');
} else {
  const result = cp.spawnSync(${JSON.stringify(realSwift)}, args, { stdio: 'inherit' });
  if (result.error) console.error(result.error);
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exit(result.status ?? 1);
}
`,
      )
      chmodSync(binary, 0o755)
      process.env.PATH = `${dirname(binary)}:${process.env.PATH ?? ''}`
      process.env.PYREON_VALIDATE_CACHE_DIR = join(scratch, 'cache')
      if (sdkRoot) process.env.SDKROOT = sdkRoot
      process.env.PYREON_REQUIRE_NATIVE_VALIDATE = '1'
      delete process.env.PYREON_VALIDATE_NO_CACHE
      delete process.env.PYREON_SKIP_NATIVE_VALIDATE
      _resetSwiftcCache()
      _resetObservationCache()
      _resetValidateCache()
      // A historical interrupted probe may already have persisted this lie.
      writeToolProbe('swiftc', { available: false, version: '' }, 'observation')
      const source = '@Observable final class Example { var count: Int = 0 }\n'
      const validate = () =>
        mode === 'single' ? validateSwiftWithStubs(source) : validateSwiftFilesWithStubs([source])
      const interrupted = validate()
      expect(interrupted).toMatchObject({ ok: false, transient: true })
      expect(interrupted.skipped).not.toBe(true)
      const recovered = validate()
      expect(recovered.ok, recovered.error).toBe(true)
      expect(recovered.skipped).not.toBe(true)
      expect(readToolProbe('swiftc', 'observation')?.available).toBe(true)
    },
  )
})
