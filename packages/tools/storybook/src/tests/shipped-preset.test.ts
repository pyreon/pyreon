/**
 * Contract for the SHIPPED preset — `lib/preset.js` and the exports map —
 * not the source module.
 *
 * This package's preset was broken for every consumer from inception, three
 * ways at once, while `preset.test.ts` stayed green: it imports
 * `../preset` (source), and vitest's transform provides a CJS-interop
 * `__dirname` that the shipped ESM never has. Storybook loads the BUILT
 * file as genuine ESM, where `join(__dirname, 'preview')` is a
 * ReferenceError → SB_CORE-SERVER_0002 CriticalPresetLoadError on any
 * `storybook build`/`dev`. The repo rule this violated: test the shipped
 * ENTRY, not the export (.claude/rules/testing.md — the pyreon-lint no-op
 * bin precedent). These specs import the artifact Storybook actually loads.
 *
 * Requires `lib/` to be built (CI test cells restore the bootstrap; locally
 * run `bun run --filter='@pyreon/storybook' build` first). The loud guard
 * below makes a missing build a FAILURE, not a silent skip.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LIB_PRESET = join(PKG_ROOT, 'lib', 'preset.js')

describe('shipped preset (lib/preset.js, loaded as genuine ESM)', () => {
  it('the built artifact exists — a missing build must fail loudly, never skip', () => {
    expect(existsSync(LIB_PRESET), `expected ${LIB_PRESET} — build the package first`).toBe(true)
  })

  // A REAL `node` subprocess, not an in-process import: vitest's transform
  // pipeline intercepts imports and its module URLs are not `file:` scheme,
  // which both masks the original `__dirname` crash AND breaks
  // `import.meta.url`-based paths — the exact environment-parity gap that
  // let the broken preset ship. The child writes its result to a FILE
  // (never stdout — subprocess stdout capture is non-deterministic under
  // parallel load, per .claude/rules/testing.md).
  function loadShippedPreset(): {
    previewAnnotations: string[]
    core: Record<string, string>
  } {
    const out = join(mkdtempSync(join(tmpdir(), 'pyreon-sb-preset-')), 'result.json')
    const script = `
      const m = await import(${JSON.stringify(pathToFileURL(LIB_PRESET).href)})
      const { writeFileSync } = await import('node:fs')
      writeFileSync(${JSON.stringify(out)}, JSON.stringify({ previewAnnotations: m.previewAnnotations, core: m.core }))
    `
    const r = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf-8' })
    expect(r.status, `node import of lib/preset.js failed:\n${r.stderr}`).toBe(0)
    return JSON.parse(readFileSync(out, 'utf-8'))
  }

  it('loads under GENUINE ESM and resolves previewAnnotations to an absolute sibling path', () => {
    // Pre-fix, the child process died with `ReferenceError: __dirname is
    // not defined` (SB_CORE-SERVER_0002 for every consumer).
    const preset = loadShippedPreset()
    expect(preset.previewAnnotations).toHaveLength(1)
    const annotation = preset.previewAnnotations[0]!
    expect(isAbsolute(annotation)).toBe(true)
    // Extensionless sibling of the built preset — lib/preview(.js) must be
    // the file it points at.
    expect(annotation).toBe(join(PKG_ROOT, 'lib', 'preview'))
    expect(existsSync(`${annotation}.js`)).toBe(true)
  })

  it('exports core.builder — Storybook dies with MissingBuilderError without one', () => {
    expect(loadShippedPreset().core).toEqual({
      builder: '@storybook/builder-vite',
      renderer: '@pyreon/storybook',
    })
  })
})

describe('exports map — CJS resolution (how Storybook’s preset loader resolves)', () => {
  // A consumer-shaped resolution: a temp project whose node_modules links
  // this package, resolved via createRequire. `./preview` used to carry only
  // bun/import/types conditions, so CJS resolution threw
  // ERR_PACKAGE_PATH_NOT_EXPORTED.
  const consumer = mkdtempSync(join(tmpdir(), 'pyreon-sb-consumer-'))
  mkdirSync(join(consumer, 'node_modules', '@pyreon'), { recursive: true })
  symlinkSync(PKG_ROOT, join(consumer, 'node_modules', '@pyreon', 'storybook'))
  const req = createRequire(join(consumer, 'main.js'))
  afterAll(() => rmSync(consumer, { recursive: true, force: true }))

  for (const [spec, target] of [
    ['@pyreon/storybook', 'lib/index.js'],
    ['@pyreon/storybook/preset', 'lib/preset.js'],
    ['@pyreon/storybook/preview', 'lib/preview.js'],
  ] as const) {
    it(`resolves ${spec} for CJS consumers`, () => {
      expect(req.resolve(spec)).toBe(join(PKG_ROOT, ...target.split('/')))
    })
  }
})
