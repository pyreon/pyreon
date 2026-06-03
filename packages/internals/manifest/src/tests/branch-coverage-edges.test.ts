/**
 * Branch-coverage edge tests for define + discovery + render.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defineManifest } from '../define'
import { getPackageCategories } from '../discovery'
import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '../render'

describe('define — manifest without `api`', () => {
  it('accepts a manifest with no api[] (skips deprecation policy loop)', () => {
    const m = defineManifest({
      name: '@pyreon/test',
      tagline: 'Test pkg',
      description: 'Edge.',
      category: 'universal',
      features: [],
      api: [],
      longExample: 'Test pkg.',
    })
    expect(m.name).toBe('@pyreon/test')
    expect(m.api.length).toBe(0)
  })
})

describe('discovery.getPackageCategories — workspaces shapes', () => {
  let tmp: string

  afterEach(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  it('reads from { packages: [...] } object form (non-Array workspaces)', () => {
    tmp = mkdtempSync(join(tmpdir(), 'manifest-'))
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ workspaces: { packages: ['packages/core/*', 'packages/zero/*'] } }),
    )
    const cats = [...getPackageCategories(tmp)].sort()
    expect(cats).toEqual(['core', 'zero'])
  })

  it('falls back to defaults when package.json has no workspaces', () => {
    tmp = mkdtempSync(join(tmpdir(), 'manifest-'))
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({}))
    const cats = getPackageCategories(tmp)
    expect(cats).toContain('core')
  })

  it('falls back to defaults when package.json read throws', () => {
    tmp = mkdtempSync(join(tmpdir(), 'manifest-'))
    // No package.json → readFileSync throws → catch path returns fallback.
    const cats = getPackageCategories(tmp)
    expect(cats).toContain('core')
  })

  it('skips glob entries that do not match packages/<cat>/* shape', () => {
    tmp = mkdtempSync(join(tmpdir(), 'manifest-'))
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ workspaces: ['examples/*', 'docs', 'packages/core/*'] }),
    )
    const cats = getPackageCategories(tmp)
    // Only the matching glob's category is picked up.
    expect(cats).toEqual(['core'])
  })
})

describe('render — empty + deprecated + stability edges', () => {
  const baseManifest = defineManifest({
    name: '@pyreon/test',
    tagline: 'Test pkg',
    description: '',
    category: 'universal',
    features: [],
    longExample: 'Test pkg.',
    api: [
      {
        name: 'doThing',
        kind: 'function',
        signature: '() => void',
        example: '`doThing()`',
        summary: '',
        stability: 'deprecated',
        deprecated: { since: '0.1.0', removeIn: '1.0.0' },
      },
      {
        name: 'doOther',
        kind: 'function',
        signature: '() => void',
        example: '`doOther()`',
        summary: '',
        stability: 'experimental',
      },
    ],
  })

  it('renderLlmsTxtLine + renderLlmsFullSection emit the manifest name', () => {
    expect(renderLlmsTxtLine(baseManifest)).toContain('@pyreon/test')
    expect(renderLlmsFullSection(baseManifest)).toContain('@pyreon/test')
  })

  it('renderApiReferenceEntries includes [DEPRECATED] / [EXPERIMENTAL] when summary is empty', () => {
    const entries = renderApiReferenceEntries(baseManifest)
    const notes = Object.values(entries).map((e) => e.notes ?? '').join('\n')
    expect(notes).toContain('[DEPRECATED]')
    expect(notes).toContain('[EXPERIMENTAL]')
  })

  it('renderApiReferenceEntries includes Deprecated trailer without replaced-by when replacement missing', () => {
    const entries = renderApiReferenceEntries(baseManifest)
    const notes = Object.values(entries).map((e) => e.notes ?? '').join('\n')
    expect(notes).toContain('Deprecated since v0.1.0')
    expect(notes).not.toContain('replaced by')
    expect(notes).toContain('removal planned in v1.0.0')
  })

  it('renderApiReferenceEntries omits notes when api entry has none of the optional metadata', () => {
    const m = defineManifest({
      name: '@pyreon/empty',
      tagline: 'Empty',
      description: '',
      category: 'universal',
      features: [],
      longExample: 'Empty.',
      api: [
        {
          name: 'plain',
          kind: 'function',
          signature: '() => void',
          example: '`plain()`',
          summary: '',
        },
      ],
    })
    const entries = renderApiReferenceEntries(m)
    // Empty summary + no stability + no deprecated → notes is undefined.
    expect(entries['empty/plain']?.notes).toBeUndefined()
  })
})
