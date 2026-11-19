import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import * as components from '../components'
import * as form from '../form'
import * as query from '../query'
import * as chunked from '../transport-chunked'
import * as s3 from '../transport-s3'
import * as tus from '../transport-tus'
import * as xhr from '../transport-xhr'
import * as upload from '../index'
import manifest from '../manifest'

/**
 * Executes every `// =>` line of the manifest examples and every `@example <code> // => <value>` line of the source JSDoc, so
 * the output the docs and the editor show is the output the package produces. Also checks the package's shape and that the
 * built files import exactly what the package declares.
 */
const SRC = join(import.meta.dirname, '..')
const ROOT = join(SRC, '..')

function run(scope: Record<string, unknown>, code: string, expected: string): void {
  const names = Object.keys(scope)
  const parts = code.split('; ')
  const last = parts.pop()!
  const body = `${parts.join(';\n')}${parts.length > 0 ? ';\n' : ''}return [${last}, ${expected}]`
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^"use strict";\n?/, '')
  const [actual, want] = new Function(...names, js)(...names.map((n) => scope[n])) as [unknown, unknown]

  expect(actual).toEqual(want)
}

function lines(example: string): { code: string; expected: string }[] {
  const out: { code: string; expected: string }[] = []
  const setup: string[] = []

  for (const line of example.split('\n')) {
    const m = /^(.*?)\s+\/\/ => (.*)$/.exec(line)

    if (line.startsWith('import ') || line.trim() === '') continue
    if (m === null) setup.push(line)
    else out.push({ code: [...setup, m[1]!].join('; '), expected: m[2]! })
  }

  return out
}

const scope: Record<string, unknown> = { ...upload, ...xhr, ...chunked, ...s3, ...tus, ...components, ...form, ...query }
const scopeOf = (_name: string): Record<string, unknown> => scope

describe('examples run and print what they claim', () => {
  const fromManifest = manifest.api.filter((a) => a.kind !== 'type' && a.example !== undefined).flatMap((a) => lines(a.example!).map((l) => [`${a.name}: ${l.code}`, a.name, l] as const))

  it('finds a worthwhile number of manifest examples', () => {
    expect(fromManifest.length).toBeGreaterThan(40)
  })

  it.each(fromManifest)('manifest %s', (_label, name, l) => {
    run(scopeOf(name), l.code, l.expected)
  })

  it('the long example runs', () => {
    const long = lines(manifest.longExample!)

    expect(long.length).toBeGreaterThanOrEqual(2)
    for (const l of long) run(scope, l.code, l.expected)
  })

  const files = ['uploader.ts', 'picker.ts', 'drop.ts', 'transport-xhr.ts', 'validate.ts', 'sniff.ts', 'accept.ts', 'size.ts', 'chunks.ts', 'progress.ts', 'errors.ts', 'collect.ts', 'resume.ts', 'transport-chunked.ts', 'transport-s3.ts', 'transport-tus.ts', 'components.tsx', 'form.ts', 'query.ts']
  const fromSource = files.flatMap((file) =>
    readFileSync(join(SRC, file), 'utf8')
      .split('\n')
      .flatMap((text) => {
        const m = /^\s*\*\s*@example (.*?) \/\/ => (.*)$/.exec(text)

        return m === null ? [] : [[`${file}: ${m[1]}`, file, { code: m[1]!, expected: m[2]! }] as const]
      }),
  )

  it('finds a worthwhile number of JSDoc examples', () => {
    expect(fromSource.length).toBeGreaterThan(15)
  })

  it.each(fromSource)('jsdoc %s', (_label, _file, l) => {
    run(scope, l.code, l.expected)
  })

  it('every runtime export is in the manifest', () => {
    const documented = new Set<string>(manifest.api.map((a) => a.name))
    const undocumented = Object.keys(scope).filter((n) => !documented.has(n))

    expect(undocumented).toEqual([])
  })
})

interface Pkg {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  sideEffects: boolean
  type: string
  exports: Record<string, Record<string, string>>
}

const imports = (text: string): string[] => [...text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!).filter((s) => !s.startsWith('.'))

describe('the published shape', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Pkg
  const sources = readdirSync(SRC).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

  it('has no dependencies, the peers @pyreon/reactivity and (optional, for the components) @pyreon/core, is ESM only and side-effect free', () => {
    expect(pkg.dependencies).toBeUndefined()
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual(['@pyreon/reactivity', '@pyreon/core'])
    expect((pkg as unknown as { peerDependenciesMeta: Record<string, { optional: boolean }> }).peerDependenciesMeta['@pyreon/core']!.optional).toBe(true)
    expect(pkg.type).toBe('module')
    expect(pkg.sideEffects).toBe(false)
    expect(JSON.stringify(pkg.exports)).not.toMatch(/"require"|"default"/)
  })

  it('every exports target that points at source exists', () => {
    for (const target of Object.values(pkg.exports)) expect(existsSync(join(ROOT, target.bun!)), target.bun).toBe(true)
  })

  it('the core files import nothing from @pyreon; only the queue, picker and drop import @pyreon/reactivity; no node: import', () => {
    const reactive = new Set(['uploader.ts', 'queue.ts', 'picker.ts', 'drop.ts', 'intake.ts', 'form.ts'])

    for (const f of sources.filter((n) => n !== 'manifest.ts' && n !== 'manifest-parts.ts')) {
      const found = imports(readFileSync(join(SRC, f), 'utf8'))

      expect(found.filter((s) => s.startsWith('node:')), f).toEqual([])
      expect(found, f).toEqual(f === 'components.tsx' ? ['@pyreon/core'] : reactive.has(f) ? ['@pyreon/reactivity'] : [])
    }
  })

  it('the core and transport entries reach no reactive file, and the xhr transport reaches only core files', () => {
    const reach = (entry: string): string[] => {
      const seen = new Set<string>()
      const todo = [entry]

      while (todo.length > 0) {
        const f = todo.pop()!

        if (seen.has(f)) continue
        seen.add(f)
        for (const m of readFileSync(join(SRC, `${f}.ts`), 'utf8').matchAll(/from '\.\/([\w-]+)'/g)) todo.push(m[1]!)
      }

      return [...seen]
    }

    for (const e of ['core', 'transport-xhr', 'transport-chunked', 'transport-s3', 'transport-tus']) for (const bad of ['uploader', 'queue', 'picker', 'drop', 'index', 'intake', 'components', 'form']) expect(reach(e), e).not.toContain(bad)
    // A transport never pulls another transport.
    const transports = ['transport-xhr', 'transport-chunked', 'transport-s3', 'transport-tus']

    for (const e of transports) for (const other of transports.filter((t) => t !== e)) expect(reach(e), `${e} reaches ${other}`).not.toContain(other)
  })

  it('importing the package runs nothing and touches no browser global', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')

    vi.resetModules()
    const fresh = await import('../index')

    expect(spy).not.toHaveBeenCalled()
    expect(typeof fresh.createUploader).toBe('function')
    spy.mockRestore()
  })

  const lib = join(ROOT, 'lib')

  it('the built files import exactly what the package declares (outside-in)', () => {
    expect(existsSync(lib), 'lib/ is missing: run `bun run build` in the package').toBe(true)
    const all = (entry: string): string[] => {
      const seen = new Set<string>()
      const out = new Set<string>()
      const todo = [entry]

      while (todo.length > 0) {
        const f = todo.pop()!

        if (seen.has(f)) continue
        seen.add(f)
        for (const m of readFileSync(join(lib, f), 'utf8').matchAll(/^(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/gm)) {
          if (m[1]!.startsWith('.')) todo.push(join(f, '..', m[1]!))
          else out.add(m[1]!)
        }
      }

      return [...out].sort()
    }

    expect(all('core.js')).toEqual([])
    expect(all('transport-xhr.js')).toEqual([])
    for (const t of ['transport-chunked.js', 'transport-s3.js', 'transport-tus.js']) expect(all(t), t).toEqual([])
    expect(all('index.js')).toEqual(['@pyreon/reactivity'])
    expect(all('form.js')).toEqual(['@pyreon/reactivity'])
    expect(all('query.js')).toEqual([])
    expect(all('components.js')).toEqual(['@pyreon/core/jsx-runtime', '@pyreon/reactivity'])
  })
})
