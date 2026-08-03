/**
 * Entry collection — the filter `atlas dev` and `atlas build` share.
 *
 * It is shared precisely because both must hide the same things: a workbench
 * that lists a component the built site hides (or the reverse) is a difference
 * nobody would think to look for.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence } from '../../core'
import { collectEntries, importsAtlas } from '../entries'

const component = (name: string, source?: string): ComponentIntelligence => ({
  name,
  controls: [],
  axes: [],
  scenarios: [],
  tags: [],
  ...(source !== undefined ? { source } : {}),
})

describe('importsAtlas', () => {
  it.each([
    ["import { Workbench } from '@pyreon/atlas/ui'", true],
    ["export { x } from '@pyreon/atlas'", true],
    ["await import('@pyreon/atlas/ui')", true],
    ["require('@pyreon/atlas')", true],
  ])('detects %s', (source, expected) => {
    expect(importsAtlas(source)).toBe(expected)
  })

  it('does NOT treat prose as a dependency', () => {
    // The bug this replaced: a `.includes('@pyreon/atlas')` check made a
    // component whose COMMENT mentioned the package vanish from the sidebar.
    expect(importsAtlas('// see @pyreon/atlas for the workbench')).toBe(false)
    expect(importsAtlas('const doc = "read @pyreon/atlas docs"')).toBe(false)
  })

  it('does not match a package whose name merely starts the same', () => {
    expect(importsAtlas("import x from '@pyreon/atlas-extra'")).toBe(false)
  })
})

describe('collectEntries', () => {
  it('drops a component with no recorded source', () => {
    // It cannot be imported, so selecting it would blank the canvas — which
    // reads as "this component renders nothing", a different and much more
    // confusing bug than not being listed.
    const entries = collectEntries('/p', [component('A', 'a.tsx'), component('B')], {
      readSource: () => '',
    })
    expect(entries.map((e) => e.component.name)).toEqual(['A'])
  })

  it('drops workbench infrastructure, whatever it is called', () => {
    const entries = collectEntries('/p', [component('Shell', 'shell.tsx'), component('B', 'b.tsx')], {
      readSource: (file) =>
        file.endsWith('shell.tsx') ? "import { Workbench } from '@pyreon/atlas/ui'" : '',
    })
    expect(entries.map((e) => e.component.name)).toEqual(['B'])
  })

  it('KEEPS a component whose source cannot be read', () => {
    // Failing visibly beats disappearing silently: an unreadable file is a
    // problem worth seeing, and hiding the component hides the problem too.
    const entries = collectEntries('/p', [component('A', 'a.tsx')], {
      readSource: () => {
        throw new Error('EACCES')
      },
    })
    expect(entries).toHaveLength(1)
  })

  it('resolves the source to an absolute path against the root', () => {
    const entries = collectEntries('/p', [component('A', 'src/a.tsx')], { readSource: () => '' })
    expect(entries[0]!.file).toBe('/p/src/a.tsx')
  })
})
