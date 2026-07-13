import { onUnmount } from '@pyreon/core'
import { registerHotkey } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'

/**
 * Live demo of `@pyreon/hotkeys` — real registered shortcuts, not a raw
 * keydown recorder. Click the preview to focus it, then try the combos below.
 * Every shortcut is registered through `registerHotkey` and torn down via
 * `onUnmount`, so the demo leaks nothing when you navigate away.
 *
 * Shows three things the package handles that hand-rolled listeners fumble:
 *  - `mod+k` — `mod` is ⌘ on Mac, Ctrl elsewhere (one binding, both platforms).
 *  - `?` — a shifted-symbol shortcut fires on the real `Shift+/` keystroke.
 *  - `g t` — a sequential combo (press g, then t within a second).
 */
export default function HotkeysKeypressRecorder() {
  const log = signal<string[]>([])
  const add = (label: string) => log.update((l) => [label, ...l].slice(0, 6))

  // Register real shortcuts. registerHotkey returns an unregister fn — collect
  // them and release on unmount so nothing keeps firing after teardown.
  const disposers = [
    registerHotkey('mod+k', () => add('mod+k → command palette'), {
      description: 'Command palette',
    }),
    registerHotkey('?', () => add('? → help'), { description: 'Show help' }),
    registerHotkey('g t', () => add('g t → go to top'), { description: 'Go to top' }),
    registerHotkey('mod+shift+p', () => add('mod+shift+p → preferences'), {
      description: 'Preferences',
    }),
  ]
  onUnmount(() => {
    for (const dispose of disposers) dispose()
  })

  return (
    <div class="col">
      <div class="card" style={{ textAlign: 'center' }}>
        <div class="muted">click here, then try a shortcut</div>
        <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '6px' }}>
          ⌘K &nbsp;·&nbsp; ? &nbsp;·&nbsp; g&nbsp;t &nbsp;·&nbsp; ⌘⇧P
        </div>
      </div>
      <div
        class="card"
        style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: '13px' }}
      >
        {() =>
          log().length === 0 ? (
            <span class="muted">no shortcut fired yet</span>
          ) : (
            <div class="col" style={{ gap: '4px' }}>
              {log().map((entry) => (
                <div>↳ {entry}</div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
