import { island } from '@pyreon/zero'
import homeJson from '../../site/content/_docs-home.json'
import type { DocsHome as DocsHomeData } from '../../site/content/types-site'
import { DocsGlyph as Glyph } from '../glyph'
import { useLinkClick } from '../../site/kit/link'
import { renderInline } from '../../site/kit/type'
import { Command } from '../command'

/** The build adds Shiki output next to each code string (vite-plugins/docs-home-content.ts). */
type HomeData = DocsHomeData & {
  whyFast: DocsHomeData['whyFast'] & {
    code: DocsHomeData['whyFast']['code'] & { html?: string }
    compiled: DocsHomeData['whyFast']['compiled'] & { html?: string }
  }
}
export const HOME = homeJson as unknown as HomeData

/** The home's section headings, for the TOC (ids match the h2s below). */
export const HOME_HEADINGS = [
  { level: 2, text: 'Start here', slug: 'start-here' },
  { level: 2, text: HOME.tiles.title, slug: 'products' },
  { level: 2, text: HOME.whyFast.title, slug: 'why-fast' },
  { level: 2, text: HOME.whatsNew.title, slug: 'whats-new' },
]

const RunOnceCounter = island(() => import('./RunOnceCounter'), { name: 'RunOnceCounter', hydrate: 'visible', prefetch: 'idle' })

function Code(props: { label: string; lang: string; source: string; html?: string | undefined }) {
  return (
    <figure class="dx-code">
      <figcaption class="dx-code__head">
        <span>{props.label}</span>
        <span class="dx-code__sp" />
        <span>{props.lang}</span>
      </figcaption>
      {props.html ? (
        // Build-time Shiki output of repo-owned content (vite-plugins/docs-home-content.ts).
        // A focusable region: the code scrolls sideways on its own, so the keyboard must reach it.
        <section class="dx-code__body dx-shiki" tabIndex={0} aria-label={props.label} dangerouslySetInnerHTML={{ __html: props.html }} />
      ) : (
        <section class="dx-code__body" tabIndex={0} aria-label={props.label}>
          <pre>
            <code>{props.source}</code>
          </pre>
        </section>
      )}
    </figure>
  )
}

/**
 * `/docs` — the docs home (`_docs-home.json`): the experimental-native
 * banner, the four "start here" paths with their exact create command, the
 * products people start with (one sourced number each, with its run
 * condition), why it's fast with the live run-once counter, the proof strip,
 * and what is new on main.
 */
export function DocsHome() {
  const d = HOME
  const click = useLinkClick()
  return (
    <div class="dx-home">
      <aside class="dx-banner" aria-label="Status">
        <span class="dx-bdg dx-bdg--preview">{d.banner.label}</span>
        <p>{renderInline(d.banner.text)}</p>
        <a href={d.banner.link.href} onClick={click(d.banner.link.href)}>
          {d.banner.link.label} →
        </a>
      </aside>

      <header class="dx-home__hero">
        <p class="dx-eyebrow">
          {d.hero.eyebrow} · {d.counts.docPages} pages
        </p>
        <h1 class="dx-home__title">{d.hero.title}</h1>
        <p class="dx-home__lede">{renderInline(d.hero.lede)}</p>
      </header>

      <section aria-labelledby="start-here">
        <h2 id="start-here" class="dx-sr">
          Start here
        </h2>
        <div class="dx-paths">
          {d.startHere.map((p) => (
            <div class="dx-path">
              <div class="dx-path__glyphs" aria-hidden="true">
                {p.productIds.slice(0, 1).map((id) => (
                  <Glyph id={id} size={22} />
                ))}
              </div>
              <h3 class="dx-path__title">
                <a href={p.href} onClick={click(p.href)}>
                  {p.title}
                </a>
              </h3>
              {p.status ? <span class="dx-bdg dx-bdg--preview dx-path__status">{p.status}</span> : null}
              <p class="dx-path__text">{renderInline(p.text)}</p>
              <Command command={p.command} />
              {p.alt ? (
                <>
                  <p class="dx-path__alt">{p.alt.label}</p>
                  <Command command={p.alt.command} />
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="products" class="dx-home__sec">
        <h2 id="products">{d.tiles.title}</h2>
        <p class="dx-home__text">{renderInline(d.tiles.text)}</p>
        <ul class="dx-tiles">
          {d.tiles.items.map((t) => (
            <li>
              <a class="dx-tilecard" href={t.href} onClick={click(t.href)}>
                <span class="dx-tile">
                  <Glyph id={t.productId} size={20} />
                </span>
                <span class="dx-tilecard__body">
                  <b>{t.name}</b>
                  <span class="dx-tilecard__proof">
                    <strong>{t.proof.stat}</strong> {renderInline(t.proof.label)}
                  </span>
                  <span class="dx-tilecard__cond">{t.proof.condition}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <a class="dx-more" href={d.tiles.link.href} onClick={click(d.tiles.link.href)}>
          {d.tiles.link.label} →
        </a>
      </section>

      <section aria-labelledby="why-fast" class="dx-home__sec">
        <h2 id="why-fast">{d.whyFast.title}</h2>
        <p class="dx-home__text">{renderInline(d.whyFast.text)}</p>
        <div class="dx-why">
          <Code label={d.whyFast.code.file} lang={d.whyFast.code.lang} source={d.whyFast.code.source} html={d.whyFast.code.html} />
          <div class="dx-why__live">
            <p class="dx-live">
              <i aria-hidden="true" />
              live · @pyreon/reactivity
            </p>
            <RunOnceCounter />
            <p class="dx-why__note">{renderInline(d.whyFast.live.note)}</p>
          </div>
        </div>
        <details class="dx-why__compiled">
          <summary>{d.whyFast.compiled.label}</summary>
          <Code label={d.whyFast.compiled.label} lang={d.whyFast.compiled.lang} source={d.whyFast.compiled.source} html={d.whyFast.compiled.html} />
        </details>
        <a class="dx-more" href={d.whyFast.link.href} onClick={click(d.whyFast.link.href)}>
          {d.whyFast.link.label} →
        </a>

        <ul class="dx-proof" aria-label="From the benchmark record">
          {d.proofStrip.items.map((p) => (
            <li>
              <span class="dx-proof__stat">{p.stat}</span>
              <span class="dx-proof__label">{renderInline(p.label)}</span>
              <span class="dx-proof__cond">{p.condition}</span>
            </li>
          ))}
        </ul>
        <p class="dx-caveat">
          {d.proofStrip.footer}{' '}
          <a href={d.proofStrip.link.href} onClick={click(d.proofStrip.link.href)}>
            {d.proofStrip.link.label} →
          </a>
        </p>
      </section>

      <section aria-labelledby="whats-new" class="dx-home__sec">
        <h2 id="whats-new">{d.whatsNew.title}</h2>
        <p class="dx-home__text">{renderInline(d.whatsNew.text)}</p>
        <ul class="dx-new">
          {d.whatsNew.items.map((n) => (
            <li class="dx-new__item">
              <span class="dx-new__area">{n.area}</span>
              <div>
                <a class="dx-new__title" href={n.href} onClick={click(n.href)}>
                  {renderInline(n.title)}
                </a>
                <p>{renderInline(n.text)}</p>
              </div>
              <span class={n.kind === 'breaking' ? 'dx-bdg dx-bdg--preview' : 'dx-bdg dx-bdg--new'}>
                {n.kind === 'breaking' ? 'breaking · next release' : n.status}
              </span>
            </li>
          ))}
        </ul>
        <p class="dx-caveat">
          {d.whatsNew.footer}{' '}
          <a href={d.whatsNew.link.href} onClick={click(d.whatsNew.link.href)}>
            {d.whatsNew.link.label} →
          </a>
        </p>
      </section>
    </div>
  )
}
