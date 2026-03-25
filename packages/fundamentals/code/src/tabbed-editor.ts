import { computed, signal } from "@pyreon/reactivity"
import { createEditor } from "./editor"
import type { EditorLanguage, Tab, TabbedEditorConfig, TabbedEditorInstance } from "./types"

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
  const activeTabId = signal(tabsWithIds[0]?.id ?? "")

  // Content cache — stores each tab's current content
  const contentCache = new Map<string, string>()
  for (const tab of tabsWithIds) {
    contentCache.set(tab.id!, tab.value)
  }

  // ── Editor instance ────────────────────────────────────────────────────

  const firstTab = tabsWithIds[0]
  // Filter out undefined values to satisfy exactOptionalPropertyTypes
  const filteredConfig = Object.fromEntries(
    Object.entries(editorConfig).filter(([_, v]) => v !== undefined),
  )
  const editor = createEditor({
    value: firstTab?.value ?? "",
    language: (firstTab?.language ?? "plain") as EditorLanguage,
    ...(theme != null ? { theme } : {}),
    ...filteredConfig,
    onChange: (value) => {
      // Save content to cache and mark as modified
      const id = activeTabId.peek()
      if (id) {
        contentCache.set(id, value)
        const originalTab = tabsWithIds.find((t) => t.id === id)
        if (originalTab && value !== originalTab.value) {
          setModified(id, true)
        }
      }
      editorConfig.onChange?.(value)
    },
  })

  // ── Computed ───────────────────────────────────────────────────────────

  const activeTab = computed(() => {
    const id = activeTabId()
    return tabs().find((t) => (t.id ?? t.name) === id) ?? null
  })

  // ── Tab operations ─────────────────────────────────────────────────────

  function saveCurrentTab(): void {
    const id = activeTabId.peek()
    if (id) {
      contentCache.set(id, editor.value.peek())
    }
  }

  function switchTab(id: string): void {
    const tab = tabs.peek().find((t) => (t.id ?? t.name) === id)
    if (!tab) return

    // Save current tab content
    saveCurrentTab()

    // Switch
    activeTabId.set(id)

    // Restore target tab content
    const cached = contentCache.get(id)
    editor.value.set(cached ?? tab.value)
    editor.language.set((tab.language ?? "plain") as EditorLanguage)
  }

  function openTab(tab: Tab): void {
    const id = tab.id ?? tab.name
    const existing = tabs.peek().find((t) => (t.id ?? t.name) === id)

    if (existing) {
      // Already open — just switch to it
      switchTab(id)
      return
    }

    const newTab = { ...tab, id, closable: tab.closable ?? true }
    tabs.update((t) => [...t, newTab])
    contentCache.set(id, tab.value)
    switchTab(id)
  }

  function closeTab(id: string): void {
    const currentTabs = tabs.peek()
    const tabIndex = currentTabs.findIndex((t) => (t.id ?? t.name) === id)
    if (tabIndex === -1) return

    const tab = currentTabs[tabIndex]!
    if (tab.closable === false) return

    // Remove from state
    tabs.update((t) => t.filter((item) => (item.id ?? item.name) !== id))
    contentCache.delete(id)

    // If closing the active tab, switch to adjacent
    if (activeTabId.peek() === id) {
      const remaining = tabs.peek()
      if (remaining.length > 0) {
        const nextIndex = Math.min(tabIndex, remaining.length - 1)
        switchTab(remaining[nextIndex]!.id ?? remaining[nextIndex]!.name)
      } else {
        activeTabId.set("")
        editor.value.set("")
      }
    }
  }

  function renameTab(id: string, name: string): void {
    tabs.update((t) => t.map((tab) => ((tab.id ?? tab.name) === id ? { ...tab, name } : tab)))
  }

  function setModified(id: string, modified: boolean): void {
    tabs.update((t) => t.map((tab) => ((tab.id ?? tab.name) === id ? { ...tab, modified } : tab)))
  }

  function moveTab(fromIndex: number, toIndex: number): void {
    tabs.update((t) => {
      const arr = [...t]
      const [moved] = arr.splice(fromIndex, 1)
      if (moved) arr.splice(toIndex, 0, moved)
      return arr
    })
  }

  function getTab(id: string): Tab | undefined {
    return tabs.peek().find((t) => (t.id ?? t.name) === id)
  }

  function closeAll(): void {
    const closable = tabs.peek().filter((t) => t.closable !== false)
    for (const tab of closable) {
      contentCache.delete(tab.id ?? tab.name)
    }
    tabs.update((t) => t.filter((tab) => tab.closable === false))
    const remaining = tabs.peek()
    if (remaining.length > 0) {
      switchTab(remaining[0]!.id ?? remaining[0]!.name)
    } else {
      activeTabId.set("")
      editor.value.set("")
    }
  }

  function closeOthers(id: string): void {
    const toClose = tabs.peek().filter((t) => (t.id ?? t.name) !== id && t.closable !== false)
    for (const tab of toClose) {
      contentCache.delete(tab.id ?? tab.name)
    }
    tabs.update((t) => t.filter((tab) => (tab.id ?? tab.name) === id || tab.closable === false))
    switchTab(id)
  }

  function dispose(): void {
    contentCache.clear()
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
