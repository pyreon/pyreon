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

const record = `${'a'.repeat(64)}.json`
const probe = `probe-${'b'.repeat(64)}.json`

describe('native verdict cache snapshots', () => {
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
