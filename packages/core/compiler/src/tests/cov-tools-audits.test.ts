/**
 * Branch-coverage specs for the project-wide audits — `island-audit.ts`,
 * `ssg-audit.ts`, `native-audit.ts` and `test-audit.ts` — driven through
 * their public entry points (`auditIslands`, `auditSsg`, `auditNative`,
 * `detectNativePatterns`, `auditTestEnvironment`, `formatTestAudit`).
 *
 * Each spec pairs the shape that TAKES an arm with the neighbouring shape
 * that must not: a walker skip beside the sibling it still collects, an
 * island-option shape the extractor declines beside the one it accepts.
 * Every fixture is a real on-disk tree — these are filesystem walkers, so a
 * synthesized AST would exercise the guard rather than the audit.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  auditIslands,
  type IslandAuditResult,
  type IslandFindingCode,
} from '../island-audit'
import { auditNative, detectNativePatterns } from '../native-audit'
import { auditSsg, type SsgFindingCode } from '../ssg-audit'
import {
  auditTestEnvironment,
  formatTestAudit,
  type TestAuditEntry,
  type TestAuditResult,
} from '../test-audit'

const cleanups: string[] = []
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true })
})

function makeTree(prefix: string, sentinel: 'packages' | 'package.json' | null = 'packages') {
  const root = mkdtempSync(join(tmpdir(), `pyreon-cov-${prefix}-`))
  cleanups.push(root)
  if (sentinel === 'packages') mkdirSync(join(root, 'packages'), { recursive: true })
  if (sentinel === 'package.json') writeFileSync(join(root, 'package.json'), '{}')
  return {
    root,
    write(rel: string, body: string) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, body, 'utf8')
      return abs
    },
    mkdir(rel: string) {
      mkdirSync(join(root, rel), { recursive: true })
    },
  }
}

function islandCodes(r: IslandAuditResult): IslandFindingCode[] {
  return r.findings.map((f) => f.code)
}

// ═══════════════════════════════════════════════════════════════════════════
// island-audit — source walker
// ═══════════════════════════════════════════════════════════════════════════

describe('island-audit — walkSourceFiles skip arms', () => {
  it('skips dotfiles, node_modules/lib/dist and test dirs, keeps the sibling', () => {
    const t = makeTree('island')
    const decl = (n: string) =>
      `import { island } from '@pyreon/server/client'\n` +
      `export const W = island(() => import('./w'), { name: '${n}' })\n`
    t.write('packages/a/src/.hidden/x.ts', decl('Hidden'))
    t.write('packages/a/src/node_modules/x.ts', decl('NodeModules'))
    t.write('packages/a/src/lib/x.ts', decl('Lib'))
    t.write('packages/a/src/dist/x.ts', decl('Dist'))
    t.write('packages/a/src/__tests__/x.ts', decl('Tests1'))
    t.write('packages/a/src/tests/x.ts', decl('Tests2'))
    t.write('packages/a/src/real.ts', decl('Real'))
    // The scanned set is exactly one file — every skip arm fired.
    expect(auditIslands(t.root).summary.filesScanned).toBe(1)
  })

  it('skips `.test.tsx` files but collects the plain sibling', () => {
    const t = makeTree('island')
    t.write('packages/a/src/a.test.tsx', 'export const x = 1')
    t.write('packages/a/src/a.tsx', 'export const x = 1')
    t.write('packages/a/src/notes.md', 'ignored')
    expect(auditIslands(t.root).summary.filesScanned).toBe(1)
  })

  it('stops descending past depth 12', () => {
    const t = makeTree('island')
    const deep = Array.from({ length: 13 }, (_, i) => `d${i}`).join('/')
    t.write(`packages/${deep}/too-deep.ts`, 'export const x = 1')
    t.write('packages/shallow.ts', 'export const x = 1')
    expect(auditIslands(t.root).summary.filesScanned).toBe(1)
  })
})

describe('island-audit — island() option-shape handling', () => {
  function audit(src: string) {
    const t = makeTree('island')
    t.write('packages/a/src/a.ts', src)
    return auditIslands(t.root)
  }

  it('declines a non-object options argument but accepts the object form', () => {
    expect(audit(`export const A = island(() => import('./a'), opts)`).summary.islandsDeclared).toBe(0)
    expect(
      audit(`export const A = island(() => import('./a'), { name: 'A' })`).summary.islandsDeclared,
    ).toBe(1)
  })

  it('reads a NoSubstitutionTemplateLiteral name and declines a non-literal one', () => {
    const tpl = audit(
      "export const A = island(() => import('./a'), { name: `Tpl` })",
    )
    expect(tpl.summary.islandsDeclared).toBe(1)
    const dyn = audit(`export const A = island(() => import('./a'), { name: computedName })`)
    expect(dyn.summary.islandsDeclared).toBe(0)
  })

  it('skips a spread + a computed key in the options object', () => {
    const r = audit(`export const A = island(() => import('./a'), { ...base, [k]: 1, name: 'A' })`)
    expect(r.summary.islandsDeclared).toBe(1)
  })

  it('reads a string-literal option key', () => {
    const r = audit(`export const A = island(() => import('./a'), { 'name': 'Quoted' })`)
    expect(r.summary.islandsDeclared).toBe(1)
  })

  it('ignores option keys that are neither name nor hydrate', () => {
    const r = audit(`export const A = island(() => import('./a'), { prefetch: 'idle', name: 'A' })`)
    expect(r.summary.islandsDeclared).toBe(1)
  })

  it('defaults hydrate to `load` when the option is absent', () => {
    // Registering a never-island is the only finding that reads `hydrate`,
    // so the default shows up as its ABSENCE here and its presence below.
    const withoutHydrate = audit(
      `export const A = island(() => import('./a'), { name: 'A' })\n` +
        `hydrateIslands({ A: () => import('./a') })\n`,
    )
    expect(islandCodes(withoutHydrate)).not.toContain('never-with-registry-entry')
    const withNever = audit(
      `export const A = island(() => import('./a'), { name: 'A', hydrate: 'never' })\n` +
        `hydrateIslands({ A: () => import('./a') })\n`,
    )
    expect(islandCodes(withNever)).toContain('never-with-registry-entry')
  })

  it('normalizes a parameterized interaction strategy and keeps non-never ones', () => {
    const r = audit(
      `export const A = island(() => import('./a'), { name: 'A', hydrate: 'interaction(focus)' })\n` +
        `hydrateIslands({ A: () => import('./a') })\n`,
    )
    expect(islandCodes(r)).not.toContain('never-with-registry-entry')
  })
})

describe('island-audit — loader-shape handling for nested-island resolution', () => {
  it('follows an inline `() => import()` loader but not a hoisted / block-bodied one', () => {
    const inner = `import { island } from '@pyreon/server/client'
export const Inner = island(() => import('./deeper'), { name: 'Inner' })
`
    // (a) inline arrow + import() — resolvable, so the nested detector fires.
    const a = makeTree('island')
    a.write('packages/app/src/inner.tsx', inner)
    a.write(
      'packages/app/src/outer.tsx',
      `export const Outer = island(() => import('./inner'), { name: 'Outer' })`,
    )
    expect(islandCodes(auditIslands(a.root))).toContain('nested-island')

    // (b) a hoisted loader identifier — importPath stays undefined.
    const b = makeTree('island')
    b.write('packages/app/src/inner.tsx', inner)
    b.write(
      'packages/app/src/outer.tsx',
      `const loader = () => import('./inner')\n` +
        `export const Outer = island(loader, { name: 'Outer' })`,
    )
    expect(islandCodes(auditIslands(b.root))).not.toContain('nested-island')

    // (c) a BLOCK-bodied arrow — body is not a CallExpression.
    const c = makeTree('island')
    c.write('packages/app/src/inner.tsx', inner)
    c.write(
      'packages/app/src/outer.tsx',
      `export const Outer = island(() => { return import('./inner') }, { name: 'Outer' })`,
    )
    expect(islandCodes(auditIslands(c.root))).not.toContain('nested-island')

    // (d) an arrow whose body is a NON-import call.
    const d = makeTree('island')
    d.write('packages/app/src/inner.tsx', inner)
    d.write(
      'packages/app/src/outer.tsx',
      `export const Outer = island(() => loadIt('./inner'), { name: 'Outer' })`,
    )
    expect(islandCodes(auditIslands(d.root))).not.toContain('nested-island')

    // (e) a BARE specifier — resolveImport declines anything not starting with '.'.
    const e = makeTree('island')
    e.write('packages/app/src/inner.tsx', inner)
    e.write(
      'packages/app/src/outer.tsx',
      `export const Outer = island(() => import('@pkg/inner'), { name: 'Outer' })`,
    )
    expect(islandCodes(auditIslands(e.root))).not.toContain('nested-island')
  })

  it('resolves an import that lands on a DIRECTORY index file', () => {
    const t = makeTree('island')
    t.write(
      'packages/app/src/widget/index.tsx',
      `import { island } from '@pyreon/server/client'\n` +
        `export const Inner = island(() => import('./deeper'), { name: 'Inner' })`,
    )
    t.write(
      'packages/app/src/outer.tsx',
      `export const Outer = island(() => import('./widget'), { name: 'Outer' })`,
    )
    // './widget' is a directory (statSync().isFile() false), `./widget.ts`
    // etc. do not exist, so resolution falls through to `widget/index.tsx`.
    expect(islandCodes(auditIslands(t.root))).toContain('nested-island')
  })

  it('skips an extension candidate that is itself a DIRECTORY', () => {
    const t = makeTree('island')
    // `panel.ts` exists as a DIRECTORY, so the `.ts` candidate is not a file
    // and resolution continues to the `.tsx` candidate.
    t.mkdir('packages/app/src/panel.ts')
    t.write(
      'packages/app/src/panel.tsx',
      `import { island } from '@pyreon/server/client'\n` +
        `export const Inner = island(() => import('./deeper'), { name: 'Inner' })`,
    )
    t.write(
      'packages/app/src/outer.tsx',
      `export const Outer = island(() => import('./panel'), { name: 'Outer' })`,
    )
    expect(islandCodes(auditIslands(t.root))).toContain('nested-island')
  })
})

describe('island-audit — hydrateIslands registry shapes', () => {
  function audit(src: string) {
    const t = makeTree('island')
    t.write('packages/a/src/a.ts', src)
    return auditIslands(t.root)
  }

  it('declines a non-object registry argument, accepts the object form', () => {
    expect(audit(`hydrateIslands(registry)`).summary.registryEntries).toBe(0)
    expect(audit(`hydrateIslands({ A: () => import('./a') })`).summary.registryEntries).toBe(1)
  })

  it('accepts a shorthand + string-literal key and skips a spread + computed key', () => {
    const r = audit(
      `const A = 1\nhydrateIslands({ ...base, [dyn]: 1, A, 'B': () => import('./b') })`,
    )
    expect(r.summary.registryEntries).toBe(2)
  })

  it('treats a NON-LITERAL dynamic import() specifier as recording no import', () => {
    // `import(spec)` (identifier argument) never reaches `record()`, so the
    // island's own module stays unimported and reads as dead. The literal
    // sibling below is the control that proves `record()` does fire.
    const t = makeTree('island')
    t.write(
      'packages/a/src/widget.tsx',
      `import { island } from '@pyreon/server/client'\n` +
        `export const A = island(() => import('./impl'), { name: 'A' })`,
    )
    t.write('packages/a/src/entry.tsx', `const spec = './widget'\nvoid import(spec)\n`)
    expect(islandCodes(auditIslands(t.root))).toContain('dead-island')

    const t2 = makeTree('island')
    t2.write(
      'packages/a/src/widget.tsx',
      `import { island } from '@pyreon/server/client'\n` +
        `export const A = island(() => import('./impl'), { name: 'A' })`,
    )
    t2.write('packages/a/src/entry.tsx', `void import('./widget')\n`)
    expect(islandCodes(auditIslands(t2.root))).not.toContain('dead-island')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ssg-audit
// ═══════════════════════════════════════════════════════════════════════════

function ssgCodes(root: string): SsgFindingCode[] {
  return auditSsg(root).findings.map((f) => f.code)
}

describe('ssg-audit — route walker skip arms', () => {
  it('skips dotfiles, node_modules/lib/dist and test dirs while looking for routes/', () => {
    const t = makeTree('ssg')
    const dyn = `export const renderMode = 'x'\nexport default function P() { return null }`
    for (const d of ['.hidden', 'node_modules', 'lib', 'dist', '__tests__', 'tests']) {
      t.write(`${d}/routes/[id].tsx`, dyn)
    }
    t.write('app/routes/[id].tsx', dyn)
    t.write('app/vite.config.ts', `export default { plugins: [zero({ mode: 'ssg' })] }`)
    // Only the non-skipped `app/routes` tree contributed a dynamic route.
    expect(auditSsg(t.root).summary.dynamicRoutes).toBe(1)
  })

  it('skips dotfiles + node_modules INSIDE routes/, and non-route file extensions', () => {
    const t = makeTree('ssg')
    t.write('app/routes/.hidden/[a].tsx', 'export default function P(){return null}')
    t.write('app/routes/node_modules/[b].tsx', 'export default function P(){return null}')
    t.write('app/routes/[c].test.tsx', 'export default function P(){return null}')
    t.write('app/routes/[d].css', 'body{}')
    t.write('app/routes/[e].tsx', 'export default function P(){return null}')
    expect(auditSsg(t.root).summary.dynamicRoutes).toBe(1)
  })

  it('stops the outer walk past depth 12', () => {
    const t = makeTree('ssg')
    const deep = Array.from({ length: 13 }, (_, i) => `d${i}`).join('/')
    t.write(`${deep}/routes/[id].tsx`, 'export default function P(){return null}')
    expect(auditSsg(t.root).summary.dynamicRoutes).toBe(0)
  })
})

describe('ssg-audit — getStaticPaths detector', () => {
  function app(files: Record<string, string>, ssg = true) {
    const t = makeTree('ssg')
    t.write(
      'app/vite.config.ts',
      ssg
        ? `export default { plugins: [zero({ mode: 'ssg' })] }`
        : `export default { plugins: [zero({ mode: 'spa' })] }`,
    )
    for (const [rel, body] of Object.entries(files)) t.write(`app/routes/${rel}`, body)
    return t.root
  }

  it('fires for a dynamic SSG page and stays quiet once getStaticPaths is exported', () => {
    const broken = app({ '[id].tsx': `export default function P(){ return null }` })
    expect(ssgCodes(broken)).toContain('dynamic-route-missing-get-static-paths')
    const fixed = app({
      '[id].tsx': `export const getStaticPaths = () => []\nexport default function P(){ return null }`,
    })
    expect(ssgCodes(fixed)).not.toContain('dynamic-route-missing-get-static-paths')
  })

  it('ignores a NON-exported `const getStaticPaths` — the export modifier is the contract', () => {
    const r = app({
      '[id].tsx': `const getStaticPaths = () => []\nexport default function P(){ return null }`,
    })
    expect(ssgCodes(r)).toContain('dynamic-route-missing-get-static-paths')
  })

  it('skips a special-prefixed file even when its name carries brackets', () => {
    const r = app({ '_layout.[id].tsx': `export default function L(){ return null }` })
    expect(ssgCodes(r)).not.toContain('dynamic-route-missing-get-static-paths')
  })

  it('caches the per-directory vite-mode verdict across sibling route files', () => {
    // Two dynamic routes in ONE directory: the second read hits the cache.
    const r = app({
      '[id].tsx': `export default function A(){ return null }`,
      '[slug].tsx': `export default function B(){ return null }`,
    })
    const hits = ssgCodes(r).filter((c) => c === 'dynamic-route-missing-get-static-paths')
    expect(hits.length).toBe(2)
  })
})

describe('ssg-audit — revalidate export', () => {
  function routeFile(body: string) {
    const t = makeTree('ssg')
    t.write('app/routes/post.tsx', body)
    return t.root
  }

  it('flags a non-literal revalidate and accepts numeric / false literals', () => {
    expect(ssgCodes(routeFile(`export const revalidate = TTL`))).toContain(
      'non-literal-revalidate-export',
    )
    expect(ssgCodes(routeFile(`export const revalidate = 60`))).not.toContain(
      'non-literal-revalidate-export',
    )
    expect(ssgCodes(routeFile(`export const revalidate = false`))).not.toContain(
      'non-literal-revalidate-export',
    )
  })

  it('ignores an UNINITIALIZED `export let revalidate` — no initializer to classify', () => {
    const root = routeFile(`export let revalidate\nexport default function P(){ return null }`)
    expect(ssgCodes(root)).not.toContain('non-literal-revalidate-export')
    expect(auditSsg(root).summary.revalidateExports).toBe(1)
  })

  it('ignores a non-exported revalidate but still descends for nested exports', () => {
    const root = routeFile(`const revalidate = TTL\nexport const other = 1`)
    expect(ssgCodes(root)).not.toContain('non-literal-revalidate-export')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// native-audit
// ═══════════════════════════════════════════════════════════════════════════

describe('native-audit — walker + declaration shapes', () => {
  it('stops descending past depth 14', () => {
    const t = makeTree('native', 'package.json')
    const deep = Array.from({ length: 15 }, (_, i) => `d${i}`).join('/')
    t.write(
      `${deep}/a.tsx`,
      `import { Stack } from '@pyreon/primitives'\nimport { rules } from '@pyreon/lint'\n`,
    )
    expect(auditNative(t.root).summary.multiplatformFiles).toBe(0)
  })

  it('skips dotfiles / node_modules / lib / dist / test dirs, keeps the sibling', () => {
    const t = makeTree('native', 'package.json')
    const src = `import { Stack } from '@pyreon/primitives'\n`
    for (const d of ['.hidden', 'node_modules', 'lib', 'dist', '__tests__', 'tests']) {
      t.write(`${d}/a.tsx`, src)
    }
    t.write('src/a.tsx', src)
    expect(auditNative(t.root).summary.multiplatformFiles).toBe(1)
  })

  it('names an anonymous default-exported class `<anonymous>`', () => {
    const t = makeTree('native', 'package.json')
    t.write(
      'src/a.tsx',
      `import { Stack } from '@pyreon/primitives'\nexport default class {}\n`,
    )
    const f = auditNative(t.root).findings.find((x) => x.code === 'native-unsupported-decl')
    expect(f?.message).toContain('<anonymous>')
  })
})

describe('native-audit — detectNativePatterns', () => {
  it('reports a SUBPATH web-only import with the generic reason fallback', () => {
    const diags = detectNativePatterns(
      `import { Stack } from '@pyreon/primitives'\n` +
        `import { rules } from '@pyreon/lint/rules'\n`,
    )
    const d = diags.find((x) => x.code === 'native-web-only-import')
    expect(d?.message).toContain('@pyreon/lint/rules')
    // The reason map is keyed by package ROOT, so a subpath spec misses and
    // falls back to the generic reason.
    expect(d?.message).toContain('no native frontend')
  })

  it('reports the curated reason for a bare package-root web-only import', () => {
    const diags = detectNativePatterns(
      `import { Stack } from '@pyreon/primitives'\nimport { rules } from '@pyreon/lint'\n`,
    )
    const d = diags.find((x) => x.code === 'native-web-only-import')
    expect(d?.message).toContain('@pyreon/lint')
    expect(d?.message).not.toContain('no native frontend')
  })

  it('derives the package root of a NON-scoped specifier without flagging it', () => {
    const diags = detectNativePatterns(
      `import { Stack } from '@pyreon/primitives'\nimport x from 'lodash/get'\n`,
    )
    expect(diags.filter((d) => d.code === 'native-web-only-import')).toEqual([])
  })

  it('stays silent for a pure-web snippet that never imports @pyreon/primitives', () => {
    expect(detectNativePatterns(`import { rules } from '@pyreon/lint'\nenum E { A }\n`)).toEqual([])
  })

  it('orders two diagnostics on the SAME line by column', () => {
    const diags = detectNativePatterns(
      `import { Stack } from '@pyreon/primitives'\nclass A {} class B {}\n`,
    )
    const decls = diags.filter((d) => d.code === 'native-unsupported-decl')
    expect(decls).toHaveLength(2)
    expect(decls[0]!.line).toBe(decls[1]!.line)
    expect(decls[0]!.column).toBeLessThan(decls[1]!.column)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// test-audit
// ═══════════════════════════════════════════════════════════════════════════

describe('test-audit — walker + explicit roots', () => {
  it('stops descending past depth 10', () => {
    const t = makeTree('testaudit')
    const deep = Array.from({ length: 11 }, (_, i) => `d${i}`).join('/')
    t.write(`packages/${deep}/a.test.ts`, 'it("x", () => {})')
    t.write('packages/b.test.ts', 'it("y", () => {})')
    expect(auditTestEnvironment(t.root).totalScanned).toBe(1)
  })

  it('uses `startDir` for relPath when explicit roots carry no rootDir', () => {
    const t = makeTree('testaudit')
    t.write('apps/web/a.test.ts', 'it("x", () => {})')
    const r = auditTestEnvironment(t.root, { roots: [join(t.root, 'apps')] })
    expect(r.root).toBe(t.root)
    expect(r.entries[0]?.relPath).toBe(join('apps', 'web', 'a.test.ts'))
  })

  it('honours an explicit rootDir for relPath', () => {
    const t = makeTree('testaudit')
    t.write('apps/web/a.test.ts', 'it("x", () => {})')
    const r = auditTestEnvironment(t.root, {
      roots: [join(t.root, 'apps')],
      rootDir: join(t.root, 'apps'),
    })
    expect(r.entries[0]?.relPath).toBe(join('web', 'a.test.ts'))
  })

  it('de-duplicates a file reachable from two overlapping roots', () => {
    const t = makeTree('testaudit')
    t.write('apps/web/a.test.ts', 'it("x", () => {})')
    const r = auditTestEnvironment(t.root, {
      roots: [join(t.root, 'apps'), join(t.root, 'apps', 'web')],
    })
    expect(r.totalScanned).toBe(1)
  })
})

describe('test-audit — formatTestAudit breakdown arms', () => {
  function entry(overrides: Partial<TestAuditEntry> = {}): TestAuditEntry {
    return {
      path: '/repo/packages/x/src/tests/a.test.ts',
      relPath: 'packages/x/src/tests/a.test.ts',
      mockVNodeLiteralCount: 0,
      mockHelperCount: 0,
      mockHelperCallCount: 0,
      realHCallCount: 0,
      importsH: false,
      risk: 'high',
      ...overrides,
    }
  }
  const result = (entries: TestAuditEntry[]): TestAuditResult => ({
    root: '/repo',
    entries,
    totalScanned: entries.length,
  })

  /** The single `- <relPath> — …` bullet the formatter emits for an entry. */
  function bulletOf(out: string): string {
    const line = out.split('\n').find((l) => l.startsWith('- packages/x/'))
    expect(line).toBeDefined()
    return line!
  }

  it('omits the literal segment when there are none and pluralizes the rest', () => {
    const bullet = bulletOf(
      formatTestAudit(
        result([entry({ mockVNodeLiteralCount: 0, mockHelperCount: 2, mockHelperCallCount: 3 })]),
        { minRisk: 'high' },
      ),
    )
    expect(bullet).not.toContain('literal')
    expect(bullet).toContain('2 helpers')
    expect(bullet).toContain('3 helper calls')
    expect(bullet).toContain('5 mock signals')
  })

  it('omits the helper segments when only literals are present', () => {
    const bullet = bulletOf(
      formatTestAudit(result([entry({ mockVNodeLiteralCount: 4 })]), { minRisk: 'high' }),
    )
    expect(bullet).toContain('4 literals')
    expect(bullet).not.toContain('helper')
  })
})
