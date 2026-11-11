import { For } from '@pyreon/core'
import { sheet } from '@pyreon/styler'
// Named import: only `notFound` is bundled, not the rest of _project.json.
import { notFound } from '../content/_project.json'
import type { NotFoundPage } from '../content/types-site'
import { C } from '../kit/classes'
import { SITE_CSS, SITE_CSS_KEY } from '../kit/site-css'
import art from '../media/illustrations/404.svg?raw'
import { resolveHref } from '../nav'

export const NF = notFound as unknown as NotFoundPage

/**
 * The 404 (`_project.json` → `notFound`, visual-alignment.md §B `404`): the
 * code in the display gradient with one signal pulse, "signal not found",
 * the lede, the one-line snippet, the illustration from the asset set and
 * the way out.
 *
 * Plain markup on the site stylesheet, not the rocketstyle kit, because it
 * also renders inside the docs app (a missing docs page, a missing post),
 * where the kit's styling runtime would be extra weight for one page. It
 * injects the stylesheet itself, so it looks the same in either shell.
 */
export function NotFound() {
  sheet.injectRules([SITE_CSS], SITE_CSS_KEY)
  return (
    <section class={C.nf} aria-labelledby="not-found-title">
      <h1 id="not-found-title">
        <span class={C.nfCode}>{NF.code}</span>
        <span class={C.nfTitle} style="display:block">{`${NF.title} · ${NF.text}`}</span>
      </h1>
      <p class={C.nfLede}>{NF.lede}</p>
      <code class={C.nfSnippet}>{NF.snippet}</code>
      <div class={C.nfArt} dangerouslySetInnerHTML={{ __html: art }} />
      <ul class={C.nfLinks}>
        <For each={NF.links} by={(l) => l.href}>
          {(l) => (
            <li>
              <a class={C.nfLink} href={resolveHref(l.href)}>
                <span class={C.nfLinkLabel}>{`${l.label} →`}</span>
                {l.text}
              </a>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}
