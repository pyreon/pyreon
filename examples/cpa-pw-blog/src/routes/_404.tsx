import { useHead } from '@pyreon/head'
import { Link } from '@pyreon/zero/link'

/**
 * Not-found page. fs-router scans `_404.tsx` and attaches the default
 * export as `notFoundComponent` on the parent layout's RouteRecord. At
 * SSG build time the ssg-plugin walks the route tree, picks up the
 * first `notFoundComponent`, renders it through the same SSR pipeline
 * as regular paths (styler tag, head meta, asset preloads), and writes
 * to `dist/404.html`. Static hosts (Netlify, Cloudflare Pages, GitHub
 * Pages, S3+CloudFront) serve this file automatically for unmatched
 * URLs.
 */
export default function NotFoundPage() {
  useHead({
    title: '404 — Not found',
    meta: [{ name: 'robots', content: 'noindex' }],
  })

  return (
    <article class="not-found">
      <h1>404</h1>
      <p>The page you requested doesn't exist.</p>
      <p>
        <Link href="/blog">← Browse all posts</Link>
      </p>
    </article>
  )
}
