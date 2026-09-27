// The published-declarations gate: which packages a `.d.ts` imports, and which
// of those the package failed to declare.
//
// An undeclared import in a declaration file is silent for a consumer: under
// the default `skipLibCheck: true` TypeScript does not report the unresolvable
// module and the type becomes `any`. `@pyreon/feature` shipped
// `import("@tanstack/table-core")` that way (a package only `@pyreon/table`
// declares), and `@pyreon/document-primitives` shipped `import("@pyreon/ui-core")`.
import { describe, expect, it } from 'vitest'
import {
  declarationImports,
  packageOf,
  typesEntries,
  undeclaredImports,
} from '../../../../../scripts/check-declarations'

describe('declarationImports', () => {
  it('finds every import form the declaration emitter writes', () => {
    const src = [
      `import { a } from "@scope/one";`,
      `import type { B } from '@scope/two/sub';`,
      `export { c } from "three";`,
      `export * from 'four/deep/path';`,
      `import "five";`,
      `declare const x: import("@tanstack/table-core").TableFeature;`,
    ].join('\n')
    expect([...declarationImports(src)].sort()).toEqual([
      '@scope/one',
      '@scope/two',
      '@tanstack/table-core',
      'five',
      'four',
      'three',
    ])
  })

  it('ignores relative, node: and builtin specifiers', () => {
    const src = `import { a } from './chunk';\nimport { b } from 'node:fs';\nimport { c } from 'path';`
    expect([...declarationImports(src)]).toEqual([])
  })

  it('ignores specifier-shaped PROSE inside comments', () => {
    // Real doc comments in the shipped declarations read like this.
    const src = `/**\n * falls back to the default from 'no config' when absent\n */\n// see import("fake-pkg")\nexport {}`
    expect([...declarationImports(src)]).toEqual([])
  })
})

describe('packageOf', () => {
  it('reduces a deep specifier to its package', () => {
    expect(packageOf('@pyreon/atlas/ui')).toBe('@pyreon/atlas')
    expect(packageOf('lodash/fp/map')).toBe('lodash')
    expect(packageOf('./x')).toBeNull()
    expect(packageOf('node:path')).toBeNull()
  })
})

describe('undeclaredImports', () => {
  const pkg = {
    name: '@pyreon/feature',
    dependencies: { '@pyreon/table': 'workspace:^' },
    peerDependencies: { '@pyreon/core': 'workspace:^' },
  }

  it('flags a package reached only through a dependency', () => {
    expect(undeclaredImports(pkg, ['@pyreon/table', '@tanstack/table-core'])).toEqual([
      '@tanstack/table-core',
    ])
  })

  it('accepts dependencies, peers, and the package itself', () => {
    expect(undeclaredImports(pkg, ['@pyreon/table', '@pyreon/core', '@pyreon/feature'])).toEqual([])
  })
})

describe('typesEntries', () => {
  it('collects the top-level types and every nested exports condition', () => {
    const entries = typesEntries({
      name: 'x',
      types: './lib/types/index.d.ts',
      exports: {
        '.': { bun: './src/index.ts', import: './lib/index.js', types: './lib/types/index.d.ts' },
        './ui': { import: { types: './lib/types/ui.d.ts', default: './lib/ui.js' } },
        './package.json': './package.json',
      },
    })
    expect(entries).toEqual(['./lib/types/index.d.ts', './lib/types/ui.d.ts'])
  })
})
