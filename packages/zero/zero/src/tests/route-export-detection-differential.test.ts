/**
 * `detectRouteExports` differential against an INDEPENDENT parser.
 *
 * `detectRouteExports` reads the oxc module record. A fixture corpus only
 * locks the shapes someone thought of; this file generates route files from
 * a seeded grammar that interleaves every shape that has broken a route
 * scanner before (apostrophes in JSX text, quotes inside regex literals,
 * template literals with nested `${}`, comments containing `export`,
 * `as` / `satisfies` casts, `export { x }` lists, aliases, re-exports,
 * `export * as`, type-only exports) and asserts oxc's answer equals the
 * TypeScript compiler's — a second, unrelated parser. A disagreement means
 * one of them mis-read the file; either way a route's `loader` /
 * `middleware` / `renderMode` would silently exist or vanish.
 *
 * Captured literals (`meta` / `renderMode` / `revalidate`) are also checked:
 * the text the route generator inlines must evaluate to the value TS reads
 * from the same initializer.
 */
import ts from 'typescript'
import { detectRouteExports } from '../fs-router'

const NAMES = [
  'loader',
  'guard',
  'meta',
  'renderMode',
  'error',
  'middleware',
  'loaderKey',
  'gcTime',
  'getStaticPaths',
  'revalidate',
] as const
type Name = (typeof NAMES)[number]

/** The set of runtime route-export names TypeScript sees in `source`. */
function tsExports(source: string, filename: string): Set<Name> {
  const kind = filename.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX
  const sf = ts.createSourceFile(filename, source, ts.ScriptTarget.ESNext, true, kind)
  const out = new Set<Name>()
  const add = (n: string): void => {
    if ((NAMES as readonly string[]).includes(n)) out.add(n as Name)
  }
  const hasExport = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const isDeclare = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
  const bindingNames = (b: ts.BindingName): string[] => {
    if (ts.isIdentifier(b)) return [b.text]
    return b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : bindingNames(e.name)))
  }
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt) && hasExport(stmt) && !isDeclare(stmt)) {
      for (const d of stmt.declarationList.declarations) bindingNames(d.name).forEach(add)
    } else if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      hasExport(stmt) &&
      !isDeclare(stmt) &&
      stmt.name
    ) {
      add(stmt.name.text)
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly && stmt.exportClause) {
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) if (!el.isTypeOnly) add(el.name.text)
      } else if (ts.isNamespaceExport(stmt.exportClause)) {
        add(stmt.exportClause.name.text)
      }
    }
  }
  return out
}

/** The initializer TypeScript reads for `export const NAME = <literal>`. */
function tsLiteral(source: string, name: Name): unknown {
  const sf = ts.createSourceFile('x.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) {
        let init: ts.Expression = d.initializer
        while (
          ts.isAsExpression(init) ||
          ts.isSatisfiesExpression(init) ||
          ts.isParenthesizedExpression(init)
        ) {
          init = init.expression
        }
        const js = ts.transpileModule(`(${init.getText(sf)})`, {
          compilerOptions: { target: ts.ScriptTarget.ESNext },
        }).outputText
        const body = js.replace(/^"use strict";\s*/, '').trim().replace(/;$/, '')
        return new Function(`return ${body}`)()
      }
    }
  }
  return undefined
}

/** Deterministic PRNG (mulberry32) so a failing seed is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Noise statements — each one has broken a character-level scanner. */
const HAZARDS = [
  `const a1 = "it's"`,
  `const a2 = 'say "hi"'`,
  `const re1 = /'/g`,
  `const re2 = /["'\`]/`,
  `const re3 = /\\/export const loader/`,
  'const t1 = `x ${ { y: "}" }.y } ${`in \'${1}\'`}`',
  `// export const loader = () => 1`,
  `/* export const middleware = () => {} */`,
  `const s1 = "export const guard = 1"`,
  `const c1 = (1 as unknown) as number`,
  `const c2 = { a: 1 } satisfies Record<string, number>`,
  `function Page() { return <p>Don't miss "it" — isn't that {'}'}</p> }`,
  `const j = <div title="a'b">{"export const meta = 1"}</div>`,
  `type Loader = () => void`,
  `export type Meta = { title: string }`,
  `export interface Guard { x: 1 }`,
  `export declare const gcTime: number`,
]

/** Export forms. `n` is the route-export name being declared. */
const FORMS: ((n: Name, r: () => number) => string)[] = [
  (n) => `export const ${n} = () => 1`,
  (n) => `export let ${n} = 1`,
  (n) => `export async function ${n}() { return 1 }`,
  (n) => `export function ${n}() {}`,
  (n) => `export class ${n} {}`,
  (n) => `const local_${n} = 1\nexport { local_${n} as ${n} }`,
  (n) => `function ${n}() {}\nexport { ${n} }`,
  (n) => `export { ${n} } from './mod'`,
  (n) => `export * as ${n} from './mod'`,
  (n) => `export const { ${n} } = { ${n}: 1 }`,
  (n) => `export const [${n}] = [1]`,
  // Type-only forms must NOT count.
  (n) => `type T_${n} = 1\nexport type { T_${n} as ${n} }`,
  (n) => `export { type ${n} } from './types'`,
]

/** Literal-bearing declarations, cast in the ways real routes cast them. */
const LITERALS: Record<'meta' | 'renderMode' | 'revalidate', string[]> = {
  meta: [
    `{ title: "Don't :( panic", tags: ['a' as const, "b"] } as const`,
    `({ title: 'x', n: -1, ok: true, nothing: null })`,
    '{ title: `plain template`, desc: "a \\"q\\" b" } satisfies { title: string; desc: string }',
  ],
  renderMode: [`'isr' as const`, `("ssg")`, `'spa'`],
  revalidate: [`60`, `3600 as const`, `false`],
}

interface Generated {
  src: string
  /** Keys declared with a pure literal initializer (the capture targets). */
  literals: Set<'meta' | 'renderMode' | 'revalidate'>
}

function generate(seed: number): Generated {
  const r = rng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T
  const lines: string[] = []
  const used = new Set<Name>()
  const literals = new Set<'meta' | 'renderMode' | 'revalidate'>()
  const n = 3 + Math.floor(r() * 8)
  for (let i = 0; i < n; i++) {
    const roll = r()
    if (roll < 0.45) {
      lines.push(pick(HAZARDS))
    } else if (roll < 0.65) {
      const key = pick(['meta', 'renderMode', 'revalidate'] as const)
      if (used.has(key)) continue
      used.add(key)
      literals.add(key)
      lines.push(`export const ${key} = ${pick(LITERALS[key])}`)
    } else {
      const name = pick(NAMES)
      if (used.has(name)) continue
      used.add(name)
      lines.push(pick(FORMS)(name, r))
    }
  }
  lines.push('export default function Route() { return <main>{"ok"}</main> }')
  // Unique locals per seed never collide; a repeated hazard line is fine.
  return { src: lines.join('\n'), literals }
}

const genRoute = (seed: number): string => generate(seed).src

function oxcExports(source: string, filename: string): Set<Name> {
  const r = detectRouteExports(source, filename)
  const flags: Record<Name, boolean> = {
    loader: r.hasLoader,
    guard: r.hasGuard,
    meta: r.hasMeta,
    renderMode: r.hasRenderMode,
    error: r.hasError,
    middleware: r.hasMiddleware,
    loaderKey: r.hasLoaderKey,
    gcTime: r.hasGcTime,
    getStaticPaths: r.hasGetStaticPaths,
    revalidate: r.hasRevalidate,
  }
  return new Set(NAMES.filter((k) => flags[k]))
}

const SEEDS = Number(process.env.PYREON_FUZZ_SEEDS ?? 400)

describe('detectRouteExports — differential vs the TypeScript parser', () => {
  it('the generator exercises every hazard, form and literal', () => {
    // Positive control: a generator that silently stopped emitting some
    // shape would make the differential pass vacuously.
    const all = Array.from({ length: SEEDS }, (_, i) => genRoute(i)).join('\n')
    for (const h of HAZARDS) expect(all.includes(h), h).toBe(true)
    for (const key of Object.keys(LITERALS) as (keyof typeof LITERALS)[]) {
      for (const lit of LITERALS[key]) expect(all.includes(lit), lit).toBe(true)
    }
    expect(all).toContain('export type {')
    expect(all).toContain('export * as ')
  })

  it(`oxc and TypeScript agree on the export set across ${SEEDS} seeded route files`, () => {
    const failures: string[] = []
    for (let seed = 0; seed < SEEDS; seed++) {
      const src = genRoute(seed)
      const oxc = [...oxcExports(src, 'route.tsx')].sort()
      const tsx = [...tsExports(src, 'route.tsx')].sort()
      if (oxc.join() !== tsx.join()) {
        failures.push(`seed ${seed}: oxc=[${oxc}] ts=[${tsx}]\n${src}`)
      }
    }
    expect(failures.slice(0, 3).join('\n\n---\n\n')).toBe('')
  })

  it('every captured literal evaluates to the value TypeScript reads', () => {
    const failures: string[] = []
    for (let seed = 0; seed < SEEDS; seed++) {
      const { src, literals } = generate(seed)
      const r = detectRouteExports(src, 'route.tsx')
      const captured: [Name, string | undefined][] = [
        ['meta', r.metaLiteral],
        ['renderMode', r.renderModeLiteral],
        ['revalidate', r.revalidateLiteral],
      ]
      for (const [name, text] of captured) {
        if (!literals.has(name as 'meta' | 'renderMode' | 'revalidate')) continue
        const expected = tsLiteral(src, name)
        if (text === undefined) {
          failures.push(`seed ${seed}: ${name} literal not captured`)
          continue
        }
        let actual: unknown
        try {
          actual = new Function(`return (${text})`)()
        } catch (e) {
          failures.push(`seed ${seed}: ${name} captured invalid JS ${text}: ${String(e)}`)
          continue
        }
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          failures.push(`seed ${seed}: ${name} ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`)
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([])
  })

  it('`.ts` route files (angle-bracket casts legal) agree too', () => {
    const src = `const n = <number>(1 as unknown)
export const loader = async () => n
export { loader as guard }
export type { Foo as middleware } from './t'`
    expect([...oxcExports(src, 'route.ts')].sort()).toEqual([...tsExports(src, 'route.ts')].sort())
    expect([...oxcExports(src, 'route.ts')].sort()).toEqual(['guard', 'loader'])
  })
})
