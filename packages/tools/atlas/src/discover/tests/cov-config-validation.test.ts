/**
 * The config validators, arm by arm.
 *
 * Every one of these returns a MESSAGE rather than a boolean, and the message
 * is the whole product: a config export that is silently ignored costs an
 * afternoon of "why is nothing wrapped?". So each shape is asserted in BOTH
 * directions — the valid form passes, the malformed form is NAMED — because a
 * validator that rejects everything reads exactly like one that works.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  loadAtlasConfig,
  resolveFrom,
  validateAuthoredScenarios,
  validatePages,
  validatePresets,
  validateProjects,
} from '../config'

const dirs: string[] = []
const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-cov-cfg-'))
  dirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** A project whose `atlas.config.js` exports `source`. */
const withConfig = async (source: string, name = 'atlas.config.js') => {
  const dir = tempDir()
  writeFileSync(join(dir, name), source)
  return loadAtlasConfig(dir)
}

describe('validateProjects — the monorepo roots', () => {
  it('accepts a well-formed list', () => {
    expect(validateProjects([{ name: 'core', dir: 'packages/core' }])).toBeUndefined()
  })

  it('refuses a non-array', () => {
    expect(validateProjects({ core: 'packages/core' })).toContain('must be an array')
  })

  it('refuses an EMPTY array — an empty monorepo is a typo, not a project', () => {
    expect(validateProjects([])).toContain('must not be empty')
  })

  it('refuses an entry that is not an object, an array included', () => {
    expect(validateProjects(['packages/core'])).toContain('must be an object')
    expect(validateProjects([['core', 'packages/core']])).toContain('must be an object')
    expect(validateProjects([null])).toContain('must be an object')
  })

  it('refuses a missing or empty `name`', () => {
    expect(validateProjects([{ dir: 'packages/core' }])).toContain('non-empty string `name`')
    expect(validateProjects([{ name: '', dir: 'packages/core' }])).toContain('non-empty string `name`')
  })

  it('refuses a missing or empty `dir`, and NAMES the project', () => {
    expect(validateProjects([{ name: 'core' }])).toContain('`projects.core`')
    expect(validateProjects([{ name: 'core', dir: '' }])).toContain('`projects.core`')
  })

  it('refuses a `/` in a name — it would nest a group where one level was meant', () => {
    // `project/Name` is the component KEY, so a slash makes the key ambiguous.
    expect(validateProjects([{ name: 'ui/core', dir: 'p' }])).toContain('must not contain "/"')
  })

  it('refuses a DUPLICATE name — the exact collapse `project` exists to prevent', () => {
    const problem = validateProjects([
      { name: 'core', dir: 'a' },
      { name: 'core', dir: 'b' },
    ])
    expect(problem).toContain('duplicate')
    // Two DIFFERENT names over the same shape stay fine.
    expect(
      validateProjects([
        { name: 'core', dir: 'a' },
        { name: 'ui', dir: 'b' },
      ]),
    ).toBeUndefined()
  })
})

describe('validatePages — presentation overrides', () => {
  it('accepts the full shape', () => {
    expect(
      validatePages({ Button: { title: 'Button', group: 'Forms', summary: 'A button', order: 1 } }),
    ).toBeUndefined()
  })

  it('refuses a non-object, an array included', () => {
    expect(validatePages([])).toContain('keyed by component name')
    expect(validatePages(null)).toContain('keyed by component name')
    expect(validatePages('Button')).toContain('keyed by component name')
  })

  it('refuses a non-object entry and names the component', () => {
    expect(validatePages({ Button: 'Forms' })).toContain('`pages.Button` must be an object')
    expect(validatePages({ Button: ['Forms'] })).toContain('`pages.Button` must be an object')
    expect(validatePages({ Button: null })).toContain('`pages.Button` must be an object')
  })

  it('refuses a non-string title / group / summary, naming the FIELD', () => {
    expect(validatePages({ Button: { title: 1 } })).toContain('`pages.Button.title`')
    expect(validatePages({ Button: { group: 1 } })).toContain('`pages.Button.group`')
    expect(validatePages({ Button: { summary: 1 } })).toContain('`pages.Button.summary`')
  })

  it('refuses a non-FINITE order — NaN is a number and would sort unpredictably', () => {
    expect(validatePages({ Button: { order: Number.NaN } })).toContain('finite number')
    expect(validatePages({ Button: { order: 'first' } })).toContain('finite number')
    expect(validatePages({ Button: { order: 0 } })).toBeUndefined()
  })
})

describe('validateAuthoredScenarios', () => {
  it('accepts the full shape', () => {
    expect(
      validateAuthoredScenarios({ Button: [{ name: 'loading', args: { busy: true }, play: () => {} }] }),
    ).toBeUndefined()
  })

  it('refuses a non-object map', () => {
    expect(validateAuthoredScenarios([])).toContain('keyed by component name')
    expect(validateAuthoredScenarios(null)).toContain('keyed by component name')
  })

  it('refuses a non-array list, naming the component', () => {
    expect(validateAuthoredScenarios({ Button: { name: 'x' } })).toContain('`scenarios.Button` must be an array')
  })

  it('refuses an entry with no string `name`', () => {
    expect(validateAuthoredScenarios({ Button: ['loading'] })).toContain('string `name`')
    expect(validateAuthoredScenarios({ Button: [null] })).toContain('string `name`')
    expect(validateAuthoredScenarios({ Button: [{ args: {} }] })).toContain('string `name`')
  })

  it('refuses non-object `args` and non-function `play`, naming the entry', () => {
    expect(validateAuthoredScenarios({ Button: [{ name: 'a', args: 'x' }] })).toContain('non-object `args`')
    expect(validateAuthoredScenarios({ Button: [{ name: 'a', args: null }] })).toContain('non-object `args`')
    expect(validateAuthoredScenarios({ Button: [{ name: 'a', play: 'run' }] })).toContain('non-function `play`')
  })
})

describe('validatePresets — the workbench pickers', () => {
  it('refuses a non-object', () => {
    expect(validatePresets(null)).toContain('must be an object')
  })

  it('keeps the defaults for an omitted family rather than complaining', () => {
    expect(validatePresets({})).toBeUndefined()
    expect(validatePresets({ viewports: undefined })).toBeUndefined()
  })

  it('refuses a non-array family, and an EMPTY one', () => {
    expect(validatePresets({ roles: 'admin' })).toContain('`presets.roles` must be an array')
    // Empty is its own message: omitting keeps the defaults, and an empty list
    // would silently render a picker with nothing in it.
    expect(validatePresets({ roles: [] })).toContain('omit it to keep the defaults')
  })

  it('refuses an entry missing `id` or `label`', () => {
    expect(validatePresets({ roles: [{ id: 'admin' }] })).toContain('string `id` and `label`')
    expect(validatePresets({ roles: [null] })).toContain('string `id` and `label`')
    expect(validatePresets({ roles: [{ id: 1, label: 'x' }] })).toContain('string `id` and `label`')
  })

  it('requires `width: number | null` on a viewport, and allows null', () => {
    expect(validatePresets({ viewports: [{ id: 'sm', label: 'Small' }] })).toContain('width: number | null')
    expect(validatePresets({ viewports: [{ id: 'full', label: 'Full', width: null }] })).toBeUndefined()
    expect(validatePresets({ viewports: [{ id: 'sm', label: 'Small', width: 320 }] })).toBeUndefined()
  })

  it('refuses an invalid locale `dir`, and allows both real ones plus omission', () => {
    expect(validatePresets({ locales: [{ id: 'en', label: 'EN', dir: 'sideways' }] })).toContain(
      'invalid `dir`',
    )
    expect(validatePresets({ locales: [{ id: 'ar', label: 'AR', dir: 'rtl' }] })).toBeUndefined()
    expect(validatePresets({ locales: [{ id: 'en', label: 'EN', dir: 'ltr' }] })).toBeUndefined()
    expect(validatePresets({ locales: [{ id: 'en', label: 'EN' }] })).toBeUndefined()
  })
})

describe('`alias` — validated because a malformed one does not fail LOUDLY', () => {
  // Vite ignores an entry it cannot read, so the import it was meant to fix
  // keeps failing while the config LOOKS applied.
  it('accepts the object form', async () => {
    const loaded = await withConfig('export const alias = { "~": "./src" }\n')
    expect(loaded.error).toBeUndefined()
    expect(loaded.config.alias).toEqual({ '~': './src' })
  })

  it('accepts the array form, with a string or a RegExp `find`', async () => {
    const loaded = await withConfig(
      'export const alias = [{ find: "~", replacement: "./src" }, { find: /^@\\//, replacement: "./app" }]\n',
    )
    expect(loaded.error).toBeUndefined()
    expect(Array.isArray(loaded.config.alias)).toBe(true)
  })

  it('names an array entry with no usable `find`', async () => {
    const loaded = await withConfig('export const alias = [{ find: 1, replacement: "./src" }]\n')
    expect(loaded.error).toContain('string or RegExp `find`')
    expect(loaded.config.alias).toBeUndefined()
  })

  it('names an array entry with no string `replacement`', async () => {
    const loaded = await withConfig('export const alias = [{ find: "~" }]\n')
    expect(loaded.error).toContain('string `replacement`')
  })

  it('names a null entry rather than crashing on it', async () => {
    const loaded = await withConfig('export const alias = [null]\n')
    expect(loaded.error).toContain('string or RegExp `find`')
  })

  it('names a non-object alias', async () => {
    const loaded = await withConfig('export const alias = "./src"\n')
    expect(loaded.error).toContain('must be an object')
  })

  it('names the KEY whose value is not a string path', async () => {
    const loaded = await withConfig('export const alias = { "~": 42 }\n')
    expect(loaded.error).toContain('`alias["~"]`')
  })
})

describe('the other optional exports, valid and named-when-not', () => {
  it('takes `ignore` as path fragments and refuses anything else', async () => {
    expect((await withConfig('export const ignore = ["fixtures"]\n')).config.ignore).toEqual(['fixtures'])
    const bad = await withConfig('export const ignore = [1]\n')
    expect(bad.error).toContain('array of path fragments')
    expect(bad.config.ignore).toBeUndefined()
    expect((await withConfig('export const ignore = "fixtures"\n')).error).toContain('array of path fragments')
  })

  it('takes `title` as a string and refuses anything else', async () => {
    expect((await withConfig('export const title = "Acme UI"\n')).config.title).toBe('Acme UI')
    expect((await withConfig('export const title = 42\n')).error).toContain('`title` must be a string')
  })

  it('applies every VALID export even when an unrelated one is malformed', async () => {
    // The rule the accumulating shape exists for: one bad export is NAMED and
    // ignored, and every other export still applies.
    const loaded = await withConfig('export const title = 42\nexport const ignore = ["gen"]\n')
    expect(loaded.error).toContain('`title`')
    expect(loaded.config.ignore).toEqual(['gen'])
  })

  it('reads the same fields off a DEFAULT export', async () => {
    const loaded = await withConfig('export default { title: "Acme", ignore: ["gen"] }\n')
    expect(loaded.config.title).toBe('Acme')
    expect(loaded.config.ignore).toEqual(['gen'])
  })

  it('takes `theme` verbatim — only the keys are ever used', async () => {
    const loaded = await withConfig('export const theme = { accent: "#333" }\n')
    expect(loaded.config.theme).toEqual({ accent: '#333' })
  })
})

describe('a shared `pyreon.config.*` — one shape, two places it can live', () => {
  it('reads the `atlas` section', async () => {
    const loaded = await withConfig(
      'export default { atlas: { title: "Shared" } }\n',
      'pyreon.config.js',
    )
    expect(loaded.config.title).toBe('Shared')
  })

  it('is SILENT for a pyreon config with no `atlas` key — that is another tool s config', async () => {
    const loaded = await withConfig('export default { zero: {} }\n', 'pyreon.config.js')
    expect(loaded.config).toEqual({})
    expect(loaded.error).toBeUndefined()
    expect(loaded.path).toBeUndefined()
  })

  it('names a non-object `atlas` section rather than ignoring it', async () => {
    const loaded = await withConfig('export default { atlas: "yes" }\n', 'pyreon.config.js')
    expect(loaded.error).toContain('`atlas` must be an object')
    const asArray = await withConfig('export default { atlas: [] }\n', 'pyreon.config.js')
    expect(asArray.error).toContain('`atlas` must be an object')
  })
})

describe('a config that throws', () => {
  it('reports a non-Error throw as text rather than "[object Object]"', async () => {
    // A config is arbitrary user code; `throw 'x'` is legal and the reader
    // still needs to see the x.
    const loaded = await withConfig('throw "no theme installed"\n')
    expect(loaded.error).toContain('no theme installed')
    expect(loaded.path).toContain('atlas.config.js')
    expect(loaded.config).toEqual({})
  })
})

describe('resolveFrom', () => {
  it('leaves an absolute path alone', () => {
    const abs = resolve('/tmp/atlas/theme.ts')
    expect(resolveFrom('/elsewhere', abs)).toBe(abs)
  })

  it('resolves a relative one against cwd', () => {
    expect(resolveFrom('/project', './theme.ts')).toBe(resolve('/project', './theme.ts'))
  })
})
