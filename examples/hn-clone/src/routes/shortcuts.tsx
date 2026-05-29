import { useHead } from '@pyreon/head'
import { useI18n } from '@pyreon/i18n'

interface ShortcutGroup {
  heading: string
  items: { combo: string; description: string }[]
}

/**
 * Shortcuts page — read-only reference for the global hotkeys registered
 * in `_layout.tsx`'s `<HotkeysRegistry>`. Pyreon's `@pyreon/hotkeys` runs
 * scope-aware, modifier-aware, sequential-prefix combos (vim/Gmail-style
 * `g t`, `g n`).
 */
export default function ShortcutsPage() {
  const { t } = useI18n()
  useHead(() => ({ title: `${t('nav.shortcuts')} — Hacker News (Pyreon)` }))

  const groups: ShortcutGroup[] = [
    {
      heading: 'Navigation (vim / Gmail prefix)',
      items: [
        { combo: 'g t', description: 'Top stories' },
        { combo: 'g n', description: 'New stories' },
        { combo: 'g a', description: 'Ask HN' },
        { combo: 'g s', description: 'Show HN' },
        { combo: 'g j', description: 'Jobs' },
        { combo: 'g b', description: 'Bookmarks' },
        { combo: 'g /', description: 'Search' },
      ],
    },
    {
      heading: 'Search page',
      items: [
        { combo: 'Esc', description: 'Clear the query' },
        { combo: '⌘ Enter', description: 'Open the first result' },
      ],
    },
    {
      heading: 'Help',
      items: [{ combo: '?', description: 'This shortcuts page' }],
    },
  ]

  return (
    <section class="shortcuts-page">
      <h1>Keyboard Shortcuts</h1>
      <p class="shortcuts-intro">
        All shortcuts are registered via <code>@pyreon/hotkeys</code> — scope-aware,
        sequential-prefix, mod-aware (⌘ on Mac / Ctrl elsewhere via the <code>mod</code> token).
      </p>

      {groups.map((group) => (
        <div class="shortcuts-group">
          <h2>{group.heading}</h2>
          <table class="shortcuts-table">
            <thead>
              <tr>
                <th>Combo</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((it) => (
                <tr>
                  <td>
                    {it.combo.split(' ').map((part, i) => (
                      <>
                        {i > 0 && <span class="combo-sep">then</span>}
                        <kbd>{part}</kbd>
                      </>
                    ))}
                  </td>
                  <td>{it.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
