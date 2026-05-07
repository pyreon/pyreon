import { Counter, IdleClock, MobileMenu, StaticBadge, VisibleComments } from './islands'

export default function App() {
  return (
    <main style="max-width: 720px; margin: 24px auto; font-family: system-ui, sans-serif; line-height: 1.5;">
      <h1>Pyreon Islands Showcase</h1>
      <p data-testid="static-intro">
        This page is server-rendered HTML. Each <code>&lt;pyreon-island&gt;</code>{' '}
        below ships its own JS bundle and hydrates on its declared strategy.{' '}
        <StaticBadge label="zero JS" />
      </p>

      <section style="margin-top: 32px;">
        <h2>load</h2>
        <p>Hydrates immediately on page load.</p>
        <Counter initial={0} label="Load counter" />
      </section>

      <section style="margin-top: 32px;">
        <h2>idle</h2>
        <p>Waits for the browser to be idle (requestIdleCallback).</p>
        <IdleClock />
      </section>

      <section style="margin-top: 32px;">
        <h2>media((max-width: 768px))</h2>
        <p>Only hydrates when viewport width ≤ 768px.</p>
        <MobileMenu />
      </section>

      <section style="margin-top: 32px;">
        <h2>visible</h2>
        <p>
          Hydrates when the island scrolls into view (IntersectionObserver). Scroll
          down and watch comments appear.
        </p>
        <div style="height: 800px; display: flex; align-items: flex-end;">
          <VisibleComments />
        </div>
      </section>

      <section style="margin-top: 32px;">
        <h2>never</h2>
        <p>Server-rendered only — no client JS loads for this island.</p>
        <StaticBadge label="never hydrates" />
      </section>
    </main>
  )
}
