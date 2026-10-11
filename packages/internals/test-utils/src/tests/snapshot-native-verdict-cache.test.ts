import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { snapshotNativeVerdicts } from '../../../../../scripts/snapshot-native-verdict-cache'
import {
  readVerdict,
  verdictKey,
  writeVerdict,
} from '../../../../native/runtime-kotlin/scripts/verdict-cache'

const record = `${'a'.repeat(64)}.json`
const probe = `probe-${'b'.repeat(64)}.json`

describe('native verdict cache snapshots', () => {
  it('restores real runtime verdicts in their namespace alongside a same-named compiler record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-verdict-stores-'))
    const live = join(dir, 'live')
    const archive = join(dir, 'archive')
    const restored = join(dir, 'restored')
    vi.stubEnv('PYREON_VALIDATE_CACHE_DIR', live)
    vi.stubEnv('PYREON_VALIDATE_NO_CACHE', '0')
    try {
      const key = verdictKey({
        compilerVersion: 'fixture',
        harness: 'runner',
        source: 'service',
        test: 'behavior',
        typecheckOnly: false,
        smokeRuns: true,
      })
      writeVerdict(key, { ok: true })
      writeFileSync(join(live, `${key}.json`), '{"v":2,"ok":false,"error":"compiler control"}')
      const runtime = join(live, 'kotlin-runtime')
      writeFileSync(join(runtime, '.in-flight.tmp'), '{')
      writeFileSync(join(runtime, `${'c'.repeat(64)}.json`), '{')
      writeFileSync(join(runtime, 'daemon.jar'), 'binary')
      symlinkSync(join(live, `${key}.json`), join(runtime, `${'d'.repeat(64)}.json`))
      mkdirSync(join(live, 'unrelated'))
      writeFileSync(join(live, 'unrelated', record), '{"ok":true}')
      expect(snapshotNativeVerdicts(live, archive)).toBe(2)
      expect(snapshotNativeVerdicts(archive, restored)).toBe(2)
      expect(readdirSync(join(restored, 'kotlin-runtime'))).toEqual([`${key}.json`])
      expect(existsSync(join(restored, 'unrelated'))).toBe(false)
      expect(JSON.parse(readFileSync(join(restored, `${key}.json`), 'utf8')).ok).toBe(false)
      vi.stubEnv('PYREON_VALIDATE_CACHE_DIR', restored)
      expect(readVerdict(key)).toEqual({ ok: true })
    } finally {
      vi.unstubAllEnvs()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not follow a runtime-store directory symlink', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-verdict-linked-store-'))
    try {
      const live = join(dir, 'live')
      const external = join(dir, 'external')
      mkdirSync(live)
      mkdirSync(external)
      writeFileSync(join(external, record), '{"ok":true}')
      symlinkSync(external, join(live, 'kotlin-runtime'))
      expect(snapshotNativeVerdicts(live, join(dir, 'archive'))).toBe(0)
      expect(readdirSync(join(dir, 'archive'))).toEqual([])
      expect(readFileSync(join(external, record), 'utf8')).toBe('{"ok":true}')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps complete records and probes while excluding temp files, binaries, malformed records and symlinks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-verdict-snapshot-'))
    try {
      const live = join(dir, 'live')
      const archive = join(dir, 'archive')
      mkdirSync(live)
      mkdirSync(archive)
      writeFileSync(join(live, record), '{"ok":true}')
      writeFileSync(join(live, probe), '{"available":true,"version":"test"}')
      writeFileSync(join(live, `${'c'.repeat(64)}.json`), '{')
      writeFileSync(join(live, '.in-flight.tmp'), '{')
      writeFileSync(join(live, 'kotlin-daemon.jar'), 'binary')
      writeFileSync(join(dir, 'external.json'), '{"secret":"never copy"}')
      symlinkSync(join(dir, 'external.json'), join(live, `${'d'.repeat(64)}.json`))
      writeFileSync(join(archive, 'stale.json'), '{}')
      expect(snapshotNativeVerdicts(live, archive)).toBe(2)
      expect(readdirSync(archive).sort()).toEqual([record, probe].sort())
      expect(readFileSync(join(archive, record), 'utf8')).toBe('{"ok":true}')
      const restored = join(dir, 'restored')
      expect(snapshotNativeVerdicts(archive, restored)).toBe(2)
      expect(readFileSync(join(restored, probe), 'utf8')).toBe(
        readFileSync(join(live, probe), 'utf8'),
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles a cold cache and refuses overlapping directories before modifying either', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-verdict-snapshot-'))
    try {
      const live = join(dir, 'live')
      const archive = join(dir, 'archive')
      expect(snapshotNativeVerdicts(live, archive)).toBe(0)
      expect(existsSync(archive)).toBe(true)
      expect(() => snapshotNativeVerdicts(archive, archive)).toThrow('separate directories')
      expect(() => snapshotNativeVerdicts(archive, join(archive, '..child'))).toThrow(
        'separate directories',
      )
      expect(() => snapshotNativeVerdicts(archive, dir)).toThrow('separate directories')
      expect(existsSync(archive)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('archives an immutable snapshot while a real atomic writer remains active', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-verdict-snapshot-'))
    const live = join(dir, 'live')
    const archive = join(dir, 'archive')
    mkdirSync(live)
    const writer = spawn(
      process.execPath,
      [
        '-e',
        `
      const fs = require('node:fs'); const path = require('node:path');
      let counter = 0;
      function write() {
        const temp = path.join(process.argv[1], '.in-flight.tmp');
        fs.writeFileSync(temp, JSON.stringify({ ok: true, counter: ++counter, error: 'x'.repeat(32768) }));
        fs.renameSync(temp, path.join(process.argv[1], process.argv[2]));
        process.send(counter);
        setTimeout(write, 2);
      }
      write();
    `,
        live,
        record,
      ],
      { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
    )
    try {
      await once(writer, 'message')
      expect(snapshotNativeVerdicts(live, archive)).toBe(1)
      const captured = readFileSync(join(archive, record), 'utf8')
      const counter = JSON.parse(captured).counter as number
      for (let i = 0; i < 5; i++) await once(writer, 'message')
      expect(JSON.parse(readFileSync(join(live, record), 'utf8')).counter).toBeGreaterThan(counter)
      const tarball = join(dir, 'snapshot.tar')
      execFileSync('tar', ['-cf', tarball, '-C', dir, 'archive'], { timeout: 30_000 })
      const restored = join(dir, 'restored')
      mkdirSync(restored)
      execFileSync('tar', ['-xf', tarball, '-C', restored], { timeout: 30_000 })
      expect(readFileSync(join(restored, 'archive', record), 'utf8')).toBe(captured)
      expect(readFileSync(join(archive, record), 'utf8')).toBe(captured)
    } finally {
      if (writer.exitCode === null && writer.signalCode === null) {
        const exited = once(writer, 'exit')
        writer.kill('SIGTERM')
        await exited
      }
      rmSync(dir, { recursive: true, force: true })
    }
  }, 45_000)
})
