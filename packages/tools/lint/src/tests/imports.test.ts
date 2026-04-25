import { describe, expect, it } from 'vitest'
import {
  extractImportInfo,
  getLocalName,
  importsName,
  isPyreonImport,
  isPyreonPackage,
} from '../utils/imports'

// Coverage gap closed in PR #323. The imports utils are pure AST
// readers — `extractImportInfo` walks an oxc-style ImportDeclaration
// node, the rest are convenience predicates over the resulting
// ImportInfo shape. Used by ~30 lint rules; unit-tested here so a
// future refactor doesn't silently break import-aware rules.

const importDecl = (
  source: string,
  specifiers: Array<{ kind: 'default' | 'ns' | 'named'; imported?: string; local: string }>,
) => ({
  type: 'ImportDeclaration',
  source: { value: source },
  specifiers: specifiers.map((s) => {
    if (s.kind === 'default') return { type: 'ImportDefaultSpecifier', local: { name: s.local } }
    if (s.kind === 'ns') return { type: 'ImportNamespaceSpecifier', local: { name: s.local } }
    return {
      type: 'ImportSpecifier',
      imported: { type: 'Identifier', name: s.imported },
      local: { name: s.local },
    }
  }),
})

describe('imports utils — Pyreon import classifiers', () => {
  it('isPyreonImport recognises @pyreon/* sources', () => {
    expect(isPyreonImport('@pyreon/core')).toBe(true)
    expect(isPyreonImport('@pyreon/router')).toBe(true)
    expect(isPyreonImport('react')).toBe(false)
    expect(isPyreonImport('@vue/runtime-core')).toBe(false)
  })

  it('isPyreonPackage matches the same prefix', () => {
    expect(isPyreonPackage('@pyreon/flow')).toBe(true)
    expect(isPyreonPackage('react')).toBe(false)
  })
})

describe('imports utils — extractImportInfo', () => {
  it('returns null for non-ImportDeclaration nodes', () => {
    expect(extractImportInfo({ type: 'ExpressionStatement' })).toBeNull()
  })

  it('returns null when source value is missing', () => {
    expect(extractImportInfo({ type: 'ImportDeclaration', source: {}, specifiers: [] })).toBeNull()
  })

  it('extracts default import', () => {
    const info = extractImportInfo(importDecl('react', [{ kind: 'default', local: 'React' }]))
    expect(info).toEqual({
      source: 'react',
      specifiers: [{ imported: 'default', local: 'React' }],
      isDefault: true,
      isNamespace: false,
    })
  })

  it('extracts namespace import', () => {
    const info = extractImportInfo(importDecl('@pyreon/core', [{ kind: 'ns', local: 'P' }]))
    expect(info).toEqual({
      source: '@pyreon/core',
      specifiers: [{ imported: '*', local: 'P' }],
      isDefault: false,
      isNamespace: true,
    })
  })

  it('extracts named imports (Identifier form)', () => {
    const info = extractImportInfo(
      importDecl('@pyreon/reactivity', [
        { kind: 'named', imported: 'signal', local: 'signal' },
        { kind: 'named', imported: 'computed', local: 'computed' },
      ]),
    )
    expect(info?.source).toBe('@pyreon/reactivity')
    expect(info?.specifiers).toEqual([
      { imported: 'signal', local: 'signal' },
      { imported: 'computed', local: 'computed' },
    ])
    expect(info?.isDefault).toBe(false)
    expect(info?.isNamespace).toBe(false)
  })

  it('extracts named imports with renaming (local name differs)', () => {
    const info = extractImportInfo(
      importDecl('@pyreon/core', [
        { kind: 'named', imported: 'h', local: 'createElement' },
      ]),
    )
    expect(info?.specifiers).toEqual([{ imported: 'h', local: 'createElement' }])
  })

  it('handles imported as Literal (string-keyed export — type Literal node)', () => {
    const info = extractImportInfo({
      type: 'ImportDeclaration',
      source: { value: '@pyreon/core' },
      specifiers: [
        {
          type: 'ImportSpecifier',
          imported: { type: 'Literal', value: 'use client' },
          local: { name: 'useClient' },
        },
      ],
    })
    expect(info?.specifiers).toEqual([{ imported: 'use client', local: 'useClient' }])
  })

  it('handles missing specifiers array', () => {
    const info = extractImportInfo({
      type: 'ImportDeclaration',
      source: { value: 'noop' },
    })
    expect(info?.specifiers).toEqual([])
  })

  it('mixed default + named not standardly emitted but the builder is permissive', () => {
    const info = extractImportInfo(
      importDecl('react', [
        { kind: 'default', local: 'React' },
        { kind: 'named', imported: 'useState', local: 'useState' },
      ]),
    )
    expect(info?.isDefault).toBe(true)
    expect(info?.specifiers).toHaveLength(2)
  })
})

describe('imports utils — importsName', () => {
  const imports = [
    extractImportInfo(
      importDecl('@pyreon/reactivity', [{ kind: 'named', imported: 'signal', local: 'signal' }]),
    )!,
    extractImportInfo(
      importDecl('@pyreon/core', [{ kind: 'named', imported: 'h', local: 'h' }]),
    )!,
  ]

  it('returns true when an import imports the named export', () => {
    expect(importsName(imports, 'signal')).toBe(true)
    expect(importsName(imports, 'h')).toBe(true)
  })

  it('returns false when the name is not imported', () => {
    expect(importsName(imports, 'computed')).toBe(false)
  })

  it('respects fromPackage filter — same name from different package returns false', () => {
    expect(importsName(imports, 'signal', '@pyreon/reactivity')).toBe(true)
    expect(importsName(imports, 'signal', '@pyreon/core')).toBe(false)
  })
})

describe('imports utils — getLocalName', () => {
  const imports = [
    extractImportInfo(
      importDecl('@pyreon/core', [
        { kind: 'named', imported: 'h', local: 'createElement' },
      ]),
    )!,
  ]

  it('returns the local alias when the export is imported', () => {
    expect(getLocalName(imports, 'h')).toBe('createElement')
  })

  it('returns null when not imported', () => {
    expect(getLocalName(imports, 'unused')).toBeNull()
  })

  it('respects fromPackage filter', () => {
    expect(getLocalName(imports, 'h', '@pyreon/core')).toBe('createElement')
    expect(getLocalName(imports, 'h', 'react')).toBeNull()
  })
})
