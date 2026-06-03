import { defineConfig } from 'vitepress'
import { pyreonSyntaxDark, pyreonSyntaxLight } from './theme/pyreon-syntax'

export default defineConfig({
  title: 'Pyreon',
  description: 'A signal-based UI framework with fine-grained reactivity and a rich ecosystem.',

  base: '/pyreon/',
  cleanUrls: true,
  lastUpdated: true,

  // Dark-first (audience lives in dark editors) but the brand handoff
  // ships a paired light theme — so the toggle is enabled and defaults
  // to dark. tokens.css owns the actual light/dark token values.
  appearance: 'dark',

  markdown: {
    // Prevent Vue from interpreting {{ }} inside code blocks
    defaultHighlightLang: 'text',
    // Canonical `pyreon` syntax theme (handoff §3/§6.7). Dual theme —
    // VitePress applies the right one per `.dark` class. Hex lives in
    // ./theme/pyreon-syntax.ts (mirrors tokens.css `--syn-*`).
    theme: { light: pyreonSyntaxLight, dark: pyreonSyntaxDark },
  },

  vue: {
    template: {
      compilerOptions: {
        // Allow custom components
        isCustomElement: () => false,
      },
    },
  },

  head: [
    // FOUC-safe theme sync: tokens.css keys light off `data-theme`, but
    // VitePress toggles `<html class="dark">`. Mirror VitePress's stored
    // appearance onto `data-theme` BEFORE first paint so the correct
    // palette resolves with no flash. Runtime toggle is kept in sync by
    // theme/index.ts. Mirrors VitePress's own appearance logic (default
    // dark when unset, since `appearance: 'dark'`).
    [
      'script',
      {},
      ";(function(){try{var a=localStorage.getItem('vitepress-theme-appearance');var d=!a||a==='dark'||(a==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='dark'}})()",
    ],
    // Brand fonts — Space Grotesk (sans) + JetBrains Mono (mono/accent),
    // exactly the family set + weights from brand handoff §4.
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
      },
    ],
    // Brand favicon — rounded ink tile + ember disc (assets/favicon.svg).
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/pyreon/favicon.svg' }],
    [
      'meta',
      {
        name: 'og:description',
        content:
          'Signal-based UI framework — fine-grained reactivity, no virtual DOM, streaming SSR.',
      },
    ],
    // OG / social card (brand handoff §6.3). Absolute URL — social
    // scrapers don't resolve site-relative paths. Note: this is an SVG;
    // most scrapers render it, but Twitter/Slack prefer raster — a
    // build-time PNG rasterization is a documented follow-up.
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Pyreon — the signal-based UI framework' }],
    [
      'meta',
      { property: 'og:image', content: 'https://pyreon.github.io/pyreon/og.svg' },
    ],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    [
      'meta',
      { name: 'twitter:image', content: 'https://pyreon.github.io/pyreon/og.svg' },
    ],
  ],

  themeConfig: {
    // Primary ON mark — theme-aware: paper glyph on the dark nav, ink
    // glyph on the light nav (the single mono-dark variant was invisible
    // in light mode). VitePress swaps these on its `.dark` class.
    logo: {
      light: '/brand/logo-on-mono-light.svg',
      dark: '/brand/logo-on-mono-dark.svg',
      alt: 'Pyreon',
    },

    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Docs', link: '/docs/', activeMatch: '/docs/' },
      { text: 'GitHub', link: 'https://github.com/pyreon' },
    ],

    sidebar: {
      '/docs/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/docs/' },
            { text: 'Getting Started', link: '/docs/getting-started' },
            { text: 'Reactivity Rules', link: '/docs/reactivity-rules' },
            { text: 'Architecture & prior art', link: '/docs/architecture-and-prior-art' },
            { text: 'Multi-Platform (PMTC)', link: '/docs/multiplatform' },
            { text: 'PMTC Supported TypeScript', link: '/docs/pmtc-supported-typescript' },
          ],
        },
        {
          text: 'Patterns',
          collapsed: false,
          items: [
            { text: 'Dev-mode warnings', link: '/docs/patterns/dev-warnings' },
            { text: 'Signal reads and writes', link: '/docs/patterns/signal-writes' },
            { text: 'Keyed list rendering', link: '/docs/patterns/keyed-lists' },
            { text: 'Reactive context', link: '/docs/patterns/reactive-context' },
            { text: 'SSR-safe hooks', link: '/docs/patterns/ssr-safe-hooks' },
            { text: 'Event listeners', link: '/docs/patterns/event-listeners' },
            { text: 'Controlled / uncontrolled', link: '/docs/patterns/controllable-state' },
            { text: 'Form fields', link: '/docs/patterns/form-fields' },
            { text: 'Dynamic form arrays', link: '/docs/patterns/dynamic-fields' },
            { text: 'Router setup', link: '/docs/patterns/routing-setup' },
            { text: 'Data fetching', link: '/docs/patterns/data-fetching' },
            { text: 'State management', link: '/docs/patterns/state-management' },
            { text: 'Styling & theming', link: '/docs/patterns/styler-theming' },
            { text: 'Imperative toasts', link: '/docs/patterns/imperative-toasts' },
          ],
        },
        {
          text: 'Core Framework',
          collapsed: false,
          items: [
            { text: 'Reactivity', link: '/docs/reactivity' },
            { text: 'Core', link: '/docs/core' },
            { text: 'Compiler', link: '/docs/compiler' },
            { text: 'Runtime DOM', link: '/docs/runtime-dom' },
            { text: 'Runtime Server', link: '/docs/runtime-server' },
            { text: 'Router', link: '/docs/router' },
            { text: 'Head', link: '/docs/head' },
            { text: 'Server', link: '/docs/server' },
            { text: 'Island Architecture', link: '/docs/island-architecture' },
            { text: 'Vite Plugin', link: '/docs/vite-plugin' },
            { text: 'TypeScript', link: '/docs/typescript' },
            { text: 'CLI', link: '/docs/cli' },
            { text: 'Lint', link: '/docs/lint' },
            { text: 'MCP Server', link: '/docs/mcp' },
          ],
        },
        {
          text: 'Compatibility Layers',
          collapsed: false,
          items: [
            { text: 'Native marker contract', link: '/docs/native-compat' },
            { text: 'React Compat', link: '/docs/react-compat' },
            { text: 'Preact Compat', link: '/docs/preact-compat' },
            { text: 'Solid Compat', link: '/docs/solid-compat' },
            { text: 'Svelte Compat', link: '/docs/svelte-compat' },
            { text: 'Vue Compat', link: '/docs/vue-compat' },
          ],
        },
        {
          text: 'State & Data',
          collapsed: false,
          items: [
            { text: 'Store', link: '/docs/store' },
            { text: 'State Tree', link: '/docs/state-tree' },
            { text: 'Form', link: '/docs/form' },
            { text: 'Validation', link: '/docs/validation' },
            { text: 'Validate (Standard Schema DX)', link: '/docs/validate' },
            { text: 'I18n', link: '/docs/i18n' },
            { text: 'Query', link: '/docs/query' },
            { text: 'Table', link: '/docs/table' },
            { text: 'Virtual', link: '/docs/virtual' },
            { text: 'Machine', link: '/docs/machine' },
            { text: 'Storage', link: '/docs/storage' },
            { text: 'Permissions', link: '/docs/permissions' },
            { text: 'Hotkeys', link: '/docs/hotkeys' },
            { text: 'Toast', link: '/docs/toast' },
            { text: 'Rx', link: '/docs/rx' },
            { text: 'URL State', link: '/docs/url-state' },
            { text: 'Drag & Drop', link: '/docs/dnd' },
          ],
        },
        {
          text: 'Meta-Framework',
          collapsed: false,
          items: [
            { text: 'Zero', link: '/docs/zero' },
            { text: 'Zero CLI', link: '/docs/zero-cli' },
            { text: 'SSR & ISR', link: '/docs/ssr' },
            { text: 'SSG', link: '/docs/ssg' },
            { text: 'Create Zero', link: '/docs/create-zero' },
            { text: 'Create Multi-Platform', link: '/docs/create-multiplatform' },
            { text: 'Primitives', link: '/docs/primitives' },
            { text: 'Meta', link: '/docs/meta' },
            { text: 'Storybook', link: '/docs/storybook' },
          ],
        },
        {
          text: 'UI System',
          collapsed: false,
          items: [
            { text: 'UI Core', link: '/docs/ui-core' },
            { text: 'Styler', link: '/docs/styler' },
            { text: 'Unistyle', link: '/docs/unistyle' },
            { text: 'Hooks', link: '/docs/hooks' },
            { text: 'Elements', link: '/docs/elements' },
            { text: 'Attrs', link: '/docs/attrs' },
            { text: 'Rocketstyle', link: '/docs/rocketstyle' },
            { text: 'Coolgrid', link: '/docs/coolgrid' },
            { text: 'Kinetic', link: '/docs/kinetic' },
            { text: 'Kinetic Presets', link: '/docs/kinetic-presets' },
            {
              text: 'Connector Document',
              link: '/docs/connector-document',
            },
            {
              text: 'Document Primitives',
              link: '/docs/document-primitives',
            },
          ],
        },
        {
          text: 'Ecosystem',
          collapsed: false,
          items: [
            { text: 'Document', link: '/docs/document' },
            { text: 'Charts', link: '/docs/charts' },
            { text: 'Code Editor', link: '/docs/code' },
            { text: 'Flow', link: '/docs/flow' },
            { text: 'Feature', link: '/docs/feature' },
          ],
        },
        {
          text: 'Developer Tools',
          collapsed: true,
          items: [
            { text: 'DevTools', link: '/docs/devtools' },
            { text: 'Live Program Inlay Hints', link: '/docs/lpih' },
            { text: 'Sized Map (bounded cache)', link: '/docs/sized-map' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/pyreon' }],

    editLink: {
      pattern: 'https://github.com/pyreon/pyreon/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Pyreon',
    },
  },
})
