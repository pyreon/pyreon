import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { h, provide, Suspense } from '@pyreon/core'
import { useHead, type UseHeadInput } from '@pyreon/head'
import { isServer, signal } from '@pyreon/reactivity'
import { useParams } from '@pyreon/router'
import { getEntry } from '@pyreon/zero-content'
import type { GetStaticPaths } from '@pyreon/zero/server'
// Side-effect import — populates the @pyreon/zero-content collection
// registry. `entry-client.ts` does the same for runtime; SSG render time
// needs it too because the route module is evaluated in the inner SSR
// build's module graph (which doesn't go through entry-client).
import 'virtual:zero-content/collections'
import { PyreonNotFound } from '../../components/PyreonNotFound'
import { docsHead, loadShareCards } from '../../docs-ui/head'
import { DocsDataContext, loadPageData, type DocsPageData } from '../../docs-ui/data'
import { DocsPage } from '../../docs-ui/page'
import type { TocHeading } from '../../docs-ui/toc'

const slugGlob = import.meta.glob('../../content/docs/**/*.md')

/**
 * Every Markdown page under `content/docs/` except `index.md`: `/docs` is the
 * docs home (`index.tsx`, from `_docs-home.json`), so `/docs/index` would only
 * duplicate it.
 */
export const getStaticPaths: GetStaticPaths<{ slug: string }> = () =>
  Object.keys(slugGlob)
    .map((p) => p.replace('../../content/docs/', '').replace(/\.(md|mdx)$/, ''))
    .filter((slug) => slug !== 'index')
    .map((slug) => ({ params: { slug } }))

function DataProvider(props: { data: DocsPageData; children?: VNodeChild }) {
  provide(DocsDataContext, props.data)
  return props.children
}

/**
 * The page body: resolves the entry, its compiled Markdown and the page's
 * product data together, then renders synchronously inside the provider. An
 * async component (awaited by renderToString on the server; behind the
 * Suspense boundary below on the client), the same shape as zero-content's
 * `defineContentRoute`, which this route replaces only to load the product
 * data alongside the page.
 */
const Body = (async (props: { slug: string }) => {
  // Register the head entry during the synchronous part of setup: after the
  // await there is no current component on the client (see
  // zero-content/route-helpers.ts for the full story).
  const headInput = signal<UseHeadInput>({})
  useHead(() => headInput())
  const path = `/docs/${props.slug}`
  // Share cards only matter in the prerendered HTML (crawlers read it), so the
  // client never downloads the map.
  const [entry, cards, pageData] = await Promise.all([
    getEntry('docs', props.slug),
    isServer ? loadShareCards() : Promise.resolve(undefined),
    loadPageData(path),
  ])
  if (!entry || props.slug === 'index') return h(PyreonNotFound, null)
  const data = entry.data as { title: string; description?: string }
  const input = docsHead({ path, title: data.title, description: data.description }, cards)
  headInput.set(input)
  useHead(input)
  const Content = await entry.render()
  return h(
    DataProvider,
    { data: pageData },
    h(
      DocsPage,
      {
        path,
        title: data.title,
        description: data.description,
        slug: props.slug,
        headings: (entry.headings ?? []) as TocHeading[],
      },
      h(Content, null),
    ),
  )
}) as unknown as ComponentFn<{ slug: string }>

export default function DocsContentRoute(): VNodeChild {
  const params = useParams() as unknown as { slug?: string | string[] }
  const raw = params.slug ?? ''
  const slug = Array.isArray(raw) ? raw.join('/') : raw
  return h('div', { class: 'dx-route', 'data-page-slug': slug }, h(Suspense, { fallback: h('div', { class: 'dx-loading' }) }, h(Body, { slug })))
}
