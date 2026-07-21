// Single source of truth for the docs nav. The runtime `<Sidebar>` reads
// this directly so the order + grouping is explicit.
//
// IA model (Diátaxis): groups carry an optional `tier` so the sidebar
// expresses a learning JOURNEY, not a package index. A tier header is
// rendered once above the first group of each tier:
//
//   Learn    → learning-oriented (Tutorial): start here, zero→app
//   Guides   → task-oriented (How-to): "how do I do X"
//   Migrate  → coming from another framework
//   Reference→ information-oriented: per-package API reference
//
// (Recipes / Examples / Troubleshooting / Concepts tiers are introduced by
// later docs-overhaul stages as their content lands.) Slugs are unchanged
// from the package-centric layout — this is a pure re-grouping, so no URL
// moves and no redirects are needed.

import { REFERENCE_GROUPS } from './reference-nav.generated'
import { TROUBLESHOOTING_GROUPS } from './troubleshooting-nav.generated'

export interface SidebarLink {
  text: string
  slug: string
}

export interface SidebarGroup {
  text: string
  collapsed?: boolean
  /**
   * Diátaxis tier this group belongs to. The renderer prints the tier
   * label once, above the first group that carries it. Omit to attach a
   * group to the current (previous) tier.
   */
  tier?: string
  items: SidebarLink[]
}

export const SIDEBAR: SidebarGroup[] = [
  // ─── LEARN (learning-oriented) ──────────────────────────────────────────
  {
    text: 'Get Started',
    tier: 'Learn',
    items: [
      { text: 'Overview', slug: '' },
      { text: 'Why Pyreon', slug: 'why-pyreon' },
      { text: 'Quickstart', slug: 'quickstart' },
      { text: 'Getting Started', slug: 'getting-started' },
      { text: 'Build an App (Tutorial)', slug: 'build-an-app' },
      { text: 'Examples Gallery', slug: 'examples' },
      { text: 'Recipes', slug: 'recipes' },
      { text: 'Reactivity Rules', slug: 'reactivity-rules' },
      { text: 'Architecture & prior art', slug: 'architecture-and-prior-art' },
      { text: 'Benchmarks', slug: 'benchmarks' },
    ],
  },
  {
    // Guided concept-by-concept track (the gentle on-ramp before building a
    // full app). Sequenced with prev/next links; attaches to the Learn tier.
    text: 'Tutorial',
    collapsed: false,
    items: [
      { text: '1. Signals', slug: 'tutorial/01-signals' },
      { text: '2. Derived values', slug: 'tutorial/02-derived' },
      { text: '3. Side effects', slug: 'tutorial/03-effects' },
      { text: '4. Components run once', slug: 'tutorial/04-components' },
      { text: '5. Lists & conditionals', slug: 'tutorial/05-lists-and-conditionals' },
      { text: '6. Build something real', slug: 'tutorial/06-build-something' },
    ],
  },

  // ─── GUIDES (task-oriented how-tos) ─────────────────────────────────────
  {
    text: 'Guides',
    tier: 'Guides',
    collapsed: false,
    items: [
      // reactivity & rendering
      { text: 'Signal reads and writes', slug: 'patterns/signal-writes' },
      { text: 'Keyed list rendering', slug: 'patterns/keyed-lists' },
      { text: 'Reactive context', slug: 'patterns/reactive-context' },
      { text: 'Reactive spread', slug: 'patterns/reactive-spread' },
      { text: 'Dev-mode warnings', slug: 'patterns/dev-warnings' },
      // state
      { text: 'State management', slug: 'patterns/state-management' },
      { text: 'Controlled / uncontrolled', slug: 'patterns/controllable-state' },
      // forms
      { text: 'Form fields', slug: 'patterns/form-fields' },
      { text: 'Dynamic form arrays', slug: 'patterns/dynamic-fields' },
      // routing & data
      { text: 'Router setup', slug: 'patterns/routing-setup' },
      { text: 'Data fetching', slug: 'patterns/data-fetching' },
      // styling
      { text: 'Styling & theming', slug: 'patterns/styler-theming' },
      // SSR / islands
      { text: 'SSR-safe hooks', slug: 'patterns/ssr-safe-hooks' },
      { text: 'Islands', slug: 'patterns/islands' },
      // DOM & UI
      { text: 'Event listeners', slug: 'patterns/event-listeners' },
      { text: 'Imperative toasts', slug: 'patterns/imperative-toasts' },
      { text: 'Multi-platform shared code', slug: 'patterns/multiplatform' },
      // accessibility
      { text: 'Accessibility', slug: 'accessibility' },
    ],
  },
  {
    // In-depth, task-oriented how-to guides (one concern each, grounded in
    // the real package source). Attaches to the Guides tier (no `tier`).
    text: 'In-Depth Guides',
    collapsed: false,
    items: [
      { text: 'Reactivity in Depth', slug: 'guides/reactivity-in-depth' },
      { text: 'Data Fetching & Caching', slug: 'guides/data-fetching' },
      { text: 'Client-Side Routing', slug: 'guides/routing' },
      { text: 'Forms & Validation', slug: 'guides/forms' },
      { text: 'Global State Management', slug: 'guides/state-management' },
      { text: 'Styling & Theming', slug: 'guides/styling-theming' },
      { text: 'Animations & Transitions', slug: 'guides/animations' },
      { text: 'Localizing the UI System', slug: 'guides/ui-localization' },
      { text: 'SSR, SSG & ISR', slug: 'guides/ssr-ssg-isr' },
      { text: 'Islands & Partial Hydration', slug: 'guides/islands' },
      { text: 'Performance', slug: 'guides/performance' },
      { text: 'Testing Pyreon Apps', slug: 'guides/testing' },
      { text: 'Deploying a Pyreon App', slug: 'guides/deployment' },
    ],
  },

  // ─── MIGRATE ────────────────────────────────────────────────────────────
  {
    text: 'Migrating to Pyreon',
    tier: 'Migrate',
    items: [
      { text: 'Coming from React', slug: 'migrating-from-react' },
      { text: 'Coming from Solid', slug: 'migrating-from-solid' },
      { text: 'Coming from Vue', slug: 'migrating-from-vue' },
      { text: 'Coming from Svelte', slug: 'migrating-from-svelte' },
      { text: 'Coming from Angular', slug: 'migrating-from-angular' },
    ],
  },

  // ─── REFERENCE (information-oriented, per package) ──────────────────────
  {
    text: 'Core Framework',
    tier: 'Reference',
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
    text: 'Meta-Framework (Zero)',
    collapsed: false,
    items: [
      { text: 'Zero', slug: 'zero' },
      { text: 'SSR & ISR', slug: 'ssr' },
      { text: 'SSG', slug: 'ssg' },
      { text: 'Images & Fonts', slug: 'images-and-fonts' },
      { text: 'Create Zero', slug: 'create-zero' },
      { text: 'Zero CLI', slug: 'zero-cli' },
      { text: 'Zero Content (markdown)', slug: 'zero-content' },
      { text: 'Live Examples (<Example>)', slug: 'live-examples' },
      { text: 'Meta', slug: 'meta' },
      { text: 'Storybook', slug: 'storybook' },
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
      { text: 'Sync (local-first / CRDT)', slug: 'sync' },
      { text: 'Permissions', slug: 'permissions' },
      { text: 'Hotkeys', slug: 'hotkeys' },
      { text: 'Toast', slug: 'toast' },
      { text: 'Rx', slug: 'rx' },
      { text: 'URL State', slug: 'url-state' },
      { text: 'Drag & Drop', slug: 'dnd' },
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
      { text: 'Rich Text', slug: 'rich-text' },
      { text: 'Flow', slug: 'flow' },
      { text: 'Feature', slug: 'feature' },
      { text: 'Accessibility (a11y)', slug: 'a11y' },
    ],
  },
  {
    text: 'Compatibility Layers',
    collapsed: true,
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
    text: 'Developer Tools',
    collapsed: true,
    items: [
      { text: 'DevTools', slug: 'devtools' },
      { text: 'Reactivity Lens', slug: 'reactivity-lens' },
      { text: 'Live Program Inlay Hints', slug: 'lpih' },
      { text: 'Sized Map (bounded cache)', slug: 'sized-map' },
    ],
  },
  {
    // Experimental — the PMTC multi-target compiler (TSX → SwiftUI / Compose)
    // is demo-quality, not production-ready. Kept discoverable but collapsed
    // and last so it stays out of the newcomer onboarding path.
    text: 'Multi-Platform (experimental)',
    collapsed: true,
    items: [
      { text: 'Multi-Platform (PMTC)', slug: 'multiplatform' },
      { text: 'PMTC Library Status & Authoring', slug: 'multiplatform-libraries' },
      { text: 'PMTC Supported TypeScript', slug: 'pmtc-supported-typescript' },
      { text: 'PMTC Per-Target Setup', slug: 'pmtc-per-target-setup' },
      { text: 'Create Multi-Platform', slug: 'create-multiplatform' },
      { text: 'Primitives', slug: 'primitives' },
    ],
  },

  // ─── API REFERENCE (generated per-package from src/manifest.ts) ─────────
  // Emitted by docs/scripts/gen-reference.ts. Opens its own tier.
  ...REFERENCE_GROUPS,

  // ─── TROUBLESHOOTING (generated from anti-patterns.md) ──────────────────
  // Emitted by docs/scripts/gen-troubleshooting.ts. Opens its own tier.
  ...TROUBLESHOOTING_GROUPS,
]
