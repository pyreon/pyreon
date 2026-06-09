// Originally ported from the legacy VitePress site's
// `sidebar: { '/docs/': [...] }` config (now removed in the cutover).
//
// Single source of truth for the docs nav. The runtime `<Sidebar>`
// reads this directly so the order + grouping is explicit. Adding a
// new collection entry without updating this file just means the page
// exists but isn't linked from the sidebar (a follow-up doctor check
// could lint this).

export interface SidebarLink {
  text: string
  slug: string
}

export interface SidebarGroup {
  text: string
  collapsed?: boolean
  items: SidebarLink[]
}

export const SIDEBAR: SidebarGroup[] = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Overview', slug: '' },
      { text: 'Getting Started', slug: 'getting-started' },
      { text: 'Live examples (new DX)', slug: 'example-dx' },
      { text: 'Reactivity Rules', slug: 'reactivity-rules' },
      { text: 'Architecture & prior art', slug: 'architecture-and-prior-art' },
      { text: 'Multi-Platform (PMTC)', slug: 'multiplatform' },
      { text: 'PMTC Library Status & Authoring', slug: 'multiplatform-libraries' },
      { text: 'PMTC Supported TypeScript', slug: 'pmtc-supported-typescript' },
      { text: 'PMTC Per-Target Setup', slug: 'pmtc-per-target-setup' },
    ],
  },
  {
    text: 'Patterns',
    collapsed: false,
    items: [
      { text: 'Dev-mode warnings', slug: 'patterns/dev-warnings' },
      { text: 'Signal reads and writes', slug: 'patterns/signal-writes' },
      { text: 'Keyed list rendering', slug: 'patterns/keyed-lists' },
      { text: 'Reactive context', slug: 'patterns/reactive-context' },
      { text: 'SSR-safe hooks', slug: 'patterns/ssr-safe-hooks' },
      { text: 'Event listeners', slug: 'patterns/event-listeners' },
      { text: 'Controlled / uncontrolled', slug: 'patterns/controllable-state' },
      { text: 'Form fields', slug: 'patterns/form-fields' },
      { text: 'Dynamic form arrays', slug: 'patterns/dynamic-fields' },
      { text: 'Router setup', slug: 'patterns/routing-setup' },
      { text: 'Data fetching', slug: 'patterns/data-fetching' },
      { text: 'State management', slug: 'patterns/state-management' },
      { text: 'Styling & theming', slug: 'patterns/styler-theming' },
      { text: 'Imperative toasts', slug: 'patterns/imperative-toasts' },
      { text: 'Islands', slug: 'patterns/islands' },
      { text: 'Reactive spread', slug: 'patterns/reactive-spread' },
    ],
  },
  {
    text: 'Core Framework',
    collapsed: false,
    items: [
      { text: 'Reactivity', slug: 'reactivity' },
      { text: 'Core', slug: 'core' },
      { text: 'Compiler', slug: 'compiler' },
      { text: 'Runtime DOM', slug: 'runtime-dom' },
      { text: 'Runtime Server', slug: 'runtime-server' },
      { text: 'Router', slug: 'router' },
      { text: 'Head', slug: 'head' },
      { text: 'Server', slug: 'server' },
      { text: 'Island Architecture', slug: 'island-architecture' },
      { text: 'Vite Plugin', slug: 'vite-plugin' },
      { text: 'TypeScript', slug: 'typescript' },
      { text: 'CLI', slug: 'cli' },
      { text: 'Lint', slug: 'lint' },
      { text: 'MCP Server', slug: 'mcp' },
    ],
  },
  {
    text: 'Compatibility Layers',
    collapsed: false,
    items: [
      { text: 'Native marker contract', slug: 'native-compat' },
      { text: 'React Compat', slug: 'react-compat' },
      { text: 'Preact Compat', slug: 'preact-compat' },
      { text: 'Solid Compat', slug: 'solid-compat' },
      { text: 'Svelte Compat', slug: 'svelte-compat' },
      { text: 'Vue Compat', slug: 'vue-compat' },
    ],
  },
  {
    text: 'State & Data',
    collapsed: false,
    items: [
      { text: 'Store', slug: 'store' },
      { text: 'State Tree', slug: 'state-tree' },
      { text: 'Form', slug: 'form' },
      { text: 'Validation', slug: 'validation' },
      { text: 'Validate (Standard Schema DX)', slug: 'validate' },
      { text: 'I18n', slug: 'i18n' },
      { text: 'Query', slug: 'query' },
      { text: 'Table', slug: 'table' },
      { text: 'Virtual', slug: 'virtual' },
      { text: 'Machine', slug: 'machine' },
      { text: 'Storage', slug: 'storage' },
      { text: 'Permissions', slug: 'permissions' },
      { text: 'Hotkeys', slug: 'hotkeys' },
      { text: 'Toast', slug: 'toast' },
      { text: 'Rx', slug: 'rx' },
      { text: 'URL State', slug: 'url-state' },
      { text: 'Drag & Drop', slug: 'dnd' },
    ],
  },
  {
    text: 'Meta-Framework',
    collapsed: false,
    items: [
      { text: 'Zero', slug: 'zero' },
      { text: 'Zero Content (markdown)', slug: 'zero-content' },
      { text: 'Zero CLI', slug: 'zero-cli' },
      { text: 'SSR & ISR', slug: 'ssr' },
      { text: 'SSG', slug: 'ssg' },
      { text: 'Images & Fonts', slug: 'images-and-fonts' },
      { text: 'Create Zero', slug: 'create-zero' },
      { text: 'Create Multi-Platform', slug: 'create-multiplatform' },
      { text: 'Primitives', slug: 'primitives' },
      { text: 'Meta', slug: 'meta' },
      { text: 'Storybook', slug: 'storybook' },
    ],
  },
  {
    text: 'UI System',
    collapsed: false,
    items: [
      { text: 'UI Core', slug: 'ui-core' },
      { text: 'Styler', slug: 'styler' },
      { text: 'Unistyle', slug: 'unistyle' },
      { text: 'Hooks', slug: 'hooks' },
      { text: 'Elements', slug: 'elements' },
      { text: 'Attrs', slug: 'attrs' },
      { text: 'Rocketstyle', slug: 'rocketstyle' },
      { text: 'Coolgrid', slug: 'coolgrid' },
      { text: 'Kinetic', slug: 'kinetic' },
      { text: 'Kinetic Presets', slug: 'kinetic-presets' },
      { text: 'Connector Document', slug: 'connector-document' },
      { text: 'Document Primitives', slug: 'document-primitives' },
    ],
  },
  {
    text: 'Ecosystem',
    collapsed: false,
    items: [
      { text: 'Document', slug: 'document' },
      { text: 'Charts', slug: 'charts' },
      { text: 'Code Editor', slug: 'code' },
      { text: 'Flow', slug: 'flow' },
      { text: 'Feature', slug: 'feature' },
    ],
  },
  {
    text: 'Developer Tools',
    collapsed: true,
    items: [
      { text: 'DevTools', slug: 'devtools' },
      { text: 'Live Program Inlay Hints', slug: 'lpih' },
      { text: 'Sized Map (bounded cache)', slug: 'sized-map' },
    ],
  },
]
