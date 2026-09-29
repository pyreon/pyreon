/**
 * Refusals and fallbacks in the input helpers, each asserted by its message:
 * spec patches, the YAML reader, `lathe init`'s flag reading and the CLI's
 * plugin-module resolver. Every branch here is a way a user's input is wrong
 * or unusual; the test pins that it is SAID, not guessed at.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyPatches } from '../core/patch'
import type { LatheSpecPatch } from '../core/patch'
import { parseYaml, parseSpecText, YamlError } from '../input/yaml'
import { detect, type DetectFs } from '../cli/init/detect'
import { resolveModuleSpecifier } from '../cli/plugin-modules'

describe('spec patches', () => {
  const spec = () => ({ info: { title: 'T', tags: ['a', 'b'] }, list: [1, 2, 3] })
  const run = (patch: unknown) => {
    const s = spec()
    applyPatches(s, [patch as LatheSpecPatch])
    return s
  }

  it('refuses a malformed patch, saying what is wrong', () => {
    expect(() => run(null)).toThrow('must be an object like `{ op, path, value }`')
    expect(() => run({ op: 'move', path: '/info' })).toThrow('`op` must be add, replace or remove; got `move`')
    expect(() => run({ op: 'remove', path: 3 })).toThrow('`path` must be a JSON pointer string')
    expect(() => run({ op: 'remove', path: 'info' })).toThrow(/JSON pointer/)
    expect(() => run({ op: 'remove', path: '' })).toThrow('the root cannot be patched')
    expect(() => run({ op: 'add', path: '/info/x' })).toThrow('needs a `value`')
  })

  it('names a missing parent, with a did-you-mean', () => {
    expect(() => run({ op: 'add', path: '/infoo/x', value: 1 })).toThrow('`/infoo` does not exist in the spec — did you mean `info`?')
    // Through an array there is no key to suggest.
    expect(() => run({ op: 'add', path: '/list/x/y', value: 1 })).toThrow('`/list/x` does not exist in the spec.')
  })

  it('adds, replaces and removes array entries, and refuses a bad index', () => {
    expect(run({ op: 'add', path: '/list/-', value: 4 }).list).toEqual([1, 2, 3, 4])
    expect(run({ op: 'add', path: '/list/0', value: 0 }).list).toEqual([0, 1, 2, 3])
    expect(run({ op: 'replace', path: '/list/1', value: 9 }).list).toEqual([1, 9, 3])
    expect(run({ op: 'remove', path: '/list/2' }).list).toEqual([1, 2])
    expect(() => run({ op: 'replace', path: '/list/3', value: 1 })).toThrow('`3` is not an index of the array at that position (length 3)')
    expect(() => run({ op: 'add', path: '/list/01', value: 1 })).toThrow('`01` is not an index')
    expect(() => run({ op: 'remove', path: '/list/-' })).toThrow('`-` is not an index')
  })

  it('a missing key to replace or remove is named, with a did-you-mean', () => {
    expect(() => run({ op: 'replace', path: '/info/titl', value: 'x' })).toThrow('there is no `titl` to replace — did you mean `title`?')
    expect(() => run({ op: 'remove', path: '/info/zzzzzz' })).toThrow(/there is no `zzzzzz` to remove\. The spec/)
  })
})

describe('the YAML reader', () => {
  const line = (src: string): number => {
    try {
      parseYaml(src)
    } catch (err) {
      if (err instanceof YamlError) return err.line
      throw err
    }
    throw new Error('did not throw')
  }

  it('refuses a custom tag, naming the line', () => {
    expect(() => parseYaml('a: 1\nb: !Ref x\n')).toThrow('custom tags are not expanded')
    expect(line('a: 1\nb: !Ref x\n')).toBe(2)
  })

  it('refuses .inf / .nan and a collection used as a key', () => {
    expect(() => parseYaml('a: .inf\n')).toThrow('`.inf` has no JSON form')
    expect(() => parseYaml('? [a, b]\n: 1\n')).toThrow('a mapping or sequence used as a KEY')
  })

  it('refuses a multi-document stream in its own words, and a recursive alias', () => {
    expect(() => parseYaml('a: 1\n---\nb: 2\n')).toThrow('more than one YAML document')
    expect(() => parseYaml('a: &x\n  b: *x\n')).toThrow(/recursive document|refers to an anchor/)
  })

  it('refuses an alias bomb past the expansion cap, pointing at an alias', () => {
    const rows = ['a: &a [x, x, x, x, x, x, x, x, x, x]']
    for (let i = 1; i < 6; i++) rows.push(`${String.fromCharCode(97 + i)}: &${String.fromCharCode(97 + i)} [${Array(10).fill(`*${String.fromCharCode(96 + i)}`).join(', ')}]`)
    expect(() => parseYaml(`${rows.join('\n')}\n`)).toThrow(YamlError)
  })

  it('reads JSON after a BOM, and YAML merge keys', () => {
    expect(parseSpecText('﻿{"a":1}')).toEqual({ a: 1 })
    expect(parseSpecText('base: &b { x: 1 }\nuse: { <<: *b, y: 2 }\n')).toEqual({ base: { x: 1 }, use: { x: 1, y: 2 } })
  })
})

describe('lathe init reading orval flags', () => {
  const fs = (files: Record<string, string>): DetectFs => ({
    exists: (p) => p in files,
    read: (p) => files[p] as string,
  })
  const orval = (command: string) => detect(fs({ 'package.json': JSON.stringify({ scripts: { g: command } }) }), 'orval')

  it('a flag missing its value is not read as one, and an unknown flag is reported', () => {
    const m = orval('orval -i -o --client --tslint --mode split')[0]?.migrations[0]
    expect(m?.section.input).toBeUndefined()
    expect(m?.section.output).toBeUndefined()
    expect(m?.unmapped.map((u) => u.from)).toEqual(['g.output.tslint'])
    expect(m?.mapped.map((x) => x.from)).toContain('g.output.mode')
  })

  it('a non-string script and a config file that does not parse are skipped, not guessed at', () => {
    expect(detect(fs({ 'package.json': JSON.stringify({ scripts: { g: 3 } }) }), 'orval')).toEqual([])
    const unreadable = detect(fs({ 'o.ts': 'const x = 1', 'package.json': JSON.stringify({ scripts: { g: 'orval --config o.ts' } }) }), 'orval')
    expect(unreadable).toEqual([{ tool: 'orval', file: 'o.ts', migrations: [] }])
  })

  it('hey-api ignores a stray positional', () => {
    const found = detect(fs({ 'package.json': JSON.stringify({ scripts: { g: 'openapi-ts stray -i a.yaml' } }) }), 'hey-api')
    expect(found[0]?.migrations[0]?.section.input).toBe('a.yaml')
  })
})

describe('the plugin-module resolver', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.generated', 'reader-edges-resolve')
  const put = (rel: string, contents = ''): void => {
    mkdirSync(dirname(join(ROOT, rel)), { recursive: true })
    writeFileSync(join(ROOT, rel), contents)
  }
  beforeAll(() => {
    rmSync(ROOT, { recursive: true, force: true })
    // No `exports`: a subpath is a file, with its extension found.
    put('node_modules/plain/package.json', '{}')
    put('node_modules/plain/sub.js')
    put('node_modules/plain/dir/index.js')
    // An array of fallbacks, and conditions nested under a condition.
    put('node_modules/arr/package.json', JSON.stringify({ exports: { '.': [{ worker: './w.js' }, { node: { import: './n.mjs' } }] } }))
    // A `*` pattern that does not match, and a condition set with no usable condition.
    put('node_modules/pat/package.json', JSON.stringify({ exports: { './p/*.js': './d/*.js', './q': { browser: './b.js' } } }))
    put('node_modules/nomatch/package.json', JSON.stringify({ exports: { '.': { require: './r.cjs' } } }))
  })
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

  it('finds a subpath file without exports, adding its extension', () => {
    expect(resolveModuleSpecifier('plain/sub', ROOT)).toBe(join(ROOT, 'node_modules', 'plain', 'sub.js'))
    expect(resolveModuleSpecifier('plain/dir', ROOT)).toBe(join(ROOT, 'node_modules', 'plain', 'dir', 'index.js'))
  })

  it('walks an array of fallbacks and nested conditions', () => {
    expect(resolveModuleSpecifier('arr', ROOT)).toBe(join(ROOT, 'node_modules', 'arr', 'n.mjs'))
  })

  it('refuses what the exports field does not offer under import/node/default', () => {
    expect(() => resolveModuleSpecifier('pat/p/x.ts', ROOT)).toThrow('`pat/p/x.ts` is not exported')
    expect(() => resolveModuleSpecifier('pat/q', ROOT)).toThrow('`pat/q` is not exported')
    expect(() => resolveModuleSpecifier('nomatch', ROOT)).toThrow('`nomatch` is not exported')
  })
})
