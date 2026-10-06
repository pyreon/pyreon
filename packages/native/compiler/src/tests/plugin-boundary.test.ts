import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A plugin lowers a library through the PUBLIC interface only (the facade, the IR
// types, its own helpers). Reaching into an emitter or the parser would put the
// compiler core back inside the plugin — the dependency this directory exists to
// remove — and silently re-couple it to emitter internals.
const PLUGINS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins')
const FORBIDDEN = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]\.\.\/(?:emit-swift|emit-kotlin|parse)(?:\.[jt]s)?['"]/

describe('plugin boundary', () => {
  const files = readdirSync(PLUGINS).filter((f) => f.endsWith('.ts'))

  it('scans the plugins directory (a vacuous scan would pass on nothing)', () => {
    expect(files).toEqual(expect.arrayContaining(['coolgrid.ts', 'elements.ts']))
  })

  it.each(files)('%s imports nothing from emit-swift, emit-kotlin or parse', (file) => {
    const source = readFileSync(join(PLUGINS, file), 'utf8')
    const hit = source.split('\n').find((line) => FORBIDDEN.test(line))
    expect(hit, `plugins/${file} imports an emitter or the parser: ${hit}`).toBeUndefined()
  })
})
