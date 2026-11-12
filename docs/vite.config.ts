import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'
import { seoPlugin } from '@pyreon/zero/seo'
import { defineConfig } from 'vite'
import { pyreonSyntaxDark, pyreonSyntaxLight } from './src/styles/pyreon-syntax'
import inlineCriticalCss from './vite-plugins/inline-critical-css'
import lastUpdated from './vite-plugins/last-updated'
import legacyCssLayer from './vite-plugins/legacy-css-layer'
import atlasDemo from './vite-plugins/atlas-demo'
import openStats from './vite-plugins/open-stats'
import blogCopy from './src/site/content/pages/channels/blog.json'
import docsHomeContent from './vite-plugins/docs-home-content'
import productContent from './vite-plugins/product-content'
import sitePagesContent from './vite-plugins/site-pages-content'
import siteReleases from './vite-plugins/site-releases'
import publishLlmsTxt from './vite-plugins/publish-llms-txt'
import staticPages from './vite-plugins/static-pages'
import { blogBench, blogPlanned } from './vite-plugins/blog'
import { SITE_LINKS } from './src/site-links'

// Pyreon-native docs site, powered by @pyreon/zero + @pyreon/zero-content.
//
// Plugin order: content() first (compiles .md → JSX → JS via esbuild),
// then pyreon() (JSX optimizations), zero() (fs-router + SSG), then
// last-updated which injects a per-page modified-timestamp registry
// into the entry HTML for the PageMeta footer.
//
// `mode: 'ssg'` prerenders every doc URL to its own
// `dist/<path>/index.html` so deep links resolve on plain static
// hosts (GitHub Pages, Netlify, Cloudflare Pages) without SPA
// fallback. Catch-all route `/docs/[...slug]` is enumerated at
// build time by its own `getStaticPaths` export.
//
// `base` defaults to `/` — which is the production base now that the
// site serves at the apex custom domain `pyreon.dev` (GitHub Pages via
// Cloudflare DNS; custom domain pinned by `docs/public/CNAME`). No
// `--base` flag is passed in the deploy workflow. (Pre-cutover the
// GitHub Pages project-pages URL needed `--base=/pyreon/` via the
// `argvHasBaseFlag` carve-out in @pyreon/zero — PR #1395 — retired now.)
// Per PR E "base single-source-of-truth wiring":
// `zero({ base })` flows to vite.config.base, __ZERO_BASE__, and
// the SSG entry's createApp call.
export default defineConfig({
  plugins: [
    // tokens.css → `@layer docs`, below the UI system's layers (see the plugin).
    legacyCssLayer(),
    // Product content JSON → Shiki-highlighted code at build time.
    productContent(),
    // Story / compare / migrate / project content JSON → highlighted code at build time.
    sitePagesContent(),
    // The docs home's code (`_docs-home.json`) → Shiki at build time.
    docsHomeContent(),
    // The custom pyreon-syntax Shiki themes mirror the brand handoff §3/§6.7
    // tokens (`--syn-*` in tokens.css). VitePress applied them via its
    // `markdown.theme: { light, dark }` config — same surface here, only
    // wired through `@pyreon/zero-content`'s highlighter option.
    // `::: bench` blocks in blog posts → raw HTML around their list, before
    // content() compiles the post (src/blog/bench.ts).
    blogBench({ moreLabel: blogCopy.bench.more }),
    // virtual:pyreon-blog-planned — the scheduled posts "Up next" lists.
    blogPlanned(),
    content({
      highlighter: {
        themes: { light: pyreonSyntaxLight, dark: pyreonSyntaxDark },
      },
      // /blog/rss.xml — published posts only (drafts and posts dated after
      // this build are left out; see content.config.ts), newest first, full
      // HTML bodies with absolute URLs so dev.to "Publishing from RSS" and
      // feed readers get the whole article. The sitemap comes from
      // seoPlugin below, which lists every prerendered page.
      seo: {
        baseUrl: 'https://pyreon.dev',
        rss: {
          collection: 'blog',
          path: 'blog/rss.xml',
          title: blogCopy.meta.title,
          description: blogCopy.meta.description,
          language: 'en',
          content: 'full',
        },
      },
    }),
    pyreon(),
    // Self-host the brand fonts (dogfoods zero's fontPlugin, wired here
    // via `zero({ font })`): woff2 emitted same-origin under
    // /assets/fonts, the `latin` subset only, plus size-adjusted
    // `"<Family> Fallback"` faces (fallbackAdjust) that eliminate
    // font-swap CLS and expose the `--pyreon-font-*` vars tokens.css
    // consumes. Replaces the hand-rolled fonts.googleapis.com <link> in
    // index.html — removing two cross-origin connections and Google's
    // short-cached CSS from the critical path.
    zero({
      mode: 'ssg',
      font: {
        google: [
          'Space Grotesk:wght@400;500;600;700',
          'JetBrains Mono:wght@400;500;600',
        ],
        subsets: ['latin'],
        selfHost: true,
        fallbackAdjust: true,
      },
    }),
    lastUpdated({ contentDir: 'src/content/docs' }),
    // virtual:pyreon-open-stats — GitHub / npm / repo numbers for /open,
    // fetched once per build; a failed source renders as "unavailable".
    openStats(),
    // virtual:pyreon-site-releases — released versions (CHANGELOG.md) and the
    // unreleased changesets on main, read once per build for /releases.
    siteReleases(),
    // /llms.txt + /llms-full.txt — the repo-root files `bun run gen-docs`
    // generates from the package manifests (see the plugin).
    publishLlmsTxt(),
    // /demos/atlas/ — the Atlas workbench the /products/atlas demo embeds,
    // built from examples/atlas-workshop (about 2 s), never committed.
    atlasDemo(),
    // dist/sitemap.xml from the SSG output: every prerendered page and
    // nothing else, so an unpublished blog post (never rendered) is never
    // listed.
    seoPlugin({
      sitemap: {
        origin: 'https://pyreon.dev',
        useSsgPaths: true,
        trailingSlash: 'never',
        // A stable link that forwards (/discord, /newsletter once switched on)
        // is a redirect, not a page worth indexing.
        // /why and /compare are redirects to their first page (sitemap
        // decision "merge"), not pages.
        exclude: [
          ...Object.entries(SITE_LINKS)
            .filter(([, target]) => target !== null)
            .map(([key]) => `/${key}`),
          // Exactly these two: their pages (/why/<id>, /compare/<id>) stay listed.
          /^\/why$/,
          /^\/compare$/,
        ],
      },
      // Everything is crawlable; the sitemap is the list above.
      robots: { rules: [{ userAgent: '*', allow: ['/'] }], sitemap: 'https://pyreon.dev/sitemap.xml' },
    }),
    // Marketing pages hydrate only their islands: drop the route preloads
    // and loader data they would carry for a full app (see the plugin).
    staticPages(),
    // Must come AFTER zero() so its closeBundle runs on the final SSG
    // HTML — folds the render-blocking app stylesheet into each page's
    // <head> to clear the last critical-path request before first paint.
    inlineCriticalCss(),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // `@pyreon/server/client` re-exports `island()`, and rolldown
            // otherwise co-locates island.ts with the first route that
            // declares an island (/products/[id]), so the static pages'
            // island hydrator imported that whole route chunk. One group for
            // the islands runtime keeps it standalone.
            { name: 'islands-runtime', test: /[\\/]core[\\/]server[\\/](?:src|lib)[\\/]/ },
          ],
        },
      },
    },
  },
  server: { port: 5191 },
})
