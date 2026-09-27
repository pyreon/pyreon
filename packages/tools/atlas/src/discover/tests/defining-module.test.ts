/**
 * The Docs view's source block shows the module that DEFINES a component, not
 * the barrel it was discovered through — Stack's page printed forty lines of
 * `export { default as … }` from the package index.
 */
import { describe, expect, it } from 'vitest'
import { definingModule } from '../defining-module'

/** A fake disk: path → source, relative specifiers resolved by string join. */
function disk(files: Record<string, string>) {
  return {
    read: (f: string) => {
      if (!(f in files)) throw new Error(`ENOENT ${f}`)
      return files[f]!
    },
    resolveFile: (spec: string, from: string) => {
      if (!spec.startsWith('.')) return undefined
      const base = from.slice(0, from.lastIndexOf('/'))
      const joined = `${base}/${spec.replace(/^\.\//, '')}`
      for (const c of [joined, `${joined}.ts`, `${joined}.tsx`, `${joined}/index.ts`])
        if (c in files) return c
      return undefined
    },
  }
}

describe('definingModule', () => {
  it('follows `export { default as X } from` to the module that declares the default', () => {
    const d = disk({
      '/p/src/index.ts':
        "export { default as Box } from './components/Box'\nexport { default as Stack } from './components/Stack'\n",
      '/p/src/components/Stack/index.ts': 'const Stack = list.config({})\nexport default Stack\n',
      '/p/src/components/Box/index.ts': 'export default function Box() {}\n',
    })
    expect(definingModule('/p/src/index.ts', 'Stack', d)).toBe('/p/src/components/Stack/index.ts')
    expect(definingModule('/p/src/index.ts', 'Box', d)).toBe('/p/src/components/Box/index.ts')
  })

  it('stops at a file that declares the name itself', () => {
    const d = disk({ '/p/a.ts': 'export const Button = el.config({})\n' })
    expect(definingModule('/p/a.ts', 'Button', d)).toBe('/p/a.ts')
    const d2 = disk({ '/p/a.ts': 'const Button = 1\nexport { Button }\n' })
    expect(definingModule('/p/a.ts', 'Button', d2)).toBe('/p/a.ts')
    const d3 = disk({ '/p/a.ts': 'export class Button {}\n' })
    expect(definingModule('/p/a.ts', 'Button', d3)).toBe('/p/a.ts')
  })

  it('follows named, renamed and star re-exports through several hops', () => {
    const d = disk({
      '/p/index.ts': "export * from './forms'\n",
      '/p/forms/index.ts': "export * from './other'\nexport { Field as Input } from './input'\n",
      '/p/forms/other.ts': 'export const Unrelated = 1\n',
      '/p/forms/input.tsx': 'export function Field() {}\n',
    })
    expect(definingModule('/p/index.ts', 'Input', d)).toBe('/p/forms/input.tsx')
  })

  it('checks EVERY star target — the first may not have the name', () => {
    const d = disk({
      '/p/index.ts': "export * as ns from './ns'\nexport * from './a'\nexport * from './b'\n",
      '/p/ns.ts': 'export const Card = 1\n',
      '/p/a.ts': 'export const Other = 1\nfunction helper() {}\n',
      '/p/b.ts': 'export const Card = el.config({})\n',
    })
    expect(definingModule('/p/index.ts', 'Card', d)).toBe('/p/b.ts')
  })

  it('a default is declared only by an export-default, not by any function', () => {
    const d = disk({
      '/p/index.ts': "export { default as Card } from './card'\n",
      '/p/card.ts': 'function helper() {}\nexport default class Card {}\n',
    })
    expect(definingModule('/p/index.ts', 'Card', d)).toBe('/p/card.ts')
  })

  it('falls back to the last file it could follow — never a guess', () => {
    const d = disk({
      '/p/index.ts': "export { X } from './missing'\nexport { Y } from '@scope/pkg'\n",
    })
    expect(definingModule('/p/index.ts', 'X', d)).toBe('/p/index.ts')
    expect(definingModule('/p/index.ts', 'Y', d)).toBe('/p/index.ts')
    const broken = disk({ '/p/index.ts': "export { Z } from './z'\n" })
    expect(definingModule('/p/index.ts', 'Z', { ...broken, resolveFile: () => '/p/z.ts' })).toBe(
      '/p/z.ts',
    )
    expect(definingModule('/p/nope.ts', 'Q', d)).toBe('/p/nope.ts')
  })

  it('survives a re-export cycle', () => {
    const d = disk({
      '/p/a.ts': "export { X } from './b'\n",
      '/p/b.ts': "export { X } from './a'\n",
    })
    // Terminates, and answers with a file on the cycle rather than hanging.
    expect(['/p/a.ts', '/p/b.ts']).toContain(definingModule('/p/a.ts', 'X', d))
  })

  it('reads the real disk by default', () => {
    // This very test file declares nothing named `Nope` and re-exports nothing.
    expect(definingModule(__filename, 'Nope')).toBe(__filename)
  })
})
