import type { VNodeChild } from '@pyreon/core'
import { font } from '../theme'
import { el, tone } from '../kit/bases'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'
import { SkipLink } from './parts'

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
  return (
    <Page>
      <SkipLink href="#site-main">Skip to content</SkipLink>
      <SiteHeader />
      <Main id="site-main" tabIndex={-1}>
        {props.children}
      </Main>
      <SiteFooter />
    </Page>
  )
}
