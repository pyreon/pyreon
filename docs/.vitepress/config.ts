import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Pyreon',
  description: 'A signal-based UI framework with fine-grained reactivity and a rich ecosystem.',

  cleanUrls: true,
  lastUpdated: true,

  markdown: {
    // Prevent Vue from interpreting {{ }} inside code blocks
    defaultHighlightLang: 'text',
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
    [
      'meta',
      {
        name: 'og:description',
        content:
          'Signal-based UI framework — fine-grained reactivity, no virtual DOM, streaming SSR.',
      },
    ],
  ],

  themeConfig: {
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
            { text: 'React Compat', link: '/docs/react-compat' },
            { text: 'Preact Compat', link: '/docs/preact-compat' },
            { text: 'Solid Compat', link: '/docs/solid-compat' },
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
            { text: 'I18n', link: '/docs/i18n' },
            { text: 'Query', link: '/docs/query' },
            { text: 'Table', link: '/docs/table' },
            { text: 'Virtual', link: '/docs/virtual' },
            { text: 'Machine', link: '/docs/machine' },
            { text: 'Storage', link: '/docs/storage' },
            { text: 'Permissions', link: '/docs/permissions' },
            { text: 'Hotkeys', link: '/docs/hotkeys' },
          ],
        },
        {
          text: 'Meta-Framework',
          collapsed: false,
          items: [
            { text: 'Zero', link: '/docs/zero' },
            { text: 'Create Zero', link: '/docs/create-zero' },
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
          items: [{ text: 'DevTools', link: '/docs/devtools' }],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/pyreon' }],

    editLink: {
      pattern: 'https://github.com/pyreon/docs/edit/main/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Pyreon',
    },
  },
})
