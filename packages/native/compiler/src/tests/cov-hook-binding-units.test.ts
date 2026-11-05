// `canonicalizeHookBindings` at the AST level: which identifiers it renames (a same-named user function, a foreign
// import), which it leaves alone (property names, a hook imported under the wrong name from a `@pyreon/*` package is
// named with its own warning), and when an aliased framework hook is NOT canonicalised because the canonical name is
// already taken in the file. The emit-level behaviour is locked in `hook-binding.test.ts`.

import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { canonicalizeHookBindings } from '../hook-binding'

const HOOKS = new Set(['useOnline', 'useQuery'])

function run(src: string, claims?: (hook: string, source: string) => boolean) {
  const program = parseSync('a.tsx', src, { sourceType: 'module', lang: 'tsx' }).program as unknown as Record<string, unknown>
  const warnings = canonicalizeHookBindings(program, HOOKS, claims)
  const names: string[] = []
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(visit)
    if (!n || typeof n !== 'object') return
    const o = n as Record<string, unknown>
    if (o.type === 'Identifier' && typeof o.name === 'string') names.push(o.name)
    for (const [k, v] of Object.entries(o)) if (k !== 'type') visit(v)
  }
  visit(program)
  return { warnings, names }
}

describe('canonicalizeHookBindings', () => {
  it('a framework hook imported under a DIFFERENT name from a @pyreon package is renamed and named', () => {
    const r = run(`import { useQuery as useOnline } from '@pyreon/query'\nexport const a = useOnline()`)
    expect(r.warnings[0]).toContain('`useOnline` is imported here as `useQuery` from `@pyreon/query`, not as the `useOnline` hook')
    expect(r.names).toContain('useOnline_')
  })

  it('a string-literal import name resolves like an identifier', () => {
    const r = run(`import { "useOnline" as useOnline } from '@pyreon/hooks'\nexport const a = useOnline()`)
    expect(r.warnings).toEqual([])
    expect(r.names).not.toContain('useOnline_')
  })

  it('default and namespace imports are not hook bindings', () => {
    const r = run(`import useOnline from 'x'\nimport * as h from 'y'\nexport const a = useOnline()`)
    expect(r.warnings).toEqual([])
    expect(r.names).toContain('useOnline')
  })

  it('an exported user function of a hook name is renamed, and so are its references — but not property names', () => {
    const r = run(`export function useOnline() { return 1 }
export const o = { useOnline: 1, [useOnline]: 2 }
export const m = o.useOnline
export const s = { useOnline }
export { o as useOnline2 }`)
    // Renamed: the declaration, the computed key, and the shorthand (its key and value nodes both, so it stays a
    // shorthand). Kept: the plain key and the `.useOnline` member name.
    expect(r.names.filter((n) => n === 'useOnline_').length).toBe(4)
    expect(r.names.filter((n) => n === 'useOnline').length).toBe(2)
  })

  it('a const arrow of a hook name is the author`s own function; a const holding a CALL is not', () => {
    expect(run(`export const useOnline = () => 1\nexport const a = useOnline()`).names).toContain('useOnline_')
    expect(run(`export const useOnline = defineStore('s', () => ({}))\nexport const a = useOnline()`).names).not.toContain('useOnline_')
  })

  it('an aliased framework hook is canonicalised at call sites only', () => {
    const r = run(`import { useOnline as useNet } from '@pyreon/hooks'\nexport const a = useNet()\nexport const f = useNet`)
    expect(r.names).toContain('useOnline')
    // The bare reference (not a call) keeps the alias.
    expect(r.names.filter((n) => n === 'useNet').length).toBeGreaterThanOrEqual(2)
  })

  it('an alias whose canonical name is taken by a local declaration stays unresolved', () => {
    const r = run(`import { useOnline as useNet } from '@pyreon/hooks'
function useOnline() { return 1 }
export const a = useNet()`)
    // The local function is renamed; the alias is left (it would otherwise collide).
    expect(r.names).toContain('useOnline_')
    expect(r.names).toContain('useNet')
  })

  it('a registry claim is authoritative over the @pyreon/ default', () => {
    const claims = (hook: string, source: string) => hook === 'useOnline' && source === '@acme/net'
    const ok = run(`import { useOnline } from '@acme/net'\nexport const a = useOnline()`, claims)
    expect(ok.warnings).toEqual([])
    const rejected = run(`import { useOnline } from '@pyreon/hooks'\nexport const a = useOnline()`, claims)
    expect(rejected.warnings[0]).toContain('imported here as `useOnline` from `@pyreon/hooks`')
  })
})
