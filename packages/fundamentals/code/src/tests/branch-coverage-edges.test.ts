/**
 * Branch-coverage edge tests — paths that the main `code.test.ts` and
 * `bind-signal.test.ts` happy-paths don't reach.
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { bindEditorToSignal } from '../bind-signal'
import { createEditor } from '../editor'
import { _tabKey, createTabbedEditor } from '../tabbed-editor'

interface Doc {
  name: string
}

describe('_tabKey helper', () => {
  it('returns tab.id when set', () => {
    expect(_tabKey({ id: 't1', name: 'a.ts', language: 'plain', value: '' })).toBe('t1')
  })

  it('falls back to tab.name when id is undefined', () => {
    expect(_tabKey({ name: 'a.ts', language: 'plain', value: '' })).toBe('a.ts')
  })
})

describe('bindEditorToSignal — parse-error WITHOUT onParseError', () => {
  it('swallows parse failure silently when no onParseError callback provided', () => {
    const data = signal<Doc>({ name: 'Alice' })
    const editor = createEditor({ value: JSON.stringify(data()) })

    // No onParseError — covers the optional-chain FALSE branch.
    const binding = bindEditorToSignal({
      editor,
      signal: data,
      serialize: (d) => JSON.stringify(d),
      parse: (text) => JSON.parse(text) as Doc,
    })

    expect(() => editor.value.set('{ malformed json')).not.toThrow()
    // signal stays at last valid value
    expect(data().name).toBe('Alice')

    binding.dispose()
  })
})

describe('tabbed-editor — multi-tab map branches', () => {
  it('renameTab leaves non-matching tabs unchanged (map FALSE branch)', () => {
    const te = createTabbedEditor({
      tabs: [
        { id: 't1', name: 'a.ts', language: 'typescript', value: 'A' },
        { id: 't2', name: 'b.ts', language: 'typescript', value: 'B' },
      ],
    })
    te.renameTab('t1', 'renamed.ts')
    expect(te.tabs().find((t) => t.id === 't2')?.name).toBe('b.ts')
  })

  it('setModified leaves non-matching tabs unchanged', () => {
    const te = createTabbedEditor({
      tabs: [
        { id: 't1', name: 'a.ts', language: 'typescript', value: 'A' },
        { id: 't2', name: 'b.ts', language: 'typescript', value: 'B' },
      ],
    })
    te.setModified('t1', true)
    expect(te.tabs().find((t) => t.id === 't2')?.modified).toBeUndefined()
  })
})

describe('tabbed-editor — closeAll with EVERY tab non-closable (no-op switch branch)', () => {
  it('closeAll keeps active tab when nothing is closable', () => {
    const te = createTabbedEditor({
      tabs: [
        { id: 't1', name: 'a.ts', language: 'typescript', value: 'A', closable: false },
      ],
    })
    te.closeAll()
    expect(te.tabs().length).toBe(1)
    expect(te.activeTab()?.id).toBe('t1')
  })
})

describe('tabbed-editor — switchTab restores cached content (vs initial value fallback)', () => {
  it('uses tab.value when no cached content exists for the tab', () => {
    const te = createTabbedEditor({
      tabs: [
        { id: 't1', name: 'a', language: 'typescript', value: 'A' },
        { id: 't2', name: 'b', language: 'typescript', value: 'B' },
      ],
    })
    // close t2 then re-open it via openTab → cache was deleted; the
    // nested switchTab inside openTab restores tab.value (the cached?? fallback)
    te.closeTab('t2')
    te.openTab({ id: 't2', name: 'b', language: 'typescript', value: 'B-fresh' })
    expect(te.activeTab()?.id).toBe('t2')
  })
})
