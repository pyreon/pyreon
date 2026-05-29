import { signal } from '@pyreon/reactivity'

const ALL_COMMANDS = [
  'Open file',
  'Search files',
  'Toggle theme',
  'Run task',
  'Reload window',
  'New terminal',
]

export default function CommandPalette() {
  const open = signal(false)
  const query = signal('')

  return (
    <div
      data-testid="command-palette"
      style="padding: 12px; border: 1px solid #ccc; border-radius: 4px;"
    >
      <div style="display: flex; gap: 8px; align-items: center;">
        <strong>Interaction-only command palette:</strong>
        <button data-testid="command-palette-trigger" type="button" onClick={() => open.set(true)}>
          Open palette (⌘K)
        </button>
        <span data-testid="command-palette-state">{() => (open() ? 'open' : 'closed')}</span>
      </div>
      <div
        data-testid="command-palette-panel"
        style={() =>
          `margin-top: 12px; padding: 12px; border: 1px solid #aaa; border-radius: 4px; background: #fafafa; display: ${open() ? 'block' : 'none'};`
        }
      >
        <input
          data-testid="command-palette-input"
          type="text"
          placeholder="Type a command…"
          value={() => query()}
          onInput={(e) => query.set((e.currentTarget as HTMLInputElement).value)}
          style="width: 100%; padding: 6px; box-sizing: border-box;"
        />
        <ul data-testid="command-palette-list" style="margin: 8px 0 0; padding-left: 20px;">
          {() =>
            ALL_COMMANDS.filter((c) => c.toLowerCase().includes(query().toLowerCase())).map((c) => (
              <li>{c}</li>
            ))
          }
        </ul>
      </div>
    </div>
  )
}
