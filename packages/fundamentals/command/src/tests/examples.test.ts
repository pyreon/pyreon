import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import * as components from '../components'
import * as command from '../index'
import manifest from '../manifest'

/**
 * Executes every `// =>` line of the manifest examples, so the output the docs and the editor show is the output the package
 * produces. Also checks the package's shape and that the built files import exactly what the package declares.
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

const scope: Record<string, unknown> = { ...command, ...components }

describe('examples run and print what they claim', () => {
  const fromManifest = manifest.api.filter((a) => a.kind !== 'type' && a.example !== undefined).flatMap((a) => lines(a.example!).map((l) => [`${a.name}: ${l.code}`, a.name, l] as const))

  it('finds a worthwhile number of manifest examples', () => {
    expect(fromManifest.length).toBeGreaterThan(12)
  })

  it.each(fromManifest)('manifest %s', (_label, _name, l) => {
    run(scope, l.code, l.expected)
  })

  it('the long example runs', () => {
    const long = lines(manifest.longExample!)

    expect(long.length).toBeGreaterThanOrEqual(2)
    for (const l of long) run(scope, l.code, l.expected)
  })

  it('every runtime export is in the manifest', () => {
    const documented = new Set<string>(manifest.api.map((a) => a.name))
    const undocumented = Object.keys(scope).filter((n) => !documented.has(n) && !n.startsWith('_'))

    expect(undocumented).toEqual([])
  })
})

interface Pkg {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  sideEffects: boolean | string[]
  type: string
  exports: Record<string, Record<string, string> | string>
}

const imports = (text: string): string[] => [...text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!).filter((s) => !s.startsWith('.'))

describe('the published shape', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Pkg
  const sources = readdirSync(SRC).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

  it('depends on @pyreon/hotkeys, peers on @pyreon/reactivity and @pyreon/core, is ESM only and side-effect free', () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['@pyreon/hotkeys'])
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual(['@pyreon/reactivity', '@pyreon/core'])
    expect(pkg.type).toBe('module')
    // only the stylesheet has a side effect when imported
    expect(pkg.sideEffects).toEqual(['**/*.css'])
    expect(JSON.stringify(pkg.exports)).not.toMatch(/"require"|"default"/)
  })

  it('every exports target that points at source exists', () => {
    for (const target of Object.values(pkg.exports)) {
      const file = typeof target === 'string' ? target : target.bun!

      expect(existsSync(join(ROOT, file)), file).toBe(true)
    }
  })

  it('the matcher files import nothing from @pyreon, and no file imports node:', () => {
    const allowed: Record<string, string[]> = {
      'commands.ts': ['@pyreon/reactivity'],
      'entry.ts': ['@pyreon/reactivity'],
      'recents.ts': ['@pyreon/reactivity'],
      'run.ts': ['@pyreon/reactivity'],
      'search.ts': ['@pyreon/reactivity'],
      'store.ts': ['@pyreon/reactivity'],
      'shortcut-binding.ts': ['@pyreon/hotkeys', '@pyreon/reactivity'],
      'shortcuts.ts': ['@pyreon/hotkeys'],
      'source.ts': ['@pyreon/reactivity'],
      'palette.ts': ['@pyreon/hotkeys', '@pyreon/reactivity'],
      'palette-actions.ts': ['@pyreon/reactivity'],
      'palette-core.ts': ['@pyreon/reactivity'],
      'palette-results.ts': ['@pyreon/reactivity'],
      'components.tsx': ['@pyreon/core', '@pyreon/reactivity'],
      'parts.tsx': ['@pyreon/core'],
      'virtual-list.tsx': ['@pyreon/core', '@pyreon/reactivity'],
      'context.ts': ['@pyreon/core'],
      'index.ts': ['@pyreon/reactivity'],
    }

    for (const f of sources.filter((n) => n !== 'manifest.ts' && n !== 'manifest-parts.ts')) {
      const found = [...new Set(imports(readFileSync(join(SRC, f), 'utf8')))]

      expect(found.filter((s) => s.startsWith('node:')), f).toEqual([])
      expect(found.filter((s) => !s.endsWith('package.json')), f).toEqual(allowed[f] ?? [])
    }
  })

  it('the core entry reaches no file that imports @pyreon', () => {
    const seen = new Set<string>()
    const todo = ['core']

    while (todo.length > 0) {
      const f = todo.pop()!

      if (seen.has(f)) continue
      seen.add(f)
      for (const m of readFileSync(join(SRC, `${f}.ts`), 'utf8').matchAll(/from '\.\/([\w-]+)'/g)) todo.push(m[1]!)
    }

    expect([...seen].sort()).toEqual(['core', 'match', 'rank'])
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
    expect(all('index.js')).toEqual(['@pyreon/core', '@pyreon/hotkeys', '@pyreon/reactivity'])
    expect(all('components.js')).toEqual(['@pyreon/core', '@pyreon/core/jsx-runtime', '@pyreon/hotkeys', '@pyreon/reactivity'])
  })
})
