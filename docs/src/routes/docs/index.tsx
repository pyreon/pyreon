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
  // loader right after mount. Prerendered pages always have it. The accessor
  // re-renders the home with the data when it arrives (the provided page data
  // is a plain context value, so the provider must remount to change it).
  const data = useLoaderData<HomeLoaderData | undefined>()
  return () => {
    const current = data()
    return <DocsHomeView page={current?.page ?? EMPTY_PAGE_DATA} cards={current?.cards} />
  }
}

function DocsHomeView(props: { page: DocsPageData; cards: DocsShareCards | undefined }) {
  provide(DocsDataContext, props.page)
  useHead(docsHead({ path: '/docs', title: HOME.meta.title, description: HOME.meta.description }, props.cards))
  return (
    <DocsPage path="/docs" title={HOME.meta.title} headings={HOME_HEADINGS} ownTitle>
      <DocsHome />
    </DocsPage>
  )
}
