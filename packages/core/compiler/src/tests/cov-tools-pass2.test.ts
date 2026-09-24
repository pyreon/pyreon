/**
 * Second-pass branch-coverage specs — the arms the first pass left, each
 * one reachable only through a shape the earlier fixtures did not produce.
 * Same discipline: the input that takes the arm, paired with the neighbour
 * that must not.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { transformClientDirectives } from '../client-directives'
import { auditIslands } from '../island-audit'
import { auditNative, detectNativePatterns } from '../native-audit'
import { detectPyreonPatterns, type PyreonDiagnosticCode } from '../pyreon-intercept'
import { migrateReactCode } from '../react-intercept'

const cleanups: string[] = []
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true })
})

function makeTree(prefix: string, sentinel: 'packages' | 'package.json') {
  const root = mkdtempSync(join(tmpdir(), `pyreon-cov2-${prefix}-`))
  cleanups.push(root)
  if (sentinel === 'packages') mkdirSync(join(root, 'packages'), { recursive: true })
  else writeFileSync(join(root, 'package.json'), '{}')
  return {
    root,
    write(rel: string, body: string) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, body, 'utf8')
    },
  }
}

const pyreonCodes = (src: string, file = 'input.tsx'): PyreonDiagnosticCode[] =>
  detectPyreonPatterns(src, file).map((d) => d.code)

// ═══════════════════════════════════════════════════════════════════════════
// client-directives — the whitespace-eat guard
// ═══════════════════════════════════════════════════════════════════════════

describe('client-directives — attribute removal whitespace handling', () => {
  it('eats one leading space, and eats NOTHING when the previous char is `}`', () => {
    const spaced = transformClientDirectives(
      `import { Widget } from './widget'\nexport const P = () => <Widget hydrate="visible" id="a" />\n`,
      '/app/src/p.tsx',
    )
    expect(spaced.changed).toBe(true)
    expect(spaced.code).not.toContain('hydrate=')
    expect(spaced.code).toContain('id="a"')

    // JSX allows an attribute to follow a spread with no separating space, so
    // the character before `hydrate` is `}` rather than whitespace.
    const tight = transformClientDirectives(
      `import { Widget } from './widget'\nexport const P = () => <Widget {...rest}hydrate="visible" />\n`,
      '/app/src/p.tsx',
    )
    expect(tight.changed).toBe(true)
    expect(tight.code).not.toContain('hydrate=')
    expect(tight.code).toContain('{...rest}')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// island-audit — zero-argument import() and extension-complete specifiers
// ═══════════════════════════════════════════════════════════════════════════

describe('island-audit — import() argument shapes', () => {
  it('leaves importPath undefined for a ZERO-ARGUMENT loader import()', () => {
    const t = makeTree('island', 'packages')
    // `island(() => import(), …)` still declares an island (the name is read)
    // but has no resolvable target, so the nested detector cannot fire.
    t.write(
      'packages/app/src/inner.tsx',
      `import { island } from '@pyreon/server/client'\n` +
        `export const Inner = island(() => import('./deeper'), { name: 'Inner' })`,
    )
    t.write(
      'packages/app/src/outer.tsx',
      `export const Outer = island(() => import(), { name: 'Outer' })`,
    )
    const r = auditIslands(t.root)
    expect(r.summary.islandsDeclared).toBe(2)
    expect(r.findings.map((f) => f.code)).not.toContain('nested-island')
  })

  it('records nothing for a ZERO-ARGUMENT dynamic import() elsewhere in a file', () => {
    const t = makeTree('island', 'packages')
    t.write(
      'packages/app/src/widget.tsx',
      `import { island } from '@pyreon/server/client'\n` +
        `export const A = island(() => import('./impl'), { name: 'A' })`,
    )
    t.write('packages/app/src/entry.tsx', `void import()\n`)
    // The bare `import()` contributes no import edge, so the island reads dead.
    expect(auditIslands(t.root).findings.map((f) => f.code)).toContain('dead-island')
  })

  it('resolves an import specifier that ALREADY carries its extension', () => {
    const t = makeTree('island', 'packages')
    t.write(
      'packages/app/src/widget.tsx',
      `import { island } from '@pyreon/server/client'\n` +
        `export const A = island(() => import('./impl'), { name: 'A' })`,
    )
    // `./widget.tsx` names the file directly — statSync().isFile() is true on
    // the FIRST probe, before any extension completion is attempted.
    t.write('packages/app/src/entry.tsx', `import './widget.tsx'\n`)
    expect(auditIslands(t.root).findings.map((f) => f.code)).not.toContain('dead-island')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// native-audit — non-string module specifiers + non-scoped package roots
// ═══════════════════════════════════════════════════════════════════════════

describe('native-audit — module specifier shapes', () => {
  const TEMPLATE_SPEC = 'import lib from `./lib`\n'

  it('skips a NON-string-literal module specifier in the project walk', () => {
    const t = makeTree('native', 'package.json')
    t.write(
      'src/a.tsx',
      `${TEMPLATE_SPEC}import { Stack } from '@pyreon/primitives'\nimport { rules } from '@pyreon/lint'\n`,
    )
    const r = auditNative(t.root)
    // The template-literal specifier is skipped; the two real ones are read.
    expect(r.summary.multiplatformFiles).toBe(1)
    expect(r.findings.map((f) => f.code)).toContain('web-only-package-import')
  })

  it('skips a NON-string-literal module specifier in the snippet detector', () => {
    const diags = detectNativePatterns(
      `${TEMPLATE_SPEC}import { Stack } from '@pyreon/primitives'\nimport { rules } from '@pyreon/lint'\n`,
    )
    expect(diags.map((d) => d.code)).toContain('native-web-only-import')
  })

  it('derives the root of a NON-scoped specifier during the project walk', () => {
    const t = makeTree('native', 'package.json')
    t.write(
      'src/a.tsx',
      `import { Stack } from '@pyreon/primitives'\nimport get from 'lodash/get'\n`,
    )
    const r = auditNative(t.root)
    expect(r.summary.multiplatformFiles).toBe(1)
    expect(r.findings.map((f) => f.code)).not.toContain('web-only-package-import')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// pyreon-intercept — remaining detector arms
// ═══════════════════════════════════════════════════════════════════════════

describe('detectPyreonPatterns — containsJsx on a non-arrow function', () => {
  it('stays quiet for a JSX-less FunctionDeclaration that destructures', () => {
    // Reaches the expression-bodied-arrow fallback with a node that is NOT an
    // arrow, so the shortcut declines on its first operand.
    expect(pyreonCodes(`function sum({ a, b }) { return a + b }`)).not.toContain(
      'props-destructured',
    )
  })

  it('stays quiet for a JSX-less FunctionExpression that destructures', () => {
    expect(pyreonCodes(`const sum = function ({ a, b }) { return a + b }`)).not.toContain(
      'props-destructured',
    )
  })
})

describe('detectPyreonPatterns — process dev-gate with a private-identifier receiver', () => {
  it('stays quiet when the `env` segment is a PRIVATE identifier', () => {
    const src =
      `class A {\n` +
      `  #env = {}\n` +
      `  m() {\n` +
      `    if (typeof process !== 'undefined' && this.#env.NODE_ENV !== 'production') { log() }\n` +
      `  }\n` +
      `}\n`
    expect(pyreonCodes(src, 'a.ts')).not.toContain('process-dev-gate')
  })
})

describe('detectPyreonPatterns — date-math-random-id inside a BINARY expression', () => {
  it('fires when both halves are present in a concatenation', () => {
    expect(pyreonCodes(`const id = Date.now() + Math.random().toString(36)`, 'a.ts')).toContain(
      'date-math-random-id',
    )
  })

  it('stays quiet for a concatenation carrying only Date.now()', () => {
    expect(pyreonCodes(`const id = Date.now() + '-suffix'`, 'a.ts')).not.toContain(
      'date-math-random-id',
    )
  })

  it('stays quiet for a concatenation carrying only Math.random()', () => {
    expect(pyreonCodes(`const id = 'p-' + Math.random()`, 'a.ts')).not.toContain(
      'date-math-random-id',
    )
  })
})

describe('detectPyreonPatterns — early returns whose consequent is a plain statement', () => {
  it('stays quiet when the guarded branch neither returns null nor returns at all', () => {
    // `returnsNullStatement` / `nonNullEarlyReturn` both reach their
    // not-a-Block, not-a-Return fallback here.
    const src = `const c = signal(false)\nfunction C(props) { if (c()) log()\n  return <div /> }`
    const codes = pyreonCodes(src)
    expect(codes).not.toContain('static-return-null-conditional')
    expect(codes).not.toContain('static-early-return-conditional')
  })

  it('still fires for the genuine null-return form in the same component shape', () => {
    const src = `const c = signal(false)\nfunction C(props) { if (c()) return null\n  return <div /> }`
    expect(pyreonCodes(src)).toContain('static-return-null-conditional')
  })
})

describe('detectPyreonPatterns — accessor reads seen through type-only layers', () => {
  // `unwrapValueLayers` peels parens / `satisfies` / `!` before deciding
  // whether a template span is a bare accessor read, so each wrapper below
  // must still be recognized as the SAME footgun.
  const decl = `const width = signal(10)\n`

  it('sees a PARENTHESIZED accessor interpolation', () => {
    expect(pyreonCodes(`${decl}const s = \`w=\${(width)}%\`\n`, 'a.ts')).toContain(
      'accessor-uncalled-in-template',
    )
  })

  it('sees an accessor behind a `satisfies` layer', () => {
    expect(
      pyreonCodes(`${decl}const s = \`w=\${(width satisfies never)}%\`\n`, 'a.ts'),
    ).toContain('accessor-uncalled-in-template')
  })

  it('sees an accessor behind a non-null assertion', () => {
    expect(pyreonCodes(`${decl}const s = \`w=\${width!}%\`\n`, 'a.ts')).toContain(
      'accessor-uncalled-in-template',
    )
  })

  it('stays quiet once the wrapped accessor is CALLED', () => {
    expect(pyreonCodes(`${decl}const s = \`w=\${(width)()}%\`\n`, 'a.ts')).not.toContain(
      'accessor-uncalled-in-template',
    )
  })

  it('does not treat a MEMBER call as calling the tracked name in a condition', () => {
    // `subtreeCallsName` must reject `obj.width()` — the callee is not the
    // bare identifier — so the bare-truthiness footgun still reports.
    expect(pyreonCodes(`${decl}if (width) { obj.width() }\n`, 'a.ts')).toContain(
      'accessor-uncalled-in-condition',
    )
  })

  it('DOES treat a direct call in the same statement as a guard shape', () => {
    expect(pyreonCodes(`${decl}if (width) { use(width()) }\n`, 'a.ts')).not.toContain(
      'accessor-uncalled-in-condition',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// react-intercept — import-block placement with a non-react import present
// ═══════════════════════════════════════════════════════════════════════════

describe('migrateReactCode — new imports land after an existing NON-react import', () => {
  it('inserts the pyreon import block after the last import line', () => {
    // A side-effect import is not rewritten, so `findLastImportEnd` has a real
    // offset to insert at AND the migration still needs a NEW `effect` import.
    const r = migrateReactCode(`import './reset.css'\nuseEffect(() => { f() }, deps)\n`, 'a.ts')
    const lines = r.code.split('\n')
    expect(lines[0]).toBe(`import './reset.css'`)
    expect(lines[1]).toContain('@pyreon/reactivity')
    expect(r.code).toContain('effect(')
  })

  it('prepends the block when there is no import line to anchor to', () => {
    const r = migrateReactCode(`useEffect(() => { f() }, deps)\n`, 'a.ts')
    expect(r.code.split('\n')[0]).toContain('@pyreon/reactivity')
  })
})
