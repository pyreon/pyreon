import pyreon from '@pyreon/vite-plugin'
import content from '@pyreon/zero-content/plugin'
import zero from '@pyreon/zero/server'
import { defineConfig } from 'vite'
import { pyreonSyntaxDark, pyreonSyntaxLight } from './src/styles/pyreon-syntax'
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
// `base` defaults to `/` for local dev; the production GitHub Pages
// deploy passes `--base=/pyreon/` via CLI (the `argvHasBaseFlag`
// carve-out in @pyreon/zero honors this — fixed in PR #1395).
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
    zero({ mode: 'ssg' }),
    lastUpdated({ contentDir: 'src/content/docs' }),
  ],
  server: { port: 5191 },
})
