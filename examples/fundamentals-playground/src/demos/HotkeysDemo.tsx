import {
  disableScope,
  enableScope,
  getRegisteredHotkeys,
  parseShortcut,
  registerHotkey,
} from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'

export function HotkeysDemo() {
  const log = signal<string[]>([])
  const editorScope = signal(false)
  const parsedResult = signal('')

  const addLog = (msg: string) =>
    log.update((l) => [...l.slice(-14), `${new Date().toLocaleTimeString()} — ${msg}`])

  // Global shortcuts
  registerHotkey('mod+k', () => addLog('mod+k: Open command palette'), {
    description: 'Open command palette',
  })

  registerHotkey(
    'mod+s',
    (e) => {
      e.preventDefault()
      addLog('mod+s: Save (prevented default)')
    },
    {
      description: 'Save',
    },
  )

  registerHotkey('mod+shift+p', () => addLog('mod+shift+p: Toggle panel'), {
    description: 'Toggle panel',
  })

  registerHotkey('escape', () => addLog('escape: Close/dismiss'), {
    description: 'Close',
  })

  // Scoped shortcuts
  registerHotkey('mod+z', () => addLog('[editor] mod+z: Undo'), {
    scope: 'editor',
    description: 'Undo',
  })

  registerHotkey('mod+shift+z', () => addLog('[editor] mod+shift+z: Redo'), {
    scope: 'editor',
    description: 'Redo',
  })

  registerHotkey('mod+b', () => addLog('[editor] mod+b: Bold'), {
    scope: 'editor',
    description: 'Bold',
  })

  return (
    <div>
      <h2>Hotkeys</h2>
      <p class="desc">
        Keyboard shortcut management — scope-aware, modifier keys, conflict detection. Press the
        shortcuts to see them fire.
        <code>mod</code> = Cmd on Mac, Ctrl elsewhere.
      </p>

      <div class="section">
        <h3>Global Shortcuts</h3>
        <p style="margin-bottom: 8px">These work anywhere on the page:</p>
        <table style="width: 100%; border-collapse: collapse">
          <thead>
            <tr>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Shortcut
              </th>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 4px 8px">
                <code>Cmd/Ctrl + K</code>
              </td>
              <td style="padding: 4px 8px">Open command palette</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px">
                <code>Cmd/Ctrl + S</code>
              </td>
              <td style="padding: 4px 8px">Save</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px">
                <code>Cmd/Ctrl + Shift + P</code>
              </td>
              <td style="padding: 4px 8px">Toggle panel</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px">
                <code>Escape</code>
              </td>
              <td style="padding: 4px 8px">Close/dismiss</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>Scoped Shortcuts — Editor</h3>
        <p style="margin-bottom: 8px">
          These only fire when the <strong>editor</strong> scope is active:
        </p>
        <div class="row" style="margin-bottom: 8px">
          <button
            type="button"
            class={editorScope() ? 'active' : ''}
            onClick={() => {
              if (editorScope()) {
                disableScope('editor')
                editorScope.set(false)
                addLog('Editor scope disabled')
              } else {
                enableScope('editor')
                editorScope.set(true)
                addLog('Editor scope enabled')
              }
            }}
          >
            {() => (editorScope() ? 'Disable Editor Scope' : 'Enable Editor Scope')}
          </button>
          <span>
            Status:{' '}
            <strong style={`color: ${editorScope() ? 'green' : 'red'}`}>
              {() => (editorScope() ? 'Active' : 'Inactive')}
            </strong>
          </span>
        </div>
        <table style="width: 100%; border-collapse: collapse">
          <thead>
            <tr>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Shortcut
              </th>
              <th style="text-align: left; padding: 4px 8px; border-bottom: 1px solid #ddd">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 4px 8px">
                <code>Cmd/Ctrl + Z</code>
              </td>
              <td style="padding: 4px 8px">Undo</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px">
                <code>Cmd/Ctrl + Shift + Z</code>
              </td>
              <td style="padding: 4px 8px">Redo</td>
            </tr>
            <tr>
              <td style="padding: 4px 8px">
                <code>Cmd/Ctrl + B</code>
              </td>
              <td style="padding: 4px 8px">Bold</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section">
        <h3>Registered Hotkeys</h3>
        <pre style="font-size: 12px; max-height: 200px; overflow-y: auto">
          {() =>
            JSON.stringify(
              getRegisteredHotkeys().map((h) => ({
                shortcut: h.shortcut,
                scope: h.scope,
                description: h.description,
              })),
              null,
              2,
            )
          }
        </pre>
      </div>

      <div class="section">
        <h3>Parse Shortcut</h3>
        <input
          type="text"
          placeholder="Try: mod+shift+k, ctrl+alt+del, escape"
          onInput={(e: Event) => {
            const value = (e.target as HTMLInputElement).value
            if (!value) {
              parsedResult.set('')
              return
            }
            try {
              const combo = parseShortcut(value)
              parsedResult.set(JSON.stringify(combo, null, 2))
            } catch (err) {
              parsedResult.set(`Error: ${(err as Error).message}`)
            }
          }}
          style="width: 100%; padding: 8px; margin-bottom: 8px"
        />
        <pre style="font-size: 12px">{() => parsedResult() || 'Enter a shortcut above...'}</pre>
      </div>

      <div class="section">
        <h3>Event Log</h3>
        <div class="log" style="min-height: 120px">
          {() =>
            log().length === 0 ? 'Press keyboard shortcuts to see events here.' : log().join('\n')
          }
        </div>
      </div>
    </div>
  )
}
