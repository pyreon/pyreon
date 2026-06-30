import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'
import { pyreonSyntaxDark, pyreonSyntaxLight } from './src/styles/pyreon-syntax'
import inlineCriticalCss from './vite-plugins/inline-critical-css'
import lastUpdated from './vite-plugins/last-updated'

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
// Per CLAUDE.md PR E "base single-source-of-truth wiring":
// `zero({ base })` flows to vite.config.base, __ZERO_BASE__, and
// the SSG entry's createApp call.
export default defineConfig({
  plugins: [
    // The custom pyreon-syntax Shiki themes mirror the brand handoff §3/§6.7
    // tokens (`--syn-*` in tokens.css). VitePress applied them via its
    // `markdown.theme: { light, dark }` config — same surface here, only
    // wired through `@pyreon/zero-content`'s highlighter option.
    content({
      highlighter: {
        themes: { light: pyreonSyntaxLight, dark: pyreonSyntaxDark },
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
    // Must come AFTER zero() so its closeBundle runs on the final SSG
    // HTML — folds the render-blocking app stylesheet into each page's
    // <head> to clear the last critical-path request before first paint.
    inlineCriticalCss(),
  ],
  server: { port: 5191 },
})
