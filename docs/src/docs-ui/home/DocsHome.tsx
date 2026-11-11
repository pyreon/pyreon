import { island } from '@pyreon/zero'
import homeJson from '../../site/content/_docs-home.json'
import type { DocsHome as DocsHomeData } from '../../site/content/types-site'
import { DocsGlyph as Glyph } from '../glyph'
import { useLinkClick } from '../../site/kit/link'
import { Inline } from '../inline'
import { Command } from '../command'
import { CodeFigure } from '../code-figure'
import { When } from '../when'

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
        <p><Inline text={d.banner.text} /></p>
        <a href={d.banner.link.href} onClick={click(d.banner.link.href)}>
          {d.banner.link.label} →
        </a>
      </aside>

      <header class="dx-home__hero">
        <p class="dx-eyebrow">
          {d.hero.eyebrow} · {d.counts.docPages} pages
        </p>
        <h1 class="dx-home__title">{d.hero.title}</h1>
        <p class="dx-home__lede"><Inline text={d.hero.lede} /></p>
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
              <When on={p.status}>
                <span class="dx-bdg dx-bdg--preview dx-path__status">{p.status}</span>
              </When>
              <p class="dx-path__text"><Inline text={p.text} /></p>
              <Command command={p.command} />
              <When on={p.alt}>
                <p class="dx-path__alt">{p.alt?.label}</p>
                <Command command={p.alt?.command ?? ''} />
              </When>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="products" class="dx-home__sec">
        <h2 id="products">{d.tiles.title}</h2>
        <p class="dx-home__text"><Inline text={d.tiles.text} /></p>
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
                    <strong>{t.proof.stat}</strong> <Inline text={t.proof.label} />
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
        <p class="dx-home__text"><Inline text={d.whyFast.text} /></p>
        <div class="dx-why">
          <CodeFigure label={d.whyFast.code.file} lang={d.whyFast.code.lang} source={d.whyFast.code.source} html={d.whyFast.code.html} />
          <div class="dx-why__live">
            <p class="dx-live">
              <i aria-hidden="true" />
              live · @pyreon/reactivity
            </p>
            <RunOnceCounter />
            <p class="dx-why__note"><Inline text={d.whyFast.live.note} /></p>
          </div>
        </div>
        <details class="dx-why__compiled">
          <summary>{d.whyFast.compiled.label}</summary>
          <CodeFigure label={d.whyFast.compiled.label} lang={d.whyFast.compiled.lang} source={d.whyFast.compiled.source} html={d.whyFast.compiled.html} />
        </details>
        <a class="dx-more" href={d.whyFast.link.href} onClick={click(d.whyFast.link.href)}>
          {d.whyFast.link.label} →
        </a>

        <ul class="dx-proof" aria-label="From the benchmark record">
          {d.proofStrip.items.map((p) => (
            <li>
              <span class="dx-proof__stat">{p.stat}</span>
              <span class="dx-proof__label"><Inline text={p.label} /></span>
              <span class="dx-proof__cond">{p.condition}</span>
            </li>
          ))}
        </ul>
        <p class="dx-caveat">
          <span>{d.proofStrip.footer}</span>{' '}
          <a href={d.proofStrip.link.href} onClick={click(d.proofStrip.link.href)}>
            {d.proofStrip.link.label} →
          </a>
        </p>
      </section>

      <section aria-labelledby="whats-new" class="dx-home__sec">
        <h2 id="whats-new">{d.whatsNew.title}</h2>
        <p class="dx-home__text"><Inline text={d.whatsNew.text} /></p>
        <ul class="dx-new">
          {d.whatsNew.items.map((n) => (
            <li class="dx-new__item">
              <span class="dx-new__area">{n.area}</span>
              <div>
                <a class="dx-new__title" href={n.href} onClick={click(n.href)}>
                  <Inline text={n.title} />
                </a>
                <p><Inline text={n.text} /></p>
              </div>
              <span class={n.kind === 'breaking' ? 'dx-bdg dx-bdg--preview' : 'dx-bdg dx-bdg--new'}>
                {n.kind === 'breaking' ? 'breaking · next release' : n.status}
              </span>
            </li>
          ))}
        </ul>
        <p class="dx-caveat">
          <span>{d.whatsNew.footer}</span>{' '}
          <a href={d.whatsNew.link.href} onClick={click(d.whatsNew.link.href)}>
            {d.whatsNew.link.label} →
          </a>
        </p>
      </section>
    </div>
  )
}
