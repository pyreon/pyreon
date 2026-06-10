import { RouterLink } from '@pyreon/router'
import { Sidebar } from '../components/Sidebar'
import { nav } from '../content/nav'

/**
 * Landing page — pitches the dogfood story and lists the available
 * docs pages. Three columns reuse the standard shell so it feels
 * consistent with content pages.
 */
export default function HomePage() {
  return (
    <div class="app-shell">
      <Sidebar />
      <main>
        <article class="content">
          <h1>Pyreon docs, built with Pyreon.</h1>
          <p>
            This site uses <strong>zero VitePress, zero Vue</strong>. It's an{' '}
            <code>@pyreon/zero</code> app with a custom Vite plugin that compiles markdown
            straight into Pyreon components — so every code-fence, callout, and interactive
            playground on every page runs through the same renderer that ships your app.
          </p>
          <p>
            The brand tokens, syntax theme, and Playground UX are ported from the original
            VitePress site (now @pyreon/docs) — this prototype proved the foundation with no
            virtual-DOM tax, no scoped Vue runtime, demonstrating the framework on its own
            primitives.
          </p>

          <h2>What's wired up</h2>
          <ul>
            <li>
              Markdown → Pyreon JSX via a Vite plugin (<code>markdown-it</code> +{' '}
              <code>shiki</code> + custom blocks for Playground / callouts / tabbed code groups).
            </li>
            <li>
              <code>@pyreon/zero</code> routing with fs-router (this very file is one of two
              routes — the other is <code>[...slug].tsx</code> for any compiled markdown page).
            </li>
            <li>
              Reactive theme toggle wired through a signal that mirrors onto{' '}
              <code>html[data-theme]</code> with a pre-paint script for zero-flash dark mode.
            </li>
            <li>
              The Playground component lazy-loads CodeMirror 6, keeping pages without a live
              demo light.
            </li>
          </ul>

          <h2>Browse</h2>
          {nav.map((section) => (
            <div style={{ margin: '20px 0' }}>
              <h3 style={{ margin: '0 0 8px' }}>{section.title}</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '10px',
                }}
              >
                {section.items.map((item) => (
                  <RouterLink
                    to={item.href}
                    style={{
                      display: 'block',
                      padding: '12px 14px',
                      border: '1px solid var(--hairline)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                      textDecoration: 'none',
                      background: 'var(--bg)',
                    }}
                  >
                    <div style={{ fontWeight: '600' }}>{item.title}</div>
                    {item.description != null && (
                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                          marginTop: '4px',
                        }}
                      >
                        {item.description}
                      </div>
                    )}
                  </RouterLink>
                ))}
              </div>
            </div>
          ))}
        </article>
      </main>
      <aside class="toc" />
    </div>
  )
}

export const meta = {
  title: 'Pyreon docs — native demo',
}
