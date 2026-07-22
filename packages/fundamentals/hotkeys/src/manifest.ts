import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/hotkeys',
  title: 'Keyboard Shortcuts',
  tagline:
    'Keyboard shortcut management — scope-aware, modifier keys, conflict detection',
  description:
    'Reactive keyboard shortcut management for Pyreon. Register global or scoped shortcuts with automatic lifecycle management. Supports `mod` alias (Command on Mac, Ctrl elsewhere), multi-key combos, comma-separated lists (`ctrl+s, mod+p`), sequential combos (`g t`, Gmail/vim-style), keyup bindings, `once` / `ignoreRepeat`, reference-counted scope activation, element-scoped targets, selective input filtering, shifted-symbol shortcuts (`?` fires on Shift+/), pressed-key introspection, programmatic `trigger`, and conflict detection. Dispatch is KEY-BUCKETED — a keystroke touches only the entries bound to that exact key, so the miss path (every non-shortcut keypress) is one Map lookup regardless of how many hotkeys are registered. Component-scoped hooks auto-unregister on unmount; ONE shared listener per (target, event-type) backs every shortcut. SSR-safe.',
  category: 'universal',
  longExample: `import { useHotkey, useHotkeyScope, registerHotkey, getRegisteredHotkeys, getHotkeyConflicts, enableScope, disableScope } from '@pyreon/hotkeys'

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
useHotkey('escape', () => closeModal(), { enableOnInputs: true })`,
  features: [
    'useHotkey(shortcut, handler, options?) — component-scoped, auto-unregisters on unmount',
    'useHotkeyScope(scope) — activate a scope for a component\'s lifetime (reference-counted)',
    'mod alias — Command on Mac, Ctrl elsewhere',
    'Sequential combos — `g t` fires on g-then-t within 1s (Gmail/vim-style)',
    'Shifted-symbol shortcuts — `?` fires on the real Shift+/ keystroke',
    'Reference-counted scope activation for context-aware shortcuts',
    'Conflict detection — getHotkeyConflicts() flags same-scope duplicate bindings',
    'Comma-separated lists — `ctrl+s, mod+p` binds both to one handler (one unregister removes all; `comma` alias for the literal key)',
    "keyup bindings (`event: 'keyup'`) for act-on-release; `once` (fire then auto-unregister); `ignoreRepeat` (skip held-key auto-repeat)",
    "Selective input filtering — `enableOnInputs: ['input']` fires in text inputs but not textareas/selects/contenteditables",
    'Element-scoped hotkeys — `target: element` listens on a specific element (fires only while focus is inside it); one shared listener per target, detached with the last hotkey',
    'Pressed-key introspection — getPressedKeys() reactive held-key set (lazy listeners, blur-cleared) + isKeyPressed()',
    'Programmatic trigger(shortcut) — fire the bound handlers (command palettes, tests); respects scope + enabled gates',
    'Key-bucketed O(1) dispatch — miss cost is flat regardless of registry size (bench: 48 bindings, ~flat vs linear-scan libraries degrading 3×)',
    'Imperative API: registerHotkey, enableScope, disableScope, getRegisteredHotkeys',
    'parseShortcut / matchesCombo / formatCombo / splitShortcutList utilities',
  ],
  api: [
    {
      name: 'useHotkey',
      kind: 'hook',
      signature:
        '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => void',
      summary:
        'Register a keyboard shortcut that auto-unregisters when the component unmounts. Shortcut format: `mod+s`, `ctrl+shift+p`, `escape`, etc. `mod` is Command on Mac, Ctrl elsewhere. By default, shortcuts don\'t fire when focused on form elements (input, textarea, select) — override with `enableOnInputs: true`. Supports `scope` option for context-aware activation and `description` for introspection.',
      example: `useHotkey('mod+s', (e) => {
  e.preventDefault()
  save()
}, { description: 'Save' })

useHotkey('ctrl+z', () => undo(), { scope: 'editor' })
useHotkey('escape', () => close(), { enableOnInputs: true })`,
      mistakes: [
        'Forgetting e.preventDefault() for browser-reserved shortcuts (mod+s, mod+p) — the browser dialog fires alongside your handler. preventDefault is ON by default, but a stray { preventDefault: false } re-opens the browser dialog',
        'Registering the same shortcut twice in the same scope — both handlers fire on every press. Audit with getHotkeyConflicts() (it also catches aliased duplicates like ctrl+s vs control+s)',
        'Writing shift+? for a help shortcut — bind ? directly instead. A single-symbol key already implies shift, so ? fires on the real Shift+/ keystroke and shift+? never matches',
        'Using useHotkey outside a component body — the onUnmount cleanup requires an active component setup context',
        'Not activating the scope — useHotkey with a scope option does nothing unless useHotkeyScope(scope) is called or enableScope(scope) is invoked',
      ],
      seeAlso: ['useHotkeyScope', 'registerHotkey', 'getHotkeyConflicts'],
    },
    {
      name: 'useHotkeyScope',
      kind: 'hook',
      signature: '(scope: string) => void',
      summary:
        'Activate a hotkey scope for the lifetime of the current component. When the component mounts, the scope is enabled; when it unmounts, the scope is disabled. Shortcuts registered with a matching `scope` option only fire when the scope is active. Scope activation is REFERENCE-COUNTED — two components that both activate `editor` keep it active until BOTH unmount, so stacked panels / nested modals stay correct. Multiple scopes can be active concurrently; a hotkey fires when ITS scope is active.',
      example: `// In an editor component:
useHotkeyScope('editor')
useHotkey('ctrl+z', () => undo(), { scope: 'editor' })

// In a modal component:
useHotkeyScope('modal')
useHotkey('escape', () => close(), { scope: 'modal' })`,
      mistakes: [
        'Using useHotkeyScope outside a component body — the lifecycle hooks require an active setup context',
        'Expecting scopes to be hierarchical — activating `editor` does not implicitly activate `editor/code`; a hotkey fires only when its EXACT scope string is active',
        'Pairing imperative enableScope/disableScope unevenly — they are acquire/release, so an unmatched enableScope leaves the scope active until a matching disableScope releases it',
      ],
      seeAlso: ['useHotkey', 'enableScope', 'disableScope'],
    },
    {
      name: 'registerHotkey',
      kind: 'function',
      signature:
        '(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions) => () => void',
      summary:
        "Imperative hotkey registration for non-component contexts (stores, global setup). Returns an unregister function — unlike useHotkey, this does NOT auto-cleanup on unmount. Accepts a comma-separated LIST (`'ctrl+s, mod+p'`) binding several shortcuts to one handler (the returned function unregisters all). Options beyond scope/description: `event: 'keyup'` (act on release; sequences are keydown-only and throw), `once` (fire then auto-unregister), `ignoreRepeat` (skip `event.repeat` while held), `enableOnInputs` as boolean OR a selective array (`['input']`), and `target` (listen on a specific element — fires only while the event reaches it; the registry keeps ONE shared listener per (target, event-type) and detaches it with the last hotkey).",
      example: `const unregister = registerHotkey('ctrl+s, mod+p', (e) => save())  // both combos, one handler
registerHotkey('escape', close, { event: 'keyup' })                 // act on release
registerHotkey('mod+d', toggle, { ignoreRepeat: true })             // no machine-gun on hold
registerHotkey('enter', submit, { target: panelEl, once: true })    // element-scoped, single-shot
// Later:
unregister()`,
      mistakes: [
        "Binding a literal comma via `'ctrl+,'` inside a LIST — the splitter handles the trailing `+,` shape, but the unambiguous spelling is the `comma` alias: `'mod+comma'`",
        "Using `event: 'keyup'` on a sequential shortcut (`'g t'`) — sequences are keydown-only; registration throws with a clear error",
        'Expecting `target`-scoped hotkeys to fire globally — they fire only when the keyboard event REACHES the target element (focus inside it); use the default window target for app-wide shortcuts',
        'Holding a combo with `ignoreRepeat: false` (the default) fires the handler on every auto-repeat — turn `ignoreRepeat: true` on for one-shot actions like save/toggle',
      ],
      seeAlso: ['useHotkey', 'trigger', 'getPressedKeys'],
    },
    {
      name: 'getHotkeyConflicts',
      kind: 'function',
      signature:
        '() => ReadonlyArray<{ scope: string; shortcuts: string[]; descriptions: Array<string | undefined> }>',
      summary:
        'Detect registered shortcuts that would fire on the SAME keystroke within the SAME scope. Matching is on the PARSED combo, not the source string, so aliased duplicates (`ctrl+s` vs `control+s`, or `mod+s` vs `ctrl+s` off Mac) are caught. Cross-scope overlaps are intentional scope LAYERING and are NOT reported. Use it for a "keyboard shortcut audit" panel, a settings UI that warns on duplicate bindings, or a dev-time assertion in tests.',
      example: `registerHotkey('ctrl+s', saveA)
registerHotkey('control+s', saveB) // same combo, same (global) scope

getHotkeyConflicts()
// → [{ scope: 'global', shortcuts: ['ctrl+s', 'control+s'], descriptions: [undefined, undefined] }]`,
      seeAlso: ['getRegisteredHotkeys', 'registerHotkey'],
    },
    {
      name: 'enableScope / disableScope / getActiveScopes',
      kind: 'function',
      signature:
        'enableScope(scope: string) => void · disableScope(scope: string) => void · getActiveScopes() => Signal<Set<string>>',
      summary:
        "The reference-counted scope-activation API. `enableScope` ACQUIRES a scope (a modal, a panel) — it activates on the FIRST acquire and each further `enableScope` just bumps the refcount; `disableScope` RELEASES it, and the scope only deactivates once every acquire has been released. `'global'` is always active and cannot be enabled or disabled. `getActiveScopes()` returns the LIVE reactive `Signal<Set<string>>` of currently-active scope names. All three are no-ops on the server (scope state is client-runtime and must not bleed across requests).",
      example: `// acquire a scope while a modal is open, release on close:
enableScope('modal')
// ...later, when the modal closes:
disableScope('modal')

// read active scopes reactively:
const active = getActiveScopes()
const isModalActive = () => active().has('modal')`,
      mistakes: [
        'Unbalanced acquire/release — every `enableScope(s)` MUST be matched by exactly one `disableScope(s)`. A missing release leaks the refcount and the scope stays active forever; an extra release is a harmless no-op (the count clamps at zero).',
        "Trying to toggle `'global'` — `enableScope('global')` / `disableScope('global')` are no-ops; the global scope is always active.",
        'Mutating the Set from `getActiveScopes()` — it returns the LIVE internal signal; call it to READ (`getActiveScopes()().has(s)`) and let `enableScope`/`disableScope` own the writes. Read it inside a reactive scope so it updates.',
      ],
      seeAlso: ['useHotkeyScope', 'getRegisteredHotkeys'],
    },
    {
      name: 'getRegisteredHotkeys',
      kind: 'function',
      signature:
        'getRegisteredHotkeys() => ReadonlyArray<{ shortcut: string; scope: string; description?: string }>',
      summary:
        "Return a SNAPSHOT array of every registered hotkey — `{ shortcut, scope, description? }` per entry (`description` omitted when the registration set none). Built for a help dialog / keyboard-shortcut cheat-sheet. Pairs with `getHotkeyConflicts` for a settings-panel audit.",
      example: `registerHotkey('mod+k', openPalette, { description: 'Command palette' })
getRegisteredHotkeys()
// → [{ shortcut: 'mod+k', scope: 'global', description: 'Command palette' }]`,
      mistakes: [
        'Expecting it to be reactive — it is a SNAPSHOT mapped at call time. Call it again after registrations change (or inside a reactive scope that re-reads it) to reflect new hotkeys.',
      ],
      seeAlso: ['getHotkeyConflicts', 'registerHotkey'],
    },
    {
      name: 'trigger',
      kind: 'function',
      signature: '(shortcut: string, options?: { scope?: string }) => number',
      summary:
        'Programmatically fire the handlers bound to `shortcut` (window-target bindings), as if the user pressed it — command palettes ("run the bound action"), macro systems, tests. Respects the scope gate (active scopes by default; pass `{ scope }` to target a specific — even inactive — scope) and the `enabled` gate; skips the input-focus gate (there is no real focused element). Sequences are triggered by their full spelling (`trigger("g t")`). Returns the number of handlers fired (0 = nothing bound).',
      example: `registerHotkey('mod+s', save)
trigger('mod+s')                      // → 1, save() ran
trigger('ctrl+z', { scope: 'editor' }) // fire an inactive scope's binding explicitly`,
      seeAlso: ['registerHotkey', 'getRegisteredHotkeys'],
    },
    {
      name: 'getPressedKeys / isKeyPressed',
      kind: 'function',
      signature:
        'getPressedKeys(): Signal<Set<string>>; isKeyPressed(key: string): boolean',
      summary:
        "Live held-key introspection. `getPressedKeys()` returns a reactive signal of the currently-held keys (lower-cased `event.key` values) — tracking listeners attach LAZILY on first call, so the package adds zero overhead until you use it; the set clears on window blur (a key released outside the page never delivers its keyup). `isKeyPressed('ctrl')` is the non-reactive point read (aliases resolve: `ctrl`→`control`, `space`→`' '`). SSR-safe (always empty on the server).",
      example: `const pressed = getPressedKeys()
effect(() => spacebarHeld.set(pressed().has(' ')))
if (isKeyPressed('shift')) extendSelection()`,
      mistakes: [
        'Reading getPressedKeys() OUTSIDE a reactive scope and expecting updates — it is a signal; call it inside effect/computed/JSX thunks, or use isKeyPressed for a one-shot check',
        'Expecting keys held across a tab switch to stay pressed — window blur deliberately clears the set (their keyup events are never delivered to the page)',
      ],
      seeAlso: ['trigger', 'useHotkey'],
    },
    {
      name: 'parseShortcut / matchesCombo / formatCombo',
      kind: 'function',
      signature:
        'parseShortcut(shortcut: string) => KeyCombo · matchesCombo(event: KeyboardEvent, combo: KeyCombo) => boolean · formatCombo(combo: KeyCombo) => string',
      summary:
        "The combo utilities. `parseShortcut` turns a string (`'mod+shift+k'`) into a `KeyCombo` — lower-cased, `+`-split, with aliases (`esc`->`escape`, `del`->`delete`, `space`->space, `up`->`arrowup`, …) and `mod` resolving to META on Mac / CTRL elsewhere. `matchesCombo` tests a `KeyboardEvent` against a parsed combo. `formatCombo` renders a combo back to a display string (`Ctrl+Shift+K`; META shows as the `⌘` glyph on Mac).",
      example: `const combo = parseShortcut('mod+k')
document.addEventListener('keydown', (e) => {
  if (matchesCombo(e, combo)) openPalette()
})
formatCombo(combo) // → 'Ctrl+K' (or '⌘+K' on Mac)`,
      mistakes: [
        "Enforcing Shift for a SYMBOL key — `matchesCombo` deliberately does NOT require the Shift modifier for a single-character symbol key (`?`, `!`, `+`, `/`), so `parseShortcut('?')` matches the real `Shift+/` keystroke (the canonical 'show help' binding). Letters and named keys (`a`, `arrowup`) keep exact Shift-matching.",
        "`mod` is platform-dependent — `parseShortcut('mod+s')` yields META on Mac and CTRL elsewhere; do not hard-code `ctrl`/`meta` if you want cross-platform behavior.",
        'Round-tripping `formatCombo` back through `parseShortcut` — `formatCombo` is for DISPLAY (it emits the `⌘` glyph on Mac and capitalizes keys); it is not guaranteed to re-parse. Keep the original shortcut string if you need to re-parse it.',
      ],
      seeAlso: ['useHotkey', 'registerHotkey'],
    },
  ],
  gotchas: [
    'By default, shortcuts do NOT fire when focused on form elements (input, textarea, select, contenteditable). Pass `enableOnInputs: true` in options to override. Escape is a common candidate for this override.',
    {
      label: 'mod alias',
      note: '`mod` maps to Command on macOS, Ctrl on Windows/Linux. Write `mod+s` instead of platform-specific `ctrl+s` / `cmd+s` for cross-platform shortcuts.',
    },
    {
      label: 'Scopes',
      note: 'Scoped shortcuts only fire when their scope is active. Activate with `useHotkeyScope(scope)` (component-scoped) or `enableScope(scope)` (imperative). Activation is reference-counted, so stacked components sharing a scope keep it active until all release it. Without activation, scoped handlers are silently dormant.',
    },
    {
      label: 'Shifted symbols',
      note: 'Bind a single symbol directly (`?`, `!`, `+`) — it fires on the real shifted keystroke that produces it (`?` on Shift+/). Don\'t write `shift+?`; the symbol already implies shift.',
    },
    {
      label: 'SSR-safe',
      note: 'Registration and scope activation are no-ops on the server (the registry drives a browser `keydown` listener). `getRegisteredHotkeys()` is therefore client-runtime state — build SSR help panels from a static config, not the live registry.',
    },
  ],
})
