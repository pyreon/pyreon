/**
 * Real-build verification gate for the perf advisor.
 *
 * Runs an ACTUAL `vite build` of a tiny app with `perfAdvisorPlugin` in the
 * chain and asserts the plugin's `closeBundle` read the real Vite manifest,
 * ran the checks, and wrote `dist/_pyreon-perf-advisor.json` with the
 * expected findings. This is the layer fixture tests can't cover — it proves
 * the manifest path, the dist file reads, and the closeBundle wiring all
 * work against real Vite output (not a hand-authored manifest).
 */
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { describe, expect, it } from 'vitest'
import { perfAdvisorPlugin } from '../perf-advisor-plugin'

describe('perfAdvisorPlugin — real vite build', () => {
  it('emits dist/_pyreon-perf-advisor.json with route-js-budget + cls-footgun findings', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'pyreon-advisor-build-')))
    try {
      await writeFile(
        join(dir, 'index.html'),
        '<!doctype html><html><head></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>',
      )
      // CSS with the CLS footgun — imported by the entry so Vite attributes it
      // to the entry chunk's `css` in the manifest.
      await writeFile(join(dir, 'app.css'), '.box{display:block;content-visibility:auto}')
      await writeFile(
        join(dir, 'main.js'),
        "import './app.css'\nexport const greeting = 'hello world '.repeat(40)\nconsole.log(greeting)\n",
      )

      await build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        // jsBudget: 1 → the entry's JS closure is over budget for certain.
        plugins: [perfAdvisorPlugin({ jsBudget: 1 })],
        build: { outDir: 'dist', write: true, emptyOutDir: true },
      })

      const raw = await readFile(join(dir, 'dist', '_pyreon-perf-advisor.json'), 'utf8')
      const artifact = JSON.parse(raw) as {
        routes: Array<{ path: string; findings: Array<{ check: string }> }>
      }
      const checks = artifact.routes.flatMap((r) => r.findings.map((f) => f.check))
      expect(checks).toContain('route-js-budget')
      expect(checks).toContain('cls-footgun')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('writes NO artifact on a clean build (generous budget, no footgun)', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'pyreon-advisor-clean-')))
    try {
      await writeFile(
        join(dir, 'index.html'),
        '<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>',
      )
      await writeFile(join(dir, 'main.js'), "export const x = 1\nconsole.log('ok')\n")
      await build({
        root: dir,
        configFile: false,
        logLevel: 'silent',
        plugins: [perfAdvisorPlugin({ jsBudget: 10_000_000 })],
        build: { outDir: 'dist', write: true, emptyOutDir: true },
      })
      const exists = await readFile(join(dir, 'dist', '_pyreon-perf-advisor.json'), 'utf8').then(
        () => true,
        () => false,
      )
      expect(exists).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
