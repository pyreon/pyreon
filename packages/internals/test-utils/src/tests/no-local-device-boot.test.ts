// Local runs never boot an iOS Simulator or an Android emulator by default.
//
// Device lanes cost minutes and gigabytes (an idle emulator holds ~3.5 GB), and
// several agent sessions share one Mac. CI's native-device.yml owns every
// device run as a required check. Locally, a device run is always explicit: a
// named script under examples/*/scripts (geo-device-test.sh,
// push-device-test.sh), or `pyreon native dev`.
//
// This locks the default entry points: every package.json script (`bun run
// test`, the pre-push hook's per-package test, any `bun run <x>`), the git
// hooks, and the vitest / playwright configs. A script that does need a device
// must be gated on `PYREON_DEVICE_TESTS=1` and be listed in the CI job that
// runs it.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../../../../..')

/** Commands that boot or drive a simulator/emulator (not plain compiles). */
const DEVICE_COMMAND =
  /\bsimctl\s+(boot|bootstatus)\b|\bxcodebuild\s+(?:[^;&|\n'"]*\s)?(test|test-without-building)(?=\s|$)|\bemulator\s+-avd\b|\bconnected(Check|AndroidTest)\b|\badb\s+(install|shell|emu)\b/

const OPT_IN = /\bPYREON_DEVICE_TESTS\b/

function unguardedDeviceCommand(text: string): boolean {
  return DEVICE_COMMAND.test(text) && !OPT_IN.test(text)
}

function tracked(...pathspecs: string[]): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

describe('unguardedDeviceCommand', () => {
  it('flags simulator boots, device test runs and emulator launches', () => {
    expect(unguardedDeviceCommand('xcrun simctl boot "$UDID"')).toBe(true)
    expect(unguardedDeviceCommand('xcodebuild test -scheme App -destination id=X')).toBe(true)
    expect(unguardedDeviceCommand('xcodebuild -scheme App test-without-building')).toBe(true)
    expect(unguardedDeviceCommand('emulator -avd Pixel_6 -no-window')).toBe(true)
    expect(unguardedDeviceCommand('gradle connectedCheck')).toBe(true)
    expect(unguardedDeviceCommand('adb install app.apk')).toBe(true)
  })

  it('allows compile-only toolchain use and prose that merely names a tool', () => {
    expect(unguardedDeviceCommand("echo 'device-tested via xcodebuild (CI); no node test surface'")).toBe(false)
    expect(unguardedDeviceCommand('xcodebuild build -destination generic/platform=iOS')).toBe(false)
    expect(unguardedDeviceCommand('swift test')).toBe(false)
    expect(unguardedDeviceCommand('gradle assembleDebug')).toBe(false)
    expect(unguardedDeviceCommand('kotlinc -script verify.kts')).toBe(false)
  })

  it('allows a device command behind the explicit opt-in', () => {
    expect(
      unguardedDeviceCommand('if [ "$PYREON_DEVICE_TESTS" = 1 ]; then gradle connectedCheck; fi'),
    ).toBe(false)
  })
})

describe('default local entry points never boot a device', () => {
  it('no package.json script runs a device command without PYREON_DEVICE_TESTS', () => {
    const offenders: string[] = []
    const manifests = tracked('package.json', '**/package.json').filter(
      (f) => !f.includes('node_modules/') && !f.includes('/fixtures/'),
    )
    expect(manifests.length).toBeGreaterThan(50)
    for (const file of manifests) {
      const pkg = JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as {
        scripts?: Record<string, string>
      }
      for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
        if (unguardedDeviceCommand(cmd)) offenders.push(`${file} → scripts.${name}: ${cmd}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('no git hook or test-runner config runs a device command', () => {
    const files = tracked('.githooks/*', '**/vitest.config.ts', '**/vitest.*.config.ts', '**/playwright.config.ts')
    expect(files).toContain('.githooks/pre-push')
    const offenders = files.filter((f) => unguardedDeviceCommand(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
