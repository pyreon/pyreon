import type { VNodeChild } from '@pyreon/core'
import { font } from '../theme'
import { el, tone } from '../kit/bases'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
import { SkipLink } from './parts'
import { sheet } from '@pyreon/styler'
import { SITE_CSS, SITE_CSS_KEY } from '../kit/site-css'

const Page = el
  .config({ name: 'SitePage' })
  .attrs({ block: true, contentAlignX: 'block' })
  .theme((_t, m) => ({
    minHeight: '100vh',
    backgroundColor: tone(m, 'bg'),
    color: tone(m, 'text'),
    fontFamily: font.sans,
    extendCss: `
      overflow-x: clip;
      -webkit-font-smoothing: antialiased;
      ::selection { background: ${tone(m, 'selection')}; }
    `,
  }))

// contentAlignX 'block' stretches the route outlet to the column: without it
// a column flexbox sizes its child to fit-content, and one long line of
// content (a heading, a code sample) made the whole page wider than the phone.
const Main = el.config({ name: 'SiteMain' }).attrs({ tag: 'main', block: true, contentAlignX: 'block' }).theme(() => ({ flexGrow: 1, minWidth: 0 }))

/**
 * The marketing shell: skip link, `<header>` (nav, mega menu, mobile sheet),
 * `<main id="site-main">`, `<footer>`. Every non-docs page renders in it —
 * through `routes/(site)/_layout.tsx`, and directly from `_404.tsx`.
 */
export function SiteShell(props: { children?: VNodeChild }) {
  // The islands' plain stylesheet (kit/site-css.ts): into this request's
  // <style> on the server, into the live sheet when the docs app renders a
  // marketing page in the browser. Idempotent by key.
  sheet.injectRules([SITE_CSS], SITE_CSS_KEY)
  return (
    <Page>
      <SkipLink href="#site-main">Skip to content</SkipLink>
      <SiteHeader />
      <Main id="site-main" tabIndex={-1} data-site-static="">
        {props.children}
      </Main>
      <SiteFooter />
    </Page>
  )
}

/**
 * Top/bottom room for pages whose content predates the redesign (blog,
 * showcase, open, discord, newsletter): they were laid out under the old
 * static header, so they need clearance below the floating bar. Kit pages
 * start with a hero `Section`, which carries its own.
 */
export const PageFrame = el
  .config({ name: 'SitePageFrame' })
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme(() => ({ paddingTop: { xs: 104, md: 128 }, paddingBottom: { xs: 64, md: 96 } }))
