/**
 * `atlas build` when the scan pipeline fails, and when the JSX plugin is not
 * a plugin.
 *
 * Both are degradation seams that a correctly installed project cannot reach,
 * and both decide what a DEPLOYED site contains:
 *
 *   * A failed pipeline falls back to the static walk and SAYS SO, rather than
 *     emitting a thin site that looks like the project simply has few
 *     components. That site deploys cleanly, which is what makes silence here
 *     expensive.
 *   * A package that exported something other than a factory gets a sentence,
 *     not `factory is not a function` thrown from inside a bundler config.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mutable so one spec can make the pipeline throw something that is NOT an
// Error — the reason the notice reads `err instanceof Error ? … : String(err)`.
const thrown = vi.hoisted(() => ({ asString: false }))

vi.mock('../../cli/run', () => ({
  runScan: () => {
    if (thrown.asString) throw 'a bare string, not an Error'
    throw new Error('the loader exploded')
  },
}))

import { buildStatic } from '../static'

const INSTALLED = resolve(__dirname, '../../../../../../examples/atlas-workshop')

let root: string

beforeEach(() => {
  thrown.asString = false
  root = mkdtempSync(join(tmpdir(), 'atlas-build-degraded-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  for (const entry of readdirSync(join(INSTALLED, 'node_modules'))) {
    symlinkSync(join(INSTALLED, 'node_modules', entry), join(root, 'node_modules', entry))
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, type: 'module' }),
    'utf8',
  )
  writeFileSync(
    join(root, 'src', 'Hello.tsx'),
    'export function Hello(props: { name?: string }) {\n  return props.name ?? null\n}\n',
    'utf8',
  )
})

afterEach(() => {
  vi.doUnmock('@pyreon/vite-plugin')
  vi.doUnmock('vite')
  vi.doUnmock('@pyreon/compiler')
  rmSync(root, { recursive: true, force: true })
})

describe('a scan pipeline that throws', () => {
  it('falls back to the static walk, still emits a site, and names what was lost', async () => {
    const logs: string[] = []
    const result = await buildStatic({ cwd: root, out: 'dist', onLog: (m) => logs.push(m) })

    const said = logs.join('\n')
    expect(said).toContain('the scan pipeline failed')
    expect(said).toContain('no rocketstyle discovery, no scenarios, no atlas.config.ts')
    expect(said).toContain('the loader exploded')

    // A site, not an excuse: the static walk found the component and the
    // build emitted its page.
    expect(result.components).toBe(1)
    expect(readFileSync(join(root, 'dist', 'index.html'), 'utf8')).toContain('atlas-root')
    expect(readdirSync(join(root, 'dist'))).toContain('hello')
  }, 300_000)
})

describe('a pipeline that throws something that is not an Error', () => {
  it('still names the cause rather than logging an object', async () => {
    thrown.asString = true
    const logs: string[] = []
    const result = await buildStatic({ cwd: root, out: 'dist', onLog: (m) => logs.push(m) })
    expect(logs.join('\n')).toContain('a bare string, not an Error')
    expect(result.components).toBe(1)
  }, 300_000)
})

describe('a panel that could not be baked', () => {
  it('records it as a warning instead of shipping a dark panel silently', async () => {
    // The whole reason the build bakes: a static site has no Node, so a panel
    // whose answer is missing is permanently dark and looks like a panel with
    // nothing to say. The answer is stored as an ERROR and the failure is
    // reported, per component and per method.
    vi.doMock('@pyreon/compiler', () => {
      throw new Error('Cannot find package')
    })
    const logs: string[] = []
    const result = await buildStatic({ cwd: root, out: 'dist', onLog: (m) => logs.push(m) })

    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.join('\n')).toContain('lens(Hello)')
    // Warnings go to the log too, so a CI build shows them without anyone
    // inspecting the return value.
    expect(logs.join('\n')).toContain('lens(Hello)')
    // And the site is still emitted — one dark panel is not a reason to have
    // no documentation.
    expect(readFileSync(join(root, 'dist', 'index.html'), 'utf8')).toContain('atlas-root')
  }, 300_000)
})

describe('the plugin factory', () => {
  it('REFUSES a package that exports no factory, naming the package', async () => {
    // `default: undefined` is spelled out because vitest's mock namespace
    // THROWS on a missing export rather than returning undefined, so BOTH names
    // the product reads (`mod.default ?? mod.pyreon`) have to be spelled out for
    // the absent case to be expressible at all.
    vi.doMock('@pyreon/vite-plugin', () => ({ default: undefined, pyreon: undefined, somethingElse: 1 }))
    await expect(buildStatic({ cwd: root, out: 'dist' })).rejects.toThrow(
      /@pyreon\/vite-plugin did not export a plugin factory/,
    )
  }, 300_000)
})

describe('when the tools are not installed', () => {
  it('names Vite, and says the scan does not need it', async () => {
    vi.doMock('vite', () => {
      throw new Error('Cannot find package')
    })
    await expect(buildStatic({ cwd: root, out: 'dist' })).rejects.toThrow(
      /atlas build needs Vite[\s\S]*bun add -d vite @pyreon\/vite-plugin/,
    )
  }, 300_000)

  it('names the JSX plugin when THAT is what is missing', async () => {
    vi.doMock('@pyreon/vite-plugin', () => {
      throw new Error('Cannot find package')
    })
    await expect(buildStatic({ cwd: root, out: 'dist' })).rejects.toThrow(
      /@pyreon\/vite-plugin is not installed/,
    )
  }, 300_000)
})
