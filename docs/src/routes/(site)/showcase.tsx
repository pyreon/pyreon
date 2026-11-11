import { island } from '@pyreon/zero'
import { usePageHead } from '../../site/head'

// `/showcase` is a static page: the filter and the groups it filters are one island.
const ShowcaseGalleryIsland = island(() => import('../../showcase/ShowcaseGallery'), { name: 'ShowcaseGallery', hydrate: 'idle' })

/** `/showcase` — example apps from the repository, grouped by what they show. */
export default function ShowcasePage() {
  usePageHead({
    path: '/showcase',
    title: 'Showcase · Pyreon',
    description:
      'What you can build with Pyreon: full-stack Zero apps, a local-first collaborative board, one tasks app for web, iOS and Android, and React, Vue, Solid, Preact and Svelte code running on Pyreon.',
  })
  return (
    <div class="site-page showcase-page">
      <header class="site-page__hero">
        <p class="site-page__eyebrow">Showcase</p>
        <h1>What you can build with Pyreon</h1>
        <p class="site-page__lead">
          Real apps from the repository, each one screenshotted from the running app. Clone the
          repo and every one of them is a single command away. Want the building blocks first?
          Browse the <a href="/atlas/" data-allow-reload>component catalog</a> or start with the{' '}
          <a href="/docs/getting-started">guide</a>.
        </p>
      </header>

      <ShowcaseGalleryIsland />
    </div>
  )
}
