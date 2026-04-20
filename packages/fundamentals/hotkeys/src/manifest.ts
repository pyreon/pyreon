import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/hotkeys',
  title: 'Keyboard Shortcuts',
  tagline:
    'Keyboard shortcut management — scope-aware, modifier keys, conflict detection',
  description:
    'Reactive keyboard shortcut management for Pyreon. Register global or scoped shortcuts with automatic lifecycle management. Supports `mod` alias (Command on Mac, Ctrl elsewhere), multi-key combos, scope-based activation for context-aware shortcuts, and conflict detection. Component-scoped hooks auto-unregister on unmount. Imperative API available for non-component contexts.',
  category: 'universal',
  longExample: `import { useHotkey, useHotkeyScope, registerHotkey, getRegisteredHotkeys, enableScope, disableScope } from '@pyreon/hotkeys'

// Global shortcut — auto-unregisters on unmount
useHotkey('mod+s', (e) => {
  e.preventDefault()  // prevent browser save dialog
  save()
}, { description: 'Save document' })

// Platform-aware: mod = ⌘ on Mac, Ctrl on Windows/Linux
useHotkey('mod+k', () => openCommandPalette())

// Multi-key combo
useHotkey('ctrl+shift+p', () => openPreferences())

// Scoped shortcuts — only active when scope is enabled
useHotkeyScope('editor')  // activates 'editor' scope for this component's lifetime

useHotkey('ctrl+z', () => undo(), { scope: 'editor', description: 'Undo' })
useHotkey('ctrl+shift+z', () => redo(), { scope: 'editor', description: 'Redo' })
useHotkey('ctrl+d', () => duplicateLine(), { scope: 'editor' })

// Imperative API — for non-component contexts (stores, middleware)
const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
// unregister() when done

// Introspection
const hotkeys = getRegisteredHotkeys()  // all registered shortcuts
enableScope('modal')                     // programmatically enable a scope
disableScope('editor')                   // programmatically disable a scope

// Shortcuts can filter input elements — by default, shortcuts
// don't fire when focused on <input>, <textarea>, <select>.
// Override with:
useHotkey('escape', () => closeModal(), { enableOnFormElements: true })`,
  features: [
    'useHotkey(shortcut, handler, options?) — component-scoped, auto-unregisters on unmount',
    'useHotkeyScope(scope) — activate a scope for a component\'s lifetime',
    'mod alias — Command on Mac, Ctrl elsewhere',
    'Scope-based activation for context-aware shortcuts',
    'Imperative API: registerHotkey, enableScope, disableScope, getRegisteredHotkeys',
    'parseShortcut / matchesCombo / formatCombo utilities',
  ],
  api: [
    {
      name: 'useHotkey',
      kind: 'hook',
      signature:
        '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => void',
      summary:
        'Register a keyboard shortcut that auto-unregisters when the component unmounts. Shortcut format: `mod+s`, `ctrl+shift+p`, `escape`, etc. `mod` is Command on Mac, Ctrl elsewhere. By default, shortcuts don\'t fire when focused on form elements (input, textarea, select) — override with `enableOnFormElements: true`. Supports `scope` option for context-aware activation and `description` for introspection.',
      example: `useHotkey('mod+s', (e) => {
  e.preventDefault()
  save()
}, { description: 'Save' })

useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
useHotkey('escape', () => close(), { enableOnFormElements: true })`,
      mistakes: [
        'Forgetting e.preventDefault() for browser-reserved shortcuts (mod+s, mod+p) — the browser dialog fires alongside your handler',
        'Registering the same shortcut in overlapping scopes without priority — both handlers fire; use scope isolation to prevent conflicts',
        'Using useHotkey outside a component body — the onUnmount cleanup requires an active component setup context',
        'Not activating the scope — useHotkey with a scope option does nothing unless useHotkeyScope(scope) is called or enableScope(scope) is invoked',
      ],
      seeAlso: ['useHotkeyScope', 'registerHotkey'],
    },
    {
      name: 'useHotkeyScope',
      kind: 'hook',
      signature: '(scope: string) => void',
      summary:
        'Activate a hotkey scope for the lifetime of the current component. When the component mounts, the scope is enabled; when it unmounts, the scope is disabled. Shortcuts registered with a matching `scope` option only fire when the scope is active. Multiple components can activate the same scope — it stays active until the last one unmounts.',
      example: `// In an editor component:
useHotkeyScope('editor')
useHotkey('ctrl+z', () => undo(), { scope: 'editor' })

// In a modal component:
useHotkeyScope('modal')
useHotkey('escape', () => close(), { scope: 'modal' })`,
      mistakes: [
        'Using useHotkeyScope outside a component body — the lifecycle hooks require an active setup context',
        'Assuming scope deactivation is immediate on unmount — if another component also activated the scope, it stays active',
      ],
      seeAlso: ['useHotkey', 'enableScope', 'disableScope'],
    },
    {
      name: 'registerHotkey',
      kind: 'function',
      signature:
        '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => () => void',
      summary:
        'Imperative hotkey registration for non-component contexts (stores, global setup). Returns an unregister function. Unlike useHotkey, this does NOT auto-cleanup on unmount — caller is responsible for calling the returned unregister function.',
      example: `const unregister = registerHotkey('ctrl+q', () => quit(), { scope: 'global' })
// Later:
unregister()`,
      seeAlso: ['useHotkey'],
    },
  ],
  gotchas: [
    'By default, shortcuts do NOT fire when focused on form elements (input, textarea, select). Pass `enableOnFormElements: true` in options to override. Escape is a common candidate for this override.',
    {
      label: 'mod alias',
      note: '`mod` maps to Command on macOS, Ctrl on Windows/Linux. Write `mod+s` instead of platform-specific `ctrl+s` / `cmd+s` for cross-platform shortcuts.',
    },
    {
      label: 'Scopes',
      note: 'Scoped shortcuts only fire when their scope is active. Activate with `useHotkeyScope(scope)` (component-scoped) or `enableScope(scope)` (imperative). Without activation, scoped handlers are silently dormant.',
    },
  ],
})
