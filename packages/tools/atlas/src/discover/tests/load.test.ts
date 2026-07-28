/**
 * Module loading and project config — the on-ramp to every runtime check.
 *
 * The rules under test are mostly about what NOT to do: never guess which
 * export is the component, never overwrite a component the catalog already
 * carries, never treat a broken config as an absent one.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { defineComponent } from '../../auto'
import { loadAtlasConfig } from '../config'
import { componentLoaderPlugin, loadComponent, runtimeLoader } from '../load'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-load-'))
  dirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A plain `.js` module — the runtime loader compiles nothing, so no JSX here. */
const writeModule = (dir: string, name: string, code: string): string => {
  const file = join(dir, name)
  writeFileSync(file, code)
  return file
}

describe('loadComponent', () => {
  it('finds the export discovery recorded', async () => {
    const dir = tempDir()
    const file = writeModule(dir, 'a.js', 'export const Button = () => null\n')
    expect((await loadComponent(file, 'Button')).component).toBeTypeOf('function')
  })

  it('falls back to the default export', async () => {
    const dir = tempDir()
    const file = writeModule(dir, 'b.js', 'export default () => null\n')
    expect((await loadComponent(file, 'Whatever')).component).toBeTypeOf('function')
  })

  it('does NOT guess when neither is present, even with one obvious candidate', async () => {
    // Attaching "the only function export" would mount one component and report
    // the verdict under another component's name — a confidently wrong catalog
    // is worse than an incomplete one.
    const dir = tempDir()
    const file = writeModule(dir, 'c.js', 'export const Something = () => null\n')
    const result = await loadComponent(file, 'Button')
    expect(result.component).toBeUndefined()
    expect(result.reason).toContain('no callable export named "Button"')
  })

  it('reports an import failure as a reason, never a throw', async () => {
    const result = await loadComponent(join(tempDir(), 'missing.js'), 'X')
    expect(result.component).toBeUndefined()
    expect(result.reason).toContain('could not import')
  })
})

describe('componentLoaderPlugin', () => {
  const ctx = { cwd: '.' }

  it('attaches the component to scanned intelligence', async () => {
    const dir = tempDir()
    const file = writeModule(dir, 'd.js', 'export const Card = () => null\n')
    const ci = { ...defineComponent('Card'), source: file }
    const out = await componentLoaderPlugin(runtimeLoader()).decorate!(ci, ctx)
    expect(out.component).toBeTypeOf('function')
  })

  it('leaves an already-carried component alone', async () => {
    // An authored catalog passed the function directly. Re-importing would put
    // a SECOND module instance in the graph — same source, different identity,
    // and any context the two share silently splits.
    const dir = tempDir()
    const file = writeModule(dir, 'e.js', 'export const Card = () => "from disk"\n')
    const original = () => 'authored'
    const ci = { ...defineComponent('Card', { component: original }), source: file }
    const out = await componentLoaderPlugin(runtimeLoader()).decorate!(ci, ctx)
    expect(out.component).toBe(original)
  })

  it('passes intelligence through untouched when there is no source', async () => {
    const ci = defineComponent('Card')
    expect(await componentLoaderPlugin(runtimeLoader()).decorate!(ci, ctx)).toBe(ci)
  })

  it('leaves the component undefined when the module cannot be loaded', async () => {
    // A skip, not a failure: the check that would have mounted reports "nothing
    // ran" rather than inventing a verdict.
    const ci = { ...defineComponent('Card'), source: join(tempDir(), 'nope.js') }
    const out = await componentLoaderPlugin(runtimeLoader()).decorate!(ci, ctx)
    expect(out.component).toBeUndefined()
  })
})

describe('loadAtlasConfig', () => {
  it('returns nothing at all when a project has no config', async () => {
    const loaded = await loadAtlasConfig(tempDir())
    expect(loaded.config).toEqual({})
    expect(loaded.path).toBeUndefined()
    expect(loaded.error).toBeUndefined()
  })

  it('reads a named `wrapper` export', async () => {
    const dir = tempDir()
    writeModule(dir, 'atlas.config.js', 'export const wrapper = (props) => props.children\n')
    const loaded = await loadAtlasConfig(dir)
    expect(loaded.config.wrapper).toBeTypeOf('function')
    expect(loaded.path).toContain('atlas.config.js')
  })

  it('reads a wrapper off a default export', async () => {
    const dir = tempDir()
    writeModule(dir, 'atlas.config.js', 'export default { wrapper: (props) => props.children }\n')
    expect((await loadAtlasConfig(dir)).config.wrapper).toBeTypeOf('function')
  })

  it('reports a config that EXISTS but is broken, rather than pretending it is absent', async () => {
    // A project that wrote a config and has it silently ignored spends the
    // afternoon asking why nothing is wrapped.
    const dir = tempDir()
    writeModule(dir, 'atlas.config.js', 'throw new Error("bad config")\n')
    const loaded = await loadAtlasConfig(dir)
    expect(loaded.path).toContain('atlas.config.js')
    expect(loaded.error).toContain('bad config')
    expect(loaded.config.wrapper).toBeUndefined()
  })

  it('rejects a non-callable wrapper by name', async () => {
    const dir = tempDir()
    writeModule(dir, 'atlas.config.js', 'export const wrapper = { not: "a component" }\n')
    const loaded = await loadAtlasConfig(dir)
    expect(loaded.error).toContain('must be a component function')
    expect(loaded.config.wrapper).toBeUndefined()
  })
})
