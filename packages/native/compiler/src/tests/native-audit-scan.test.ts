/**
 * Scan-surface and edge specs for the multiplatform project audit
 * (`auditNative` / `detectNativePatterns`, served as
 * `@pyreon/native-compiler/audit`). Moved here, assertion for assertion, from
 * `@pyreon/compiler`, which no longer carries the native story.
 *
 * An audit whose scan misses the files it is about reports nothing, and
 * nothing renders as a clean bill of health -- so each rule gets both
 * directions: the file that MUST be found and the file that must be skipped.
 *
 * Parser note: the audit now parses with oxc (what PMTC itself uses). The one
 * behavioral difference from the previous TypeScript-API parser is syntax-error
 * recovery -- see the "unparsable" specs.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditNative, detectNativePatterns } from '../audit'

const cleanups: string[] = []
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true })
})

function makeTree(prefix: string, sentinel: 'packages' | 'package.json') {
  const root = mkdtempSync(join(tmpdir(), `pyreon-native-audit-${prefix}-`))
  cleanups.push(root)
  if (sentinel === 'packages') mkdirSync(join(root, 'packages'), { recursive: true })
  else writeFileSync(join(root, 'package.json'), '{}')
  return {
    root,
    write(rel: string, body: string) {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, body, 'utf8')
      return abs
    },
  }
}

// The `shared`/`repo`/`write` helpers the first block used, local to this file.
let root: string
const write = (rel: string, body: string): string => {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
  return abs
}
const repo = (): void => {
  mkdirSync(join(root, 'packages'), { recursive: true })
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-native-audit-edges-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the native audit reports what cannot cross to iOS/Android', () => {
  const shared = (body: string) => detectNativePatterns(`import '@pyreon/primitives'\n${body}`, 'shared.tsx')

  it('names a WEB-ONLY import in a shared-source file', () => {
    // The control. A shared file importing a web-only package compiles on the
    // web and produces a native app missing that feature, with the loss
    // reported nowhere unless this audit says so.
    const diags = shared("import { mount } from '@pyreon/runtime-dom'\nexport const x = mount\n")
    expect(diags.length).toBeGreaterThan(0)
    expect(diags[0]?.message).toContain('@pyreon/runtime-dom')
  })

  it('stays SILENT in a file that is not shared source', () => {
    // The audit is scoped by the `@pyreon/primitives` import — the marker that
    // says "this file is meant to cross". Reporting on every web file would
    // bury the findings that matter under the whole app.
    expect(
      detectNativePatterns("import { mount } from '@pyreon/runtime-dom'\n", 'web-only.tsx'),
    ).toEqual([])
  })

  it('reports an ENUM, which has no native counterpart', () => {
    // A TS enum lowers to a runtime object the native emitters cannot
    // represent. The message has to name the alternative, or the author is
    // told only that their code is wrong.
    const diags = shared('export enum Mode { A, B }\n')
    const enumDiag = diags.find((d) => /enum/i.test(d.message))
    expect(enumDiag, 'the enum is reported').toBeTruthy()
    // The remedy travels WITH the finding, in `suggested` — a diagnostic that
    // says only "this is unsupported" leaves the author to guess, and the
    // guess for an enum is usually a class, which is also unsupported.
    expect(enumDiag?.suggested).toContain('string-literal union')
  })

  it('reports a CLASS, and points at the shape that does cross', () => {
    const diags = shared('export class Store { x = 1 }\n')
    const classDiag = diags.find((d) => /class/i.test(d.message))
    expect(classDiag, 'the class is reported').toBeTruthy()
    expect(classDiag?.suggested).toContain('defineStore')
  })

  it('names an ANONYMOUS declaration rather than printing undefined', () => {
    const diags = shared('export default class { x = 1 }\n')
    expect(diags.some((d) => d.message.includes('<anonymous>'))).toBe(true)
  })

  it('orders diagnostics by position, so two runs read the same', () => {
    const diags = shared('export class B { x = 1 }\nexport enum A { X }\n')
    const keys = diags.map((d) => d.line * 1000 + d.column)
    expect(keys).toEqual([...keys].sort((a, b) => a - b))
  })

  it('reports NOTHING for a shared file that is genuinely portable', () => {
    // The quiet direction: an audit that fires on portable code gets ignored.
    expect(shared("import { signal } from '@pyreon/reactivity'\nexport const c = signal(0)\n")).toEqual(
      [],
    )
  })

  it('walks a whole TREE and counts the shared files it found', () => {
    // The project-level entry. A walk that finds nothing reports a clean
    // multiplatform story for an app that has never been checked.
    repo()
    write(
      'packages/app/src/shared.tsx',
      "import '@pyreon/primitives'\nimport { mount } from '@pyreon/runtime-dom'\nexport const x = mount\n",
    )
    write('packages/app/src/web.tsx', "import { mount } from '@pyreon/runtime-dom'\nexport const y = mount\n")
    const r = auditNative(root)
    expect(r.summary.multiplatformFiles, 'one shared file, not two').toBe(1)
    expect(r.findings.map((f) => f.code)).toContain('web-only-package-import')
  })

  it('skips node_modules, build output and test directories while walking', () => {
    // Findings in a dependency are not the author\'s to fix, and a walk into
    // `node_modules` takes minutes.
    repo()
    const bad = "import '@pyreon/primitives'\nimport { mount } from '@pyreon/runtime-dom'\nexport const x = mount\n"
    write('packages/app/node_modules/dep/src/a.tsx', bad)
    write('packages/app/lib/a.tsx', bad)
    write('packages/app/dist/a.tsx', bad)
    write('packages/app/src/__tests__/a.tsx', bad)
    write('packages/app/.cache/a.tsx', bad)
    expect(auditNative(root).summary.multiplatformFiles).toBe(0)
  })
})

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

describe('native-audit — unparsable specifiers and non-scoped package roots', () => {
  const TEMPLATE_SPEC = 'import lib from `./lib`\n'

  // The previous TypeScript-API parser recovered from a template-literal module
  // specifier and still read the rest of the file. oxc -- the parser PMTC itself
  // uses -- cannot, so the file is UNPARSABLE and skipped, exactly as the
  // compiler it audits would refuse it. The invariants worth keeping: such a
  // file never throws, never counts as multiplatform, and never derails the
  // scan of its neighbours.
  it('skips an UNPARSABLE file in the project walk without derailing its siblings', () => {
    const t = makeTree('native', 'package.json')
    t.write(
      'src/broken.tsx',
      `${TEMPLATE_SPEC}import { Stack } from '@pyreon/primitives'\nimport { rules } from '@pyreon/lint'\n`,
    )
    t.write(
      'src/ok.tsx',
      `import { Stack } from '@pyreon/primitives'\nimport { rules } from '@pyreon/lint'\n`,
    )
    const r = auditNative(t.root)
    expect(r.summary.filesScanned).toBe(2)
    expect(r.summary.multiplatformFiles, 'only the parsable file is audited').toBe(1)
    expect(r.findings.map((f) => f.location.relPath)).toEqual(['src/ok.tsx'])
  })

  it('returns no diagnostics (and does not throw) for an UNPARSABLE snippet', () => {
    expect(
      detectNativePatterns(
        `${TEMPLATE_SPEC}import { Stack } from '@pyreon/primitives'\nimport { rules } from '@pyreon/lint'\n`,
      ),
    ).toEqual([])
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
