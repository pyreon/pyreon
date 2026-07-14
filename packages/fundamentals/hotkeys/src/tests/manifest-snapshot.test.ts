import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — hotkeys snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/hotkeys — Keyboard shortcut management — scope-aware, modifier keys, conflict detection. By default, shortcuts do NOT fire when focused on form elements (input, textarea, select, contenteditable). Pass \`enableOnInputs: true\` in options to override. Escape is a common candidate for this override."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/hotkeys — Keyboard Shortcuts

      Reactive keyboard shortcut management for Pyreon. Register global or scoped shortcuts with automatic lifecycle management. Supports \`mod\` alias (Command on Mac, Ctrl elsewhere), multi-key combos, sequential combos (\`g t\`, Gmail/vim-style), reference-counted scope activation for context-aware shortcuts, shifted-symbol shortcuts (\`?\` fires on Shift+/), and conflict detection. Component-scoped hooks auto-unregister on unmount; a single shared \`keydown\` listener backs every shortcut. SSR-safe. Imperative API available for non-component contexts.

      \`\`\`typescript
      import { useHotkey, useHotkeyScope, registerHotkey, getRegisteredHotkeys, getHotkeyConflicts, enableScope, disableScope } from '@pyreon/hotkeys'

      // Global shortcut — auto-unregisters on unmount
      useHotkey('mod+s', (e) => {
        e.preventDefault()  // prevent browser save dialog
        save()
      }, { description: 'Save document' })

      // Platform-aware: mod = ⌘ on Mac, Ctrl on Windows/Linux
      useHotkey('mod+k', () => openCommandPalette())

      // Multi-key combo + shifted-symbol shortcut (? fires on Shift+/)
      useHotkey('ctrl+shift+p', () => openPreferences())
      useHotkey('?', () => openHelp(), { description: 'Show shortcuts' })

      // Sequential combo — press g, then t within 1s (Gmail/vim-style)
      useHotkey('g t', () => goToTop())

      // Scoped shortcuts — only active when scope is enabled. Scope activation is
      // reference-counted, so stacked components sharing a scope stay correct.
      useHotkeyScope('editor')  // activates 'editor' scope for this component's lifetime

      useHotkey('ctrl+z', () => undo(), { scope: 'editor', description: 'Undo' })
      useHotkey('ctrl+shift+z', () => redo(), { scope: 'editor', description: 'Redo' })
      useHotkey('ctrl+d', () => duplicateLine(), { scope: 'editor' })

      // Imperative API — for non-component contexts (stores, middleware)
      const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
      // unregister() when done

      // Introspection
      const hotkeys = getRegisteredHotkeys()  // all registered shortcuts
      const conflicts = getHotkeyConflicts()  // shortcuts colliding in the same scope
      enableScope('modal')                     // programmatically enable a scope
      disableScope('editor')                   // programmatically disable a scope

      // Shortcuts can filter input elements — by default, shortcuts
      // don't fire when focused on <input>, <textarea>, <select>.
      // Override with:
      useHotkey('escape', () => closeModal(), { enableOnInputs: true })
      \`\`\`

      > **Note**: By default, shortcuts do NOT fire when focused on form elements (input, textarea, select, contenteditable). Pass \`enableOnInputs: true\` in options to override. Escape is a common candidate for this override.
      >
      > **mod alias**: \`mod\` maps to Command on macOS, Ctrl on Windows/Linux. Write \`mod+s\` instead of platform-specific \`ctrl+s\` / \`cmd+s\` for cross-platform shortcuts.
      >
      > **Scopes**: Scoped shortcuts only fire when their scope is active. Activate with \`useHotkeyScope(scope)\` (component-scoped) or \`enableScope(scope)\` (imperative). Activation is reference-counted, so stacked components sharing a scope keep it active until all release it. Without activation, scoped handlers are silently dormant.
      >
      > **Shifted symbols**: Bind a single symbol directly (\`?\`, \`!\`, \`+\`) — it fires on the real shifted keystroke that produces it (\`?\` on Shift+/). Don't write \`shift+?\`; the symbol already implies shift.
      >
      > **SSR-safe**: Registration and scope activation are no-ops on the server (the registry drives a browser \`keydown\` listener). \`getRegisteredHotkeys()\` is therefore client-runtime state — build SSR help panels from a static config, not the live registry.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(7)
  })
})
