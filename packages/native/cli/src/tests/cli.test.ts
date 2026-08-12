// Tests for the CLI's argv parsing + main() entry. We don't exec the
// bin via subprocess (slow, brittle) — we import main() and call it
// directly with a mocked argv. Output goes via console.error /
// console.log; tests capture both.

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../cli'

const HERE = dirname(fileURLToPath(import.meta.url))
const COMPILER_FIXTURES = resolve(HERE, '..', '..', '..', 'compiler', 'src', 'fixtures')

describe('@pyreon/native-cli main()', () => {
  let tempOut: string

  beforeEach(() => {
    tempOut = mkdtempSync(join(tmpdir(), 'pyreon-native-cli-main-test-'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    try {
      rmSync(tempOut, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort.
    }
    vi.restoreAllMocks()
  })

  it('returns 1 when no command is given', () => {
    expect(main([])).toBe(1)
  })

  it('returns 1 for an unknown command', () => {
    expect(main(['compile', '--target=ios'])).toBe(1)
  })

  it('returns 1 when --target is missing', () => {
    expect(main(['build', '--source=./src', '--out=./out'])).toBe(1)
  })

  it('returns 1 when --source is missing', () => {
    expect(main(['build', '--target=ios', '--out=./out'])).toBe(1)
  })

  it('returns 1 when --out is missing', () => {
    expect(main(['build', '--target=ios', '--source=./src'])).toBe(1)
  })

  it('returns 0 + writes .swift files for target=ios', () => {
    const code = main([
      'build',
      `--target=ios`,
      `--source=${COMPILER_FIXTURES}`,
      `--out=${tempOut}`,
    ])
    expect(code).toBe(0)
    const written = readdirSync(tempOut)
    expect(written.length).toBeGreaterThanOrEqual(7)
    expect(written.every((f) => f.endsWith('.swift'))).toBe(true)
  })

  it('returns 0 + writes .kt files for target=android', () => {
    const code = main([
      'build',
      `--target=android`,
      `--source=${COMPILER_FIXTURES}`,
      `--out=${tempOut}`,
    ])
    expect(code).toBe(0)
    const written = readdirSync(tempOut)
    expect(written.length).toBeGreaterThanOrEqual(7)
    expect(written.every((f) => f.endsWith('.kt'))).toBe(true)
  })

  it('accepts --target=swift as alias for ios', () => {
    expect(
      main(['build', '--target=swift', `--source=${COMPILER_FIXTURES}`, `--out=${tempOut}`]),
    ).toBe(0)
  })

  it('accepts --target=kotlin as alias for android', () => {
    expect(
      main(['build', '--target=kotlin', `--source=${COMPILER_FIXTURES}`, `--out=${tempOut}`]),
    ).toBe(0)
  })

  it('--kotlin-package=<fqn> prepends a `package` declaration to every emitted .kt file', () => {
    // CLI parity with the programmatic API. Required for Android hosts
    // that import the emitted Composable by FQN.
    const code = main([
      'build',
      '--target=android',
      `--source=${COMPILER_FIXTURES}`,
      `--out=${tempOut}`,
      '--kotlin-package=com.example.gen',
    ])
    expect(code).toBe(0)
    const written = readdirSync(tempOut).filter((f) => f.endsWith('.kt'))
    expect(written.length).toBeGreaterThanOrEqual(7)
    for (const file of written) {
      const content = readFileSync(join(tempOut, file), 'utf8')
      const firstLine = content.split('\n')[0] ?? ''
      expect(firstLine).toBe('package com.example.gen')
    }
  })

  it('returns 2 when source directory does not exist', () => {
    expect(
      main([
        'build',
        '--target=ios',
        '--source=/nonexistent/path/that/should/not/exist',
        `--out=${tempOut}`,
      ]),
    ).toBe(2)
  })

  it('--target=all builds BOTH targets into <out>/ios + <out>/android', () => {
    // The one-command "write once, ship every target" build. iOS Swift lands
    // in <out>/ios, Android Kotlin in <out>/android — cleanly separated.
    const code = main([
      'build',
      '--target=all',
      `--source=${COMPILER_FIXTURES}`,
      `--out=${tempOut}`,
    ])
    expect(code).toBe(0)
    const ios = readdirSync(join(tempOut, 'ios'))
    const android = readdirSync(join(tempOut, 'android'))
    expect(ios.length).toBeGreaterThanOrEqual(7)
    expect(ios.every((f) => f.endsWith('.swift'))).toBe(true)
    expect(android.length).toBeGreaterThanOrEqual(7)
    expect(android.every((f) => f.endsWith('.kt'))).toBe(true)
  })

  it('--target=all still requires --source and --out', () => {
    expect(main(['build', '--target=all', `--out=${tempOut}`])).toBe(1)
    expect(main(['build', '--target=all', `--source=${COMPILER_FIXTURES}`])).toBe(1)
  })

  it('--target=all forwards --kotlin-package to the android sub-build', () => {
    const code = main([
      'build',
      '--target=all',
      `--source=${COMPILER_FIXTURES}`,
      `--out=${tempOut}`,
      '--kotlin-package=com.example.allgen',
    ])
    expect(code).toBe(0)
    const android = readdirSync(join(tempOut, 'android')).filter((f) => f.endsWith('.kt'))
    expect(android.length).toBeGreaterThanOrEqual(7)
    const first = readFileSync(join(tempOut, 'android', android[0]!), 'utf8').split('\n')[0]
    expect(first).toBe('package com.example.allgen')
  })

  it('stage-web requires a native --target (ios | android)', () => {
    const webSrc = mkdtempSync(join(tmpdir(), 'pyreon-cli-web-'))
    // `web` is a valid `assets` target but NOT a stage-web target.
    expect(main(['stage-web', '--target=web', `--source=${webSrc}`, `--out=${tempOut}`])).toBe(1)
    expect(main(['stage-web', `--source=${webSrc}`, `--out=${tempOut}`])).toBe(1)
    rmSync(webSrc, { recursive: true, force: true })
  })

  it('stage-web requires --source and --out', () => {
    expect(main(['stage-web', '--target=ios', `--out=${tempOut}`])).toBe(1)
    expect(main(['stage-web', '--target=ios', `--source=./web`])).toBe(1)
  })

  it('stage-web copies a flat bundle into WebContent (ios) and returns 0', () => {
    const webSrc = mkdtempSync(join(tmpdir(), 'pyreon-cli-web-'))
    writeFileSync(join(webSrc, 'chart.html'), '<html></html>')
    writeFileSync(join(webSrc, 'chart.js'), 'x')
    const code = main(['stage-web', '--target=ios', `--source=${webSrc}`, `--out=${tempOut}`])
    expect(code).toBe(0)
    const staged = readdirSync(join(tempOut, 'WebContent')).sort()
    expect(staged).toEqual(['chart.html', 'chart.js'])
    rmSync(webSrc, { recursive: true, force: true })
  })

  // --- wire (native-source resolution) ---

  it('wire returns 1 when the app dir has no package.json', () => {
    expect(main(['wire', `--app=${tempOut}`])).toBe(1)
  })

  it('wire --android-out writes the resolved srcDirs file and returns 0', () => {
    const app = mkdtempSync(join(tmpdir(), 'pyreon-cli-wire-'))
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { '@pyreon/native-runtime-kotlin': 'latest' } }),
    )
    const nm = join(app, 'node_modules', '@pyreon', 'native-runtime-kotlin')
    const ktDir = join(nm, 'src', 'main', 'kotlin')
    require('node:fs').mkdirSync(ktDir, { recursive: true })
    writeFileSync(
      join(nm, 'package.json'),
      JSON.stringify({ name: '@pyreon/native-runtime-kotlin', pyreon: { native: { kotlin: { dir: 'src/main/kotlin' } } } }),
    )
    const outFile = join(app, 'android', 'pyreon-native.srcdirs')
    const code = main(['wire', `--app=${app}`, `--android-out=${outFile}`])
    expect(code).toBe(0)
    const dirs = readFileSync(outFile, 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
    expect(dirs).toEqual([ktDir])
    rmSync(app, { recursive: true, force: true })
  })

  it('wire returns 2 when a package declares a native dir that is missing', () => {
    const app = mkdtempSync(join(tmpdir(), 'pyreon-cli-wire-broken-'))
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { '@pyreon/query': 'latest' } }),
    )
    const nm = join(app, 'node_modules', '@pyreon', 'query')
    require('node:fs').mkdirSync(nm, { recursive: true })
    writeFileSync(
      join(nm, 'package.json'),
      JSON.stringify({ name: '@pyreon/query', pyreon: { native: { swift: { dir: 'native/swift' } } } }),
    )
    expect(main(['wire', `--app=${app}`])).toBe(2)
    rmSync(app, { recursive: true, force: true })
  })
})
