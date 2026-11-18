import { describe, expect, it } from 'vitest'
import { createTabbedEditor } from '../tabbed-editor'

// The per-tab EditorState swap needs a live CodeMirror view (the real-Chromium
// suite covers the undo behaviour end to end). Here a stub `_swapState`
// records the calls, pinning the cache bookkeeping in happy-dom.
describe('createTabbedEditor per-tab state cache', () => {
  const stub = (tabbed: ReturnType<typeof createTabbedEditor>) => {
    const calls: Array<{ next: unknown; doc: string }> = []
    let current: unknown = 'state-a'
    ;(tabbed.editor as unknown as { _swapState: (n: unknown, d: string) => unknown })._swapState = (
      next,
      doc,
    ) => {
      calls.push({ next, doc })
      const prev = current
      current = next ?? `fresh-${doc}`
      return prev
    }
    return calls
  }

  it('hands each tab its own saved state back and forgets closed tabs', () => {
    const tabbed = createTabbedEditor({
      tabs: [
        { name: 'a', value: 'A' },
        { name: 'b', value: 'B' },
        { name: 'c', value: 'C' },
      ],
    })
    const calls = stub(tabbed)
    tabbed.switchTab('b')
    expect(calls[0]).toEqual({ next: null, doc: 'B' })
    tabbed.switchTab('a')
    expect(calls[1]).toEqual({ next: 'state-a', doc: 'A' })
    tabbed.switchTab('a') // same tab — no swap
    expect(calls).toHaveLength(2)
    // Closing the active tab must not cache its outgoing state.
    tabbed.closeTab('a')
    expect(calls[2]).toEqual({ next: 'fresh-B', doc: 'B' })
    tabbed.switchTab('c')
    tabbed.switchTab('b')
    expect(calls[4]?.next).toBe('fresh-B')
    tabbed.dispose()
  })

  it('a view-less swap (returns null) caches nothing', () => {
    const tabbed = createTabbedEditor({ tabs: [{ name: 'a', value: 'A' }, { name: 'b', value: 'B' }] })
    const calls: unknown[] = []
    ;(tabbed.editor as unknown as { _swapState: (n: unknown, d: string) => unknown })._swapState = (n) => {
      calls.push(n)
      return null
    }
    tabbed.switchTab('b')
    tabbed.switchTab('a')
    expect(calls).toEqual([null, null])
    tabbed.dispose()
  })

  it('closeAll / closeOthers forget the closed tabs', () => {
    const tabbed = createTabbedEditor({
      tabs: [{ name: 'a', value: 'A' }, { name: 'b', value: 'B' }, { name: 'c', value: 'C' }],
    })
    const calls = stub(tabbed)
    tabbed.switchTab('b')
    tabbed.closeOthers('a')
    tabbed.closeAll()
    expect(tabbed.tabs()).toHaveLength(0)
    expect(calls.length).toBeGreaterThan(0)
    tabbed.dispose()
  })

  it('clears the modified flag when content returns to the original', () => {
    const tabbed = createTabbedEditor({ tabs: [{ name: 'a', value: 'A' }] })
    const onChange = (tabbed.editor.config as { onChange?: (v: string) => void }).onChange!
    onChange('AB')
    expect(tabbed.getTab('a')?.modified).toBe(true)
    onChange('A')
    expect(tabbed.getTab('a')?.modified).toBe(false)
    tabbed.openTab({ name: 'n', value: 'N' })
    onChange('N2')
    expect(tabbed.getTab('n')?.modified).toBe(true)
    tabbed.setModified('missing', true)
    tabbed.dispose()
  })
})

// `tabs` is a public writable signal, so a tab can be added through it
// directly instead of through `openTab`. Such a tab has no cached buffer;
// switching to it must load the tab's own `value` (both into the swapped-in
// state and into the editor), not an empty or stale buffer.
describe('createTabbedEditor — a tab added through the tabs signal', () => {
  it('switching to it loads its own value', () => {
    const tabbed = createTabbedEditor({ tabs: [{ name: 'a', value: 'A' }] })
    const docs: string[] = []
    ;(tabbed.editor as unknown as { _swapState: (n: unknown, d: string) => unknown })._swapState = (
      _next,
      doc,
    ) => {
      docs.push(doc)
      return null
    }
    tabbed.tabs.update((t) => [...t, { id: 'x', name: 'x.ts', value: 'from the signal', language: 'typescript' }])
    tabbed.switchTab('x')
    expect(docs).toEqual(['from the signal'])
    expect(tabbed.activeTabId()).toBe('x')
    expect(tabbed.editor.value()).toBe('from the signal')
    expect(tabbed.editor.language()).toBe('typescript')
    // Its edits are cached from then on: switching away and back restores them.
    tabbed.editor.value.set('edited')
    tabbed.switchTab('a')
    expect(tabbed.editor.value()).toBe('A')
    tabbed.switchTab('x')
    expect(tabbed.editor.value()).toBe('edited')
    tabbed.dispose()
  })
})
