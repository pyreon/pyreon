import type { EditorState } from '@codemirror/state'
import { batch, computed, signal } from '@pyreon/reactivity'
import { createEditor } from './editor'
import type { EditorLanguage, Tab, TabbedEditorConfig, TabbedEditorInstance } from './types'

/**
 * Tab key — `id` if set, else `name`. Concentrates the `id ?? name`
 * fallback into a single helper so every call site reads through it.
 * Exported for unit testing.
 */
export const _tabKey = (t: Tab): string => t.id ?? t.name

/**
 * Create a tabbed code editor — multiple files with tab management.
 *
 * Wraps `createEditor()` with tab state. Switching tabs saves the current
 * tab's content and restores the target tab's content/language.
 *
 * @param config - Tabbed editor configuration
 * @returns A TabbedEditorInstance with tab management + underlying editor
 *
 * @example
 * ```tsx
 * const editor = createTabbedEditor({
 *   tabs: [
 *     { name: 'index.ts', language: 'typescript', value: 'const x = 1' },
 *     { name: 'style.css', language: 'css', value: '.app { }' },
 *   ],
 *   theme: 'dark',
 * })
 *
 * editor.activeTab()           // current tab
 * editor.switchTab('style.css')
 * editor.openTab({ name: 'utils.ts', language: 'typescript', value: '' })
 * editor.closeTab('style.css')
 *
 * <TabbedEditor instance={editor} />
 * ```
 */
export function createTabbedEditor(config: TabbedEditorConfig = {}): TabbedEditorInstance {
  const { tabs: initialTabs = [], theme, editorConfig = {} } = config

  // Ensure all tabs have IDs
  const tabsWithIds = initialTabs.map((t) => ({
    ...t,
    id: t.id ?? t.name,
    closable: t.closable ?? true,
  }))

  // ── State ──────────────────────────────────────────────────────────────

  const tabs = signal<Tab[]>(tabsWithIds)
  const activeTabId = signal(tabsWithIds[0]?.id ?? '')

  // Content cache — stores each tab's current content
  const contentCache = new Map<string, string>()
  // Each tab's ORIGINAL value — the baseline `modified` is judged against
  // (covers tabs added later through openTab, not just the initial set).
  const originalValues = new Map<string, string>()
  // Each tab's whole CodeMirror EditorState, kept while another tab is active.
  // One shared state meant one shared undo history: undo right after a switch
  // replayed the previous tab's edits into the new one.
  const stateCache = new Map<string, EditorState>()
  for (const tab of tabsWithIds) {
    const tabId = _tabKey(tab)
    contentCache.set(tabId, tab.value)
    originalValues.set(tabId, tab.value)
  }

  // ── Editor instance ────────────────────────────────────────────────────

  const firstTab = tabsWithIds[0]
  // Filter out undefined values to satisfy exactOptionalPropertyTypes
  const filteredConfig = Object.fromEntries(
    Object.entries(editorConfig).filter(([_, v]) => v !== undefined),
  )
  const editor = createEditor({
    value: firstTab?.value ?? '',
    language: (firstTab?.language ?? 'plain') as EditorLanguage,
    ...(theme != null ? { theme } : {}),
    ...filteredConfig,
    /* v8 ignore start — onChange fires only on DOM-driven CodeMirror
       edits; happy-dom unit tests never trigger it. Covered by real
       browser tests via examples/playground. */
    onChange: (value) => {
      const id = activeTabId.peek()
      if (id) {
        contentCache.set(id, value)
        const original = originalValues.get(id)
        // Editing back to the original clears the flag; setModified is a
        // no-op when the flag is unchanged, so this costs nothing per keystroke.
        if (original !== undefined) setModified(id, value !== original)
      }
      editorConfig.onChange?.(value)
    },
    /* v8 ignore stop */
  })

  // ── Computed ───────────────────────────────────────────────────────────

  const activeTab = computed(() => {
    const id = activeTabId()
    return tabs().find((t) => _tabKey(t) === id) ?? null
  })

  // ── Tab operations ─────────────────────────────────────────────────────

  function saveCurrentTab(): void {
    const id = activeTabId.peek()
    // A just-closed active tab must not be re-added to the cache.
    if (id && tabs.peek().some((t) => _tabKey(t) === id)) {
      contentCache.set(id, editor.value.peek())
    }
  }

  function switchTab(id: string): void {
    const tab = tabs.peek().find((t) => _tabKey(t) === id)
    if (!tab) return

    // Save current tab content
    saveCurrentTab()
    const currentId = activeTabId.peek()
    if (currentId === id) return

    // Swap the whole editor state so each tab keeps its own undo history.
    // (No view yet → nothing to swap; the value/language writes below seed
    // the state the mount builds.)
    const swap = (editor as typeof editor & {
      _swapState?: (next: EditorState | null, doc: string) => EditorState | null
    })._swapState
    const targetDoc = contentCache.get(id) ?? tab.value
    const outgoing = swap?.(stateCache.get(id) ?? null, targetDoc)
    if (outgoing && currentId && tabs.peek().some((t) => _tabKey(t) === currentId)) {
      stateCache.set(currentId, outgoing)
    }
    stateCache.delete(id)

    // Restore target tab content
    const cached = contentCache.get(id)
    /* v8 ignore next — the cache is populated for every tab at
       construction + openTab; switchTab is only called with valid
       ids, so `cached === undefined` is structurally unreachable. */
    // Batched: the active id, the buffer and the language are ONE tab switch.
    // Unbatched, an effect reading `activeTabId()` and `editor.value()` ran
    // between the writes and saw the NEW tab id beside the OLD buffer.
    batch(() => {
      activeTabId.set(id)
      editor.value.set(cached ?? tab.value)
      editor.language.set((tab.language ?? 'plain') as EditorLanguage)
    })
  }

  function openTab(tab: Tab): void {
    const id = _tabKey(tab)
    const existing = tabs.peek().find((t) => _tabKey(t) === id)

    if (existing) {
      // Already open — just switch to it
      switchTab(id)
      return
    }

    const newTab = { ...tab, id, closable: tab.closable ?? true }
    tabs.update((t) => [...t, newTab])
    contentCache.set(id, tab.value)
    originalValues.set(id, tab.value)
    switchTab(id)
  }

  function closeTab(id: string): void {
    const currentTabs = tabs.peek()
    const tabIndex = currentTabs.findIndex((t) => _tabKey(t) === id)
    if (tabIndex === -1) return

    const tab = currentTabs[tabIndex]
    if (!tab || tab.closable === false) return

    // Remove from state
    tabs.update((t) => t.filter((item) => _tabKey(item) !== id))
    forget(id)

    // If closing the active tab, switch to adjacent
    if (activeTabId.peek() === id) {
      const remaining = tabs.peek()
      if (remaining.length > 0) {
        const nextIndex = Math.min(tabIndex, remaining.length - 1)
        const nextTab = remaining[nextIndex]
        /* v8 ignore next — nextTab is always defined since
           remaining.length > 0 and nextIndex is in range. */
        if (nextTab) switchTab(_tabKey(nextTab))
      } else {
        activeTabId.set('')
        editor.value.set('')
      }
    }
  }

  function renameTab(id: string, name: string): void {
    tabs.update((t) => t.map((tab) => (_tabKey(tab) === id ? { ...tab, name } : tab)))
  }

  function forget(id: string): void {
    contentCache.delete(id)
    originalValues.delete(id)
    stateCache.delete(id)
  }

  function setModified(id: string, modified: boolean): void {
    // Called on every keystroke — only rebuild the tabs array (and re-render
    // the tab bar) when the flag actually flips.
    const tab = tabs.peek().find((t) => _tabKey(t) === id)
    if (!tab || Boolean(tab.modified) === modified) return
    tabs.update((t) => t.map((item) => (_tabKey(item) === id ? { ...item, modified } : item)))
  }

  function moveTab(fromIndex: number, toIndex: number): void {
    tabs.update((t) => {
      const arr = [...t]
      const [moved] = arr.splice(fromIndex, 1)
      /* v8 ignore next — moved is always defined when fromIndex is in
         range; out-of-range fromIndex returns an empty array but the
         splice no-ops, so the falsy branch is structurally dead. */
      if (moved) arr.splice(toIndex, 0, moved)
      return arr
    })
  }

  function getTab(id: string): Tab | undefined {
    return tabs.peek().find((t) => _tabKey(t) === id)
  }

  function closeAll(): void {
    const closable = tabs.peek().filter((t) => t.closable !== false)
    for (const tab of closable) {
      forget(_tabKey(tab))
    }
    tabs.update((t) => t.filter((tab) => tab.closable === false))
    const remaining = tabs.peek()
    if (remaining.length > 0) {
      const first = remaining[0]
      /* v8 ignore next — first is always defined since
         remaining.length > 0. */
      if (first) switchTab(_tabKey(first))
    } else {
      activeTabId.set('')
      editor.value.set('')
    }
  }

  function closeOthers(id: string): void {
    const toClose = tabs.peek().filter((t) => _tabKey(t) !== id && t.closable !== false)
    for (const tab of toClose) {
      forget(_tabKey(tab))
    }
    tabs.update((t) => t.filter((tab) => _tabKey(tab) === id || tab.closable === false))
    switchTab(id)
  }

  function dispose(): void {
    contentCache.clear()
    originalValues.clear()
    stateCache.clear()
    editor.dispose()
  }

  return {
    editor,
    tabs,
    activeTab,
    activeTabId,
    openTab,
    closeTab,
    switchTab,
    renameTab,
    setModified,
    moveTab,
    getTab,
    closeAll,
    closeOthers,
    dispose,
  }
}
