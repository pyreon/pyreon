import { provide } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { useLoaderData } from '@pyreon/router'
import { DocsDataContext, EMPTY_PAGE_DATA, loadPageData, type DocsPageData } from '../../docs-ui/data'
import { docsHead, loadShareCards, type DocsShareCards } from '../../docs-ui/head'
import { DocsHome, HOME, HOME_HEADINGS } from '../../docs-ui/home/DocsHome'
import { trailOf } from '../../docs-ui/nav'
import { DocsPage } from '../../docs-ui/page'

interface HomeLoaderData {
  page: DocsPageData
  cards: DocsShareCards
}

/** The rail card on the home is the product its status banner is about (Native). */
const BANNER_PRODUCT = trailOf(HOME.banner.link.href)?.productId

export async function loader(): Promise<HomeLoaderData> {
  const [page, all] = await Promise.all([loadPageData('/docs', BANNER_PRODUCT), loadShareCards()])
  // Only the home's own card travels with the loader data into the page.
  const home = all.pages['/docs']
  return { page, cards: { pages: home ? { '/docs': home } : {}, groups: {} } }
}

/** `/docs` — the docs home (`_docs-home.json`), in the same reading frame as every page. */
export default function DocsIndexRoute() {
  // Undefined only on a client-only cold start (`vite dev`): zero runs the
  // loader right after mount and re-renders. Prerendered pages always have it.
  const data = useLoaderData<HomeLoaderData | undefined>()
  provide(DocsDataContext, data?.page ?? EMPTY_PAGE_DATA)
  useHead(docsHead({ path: '/docs', title: HOME.meta.title, description: HOME.meta.description }, data?.cards))
  return (
    <DocsPage path="/docs" title={HOME.meta.title} headings={HOME_HEADINGS} ownTitle>
      <DocsHome />
    </DocsPage>
  )
}
