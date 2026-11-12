import type { ExtraSection } from './model'

/**
 * Typed versions of the content files' reference-only `extraSectionsHtml`,
 * kept beside the content set (not in the JSON) so a re-sync of the JSON
 * never drops them. The product template renders `data.extraSections` when a
 * file carries it, else the entry here. Add an id when its page is wired.
 */
export const EXTRA_SECTIONS: Readonly<Record<string, readonly ExtraSection[]>> = {
  reactivity: [
    {
      kind: 'packages',
      label: 'the engine underneath',
      title: 'What turns signals into pixels.',
      cols: 3,
      items: [
        { pkg: '@pyreon/core', role: 'components', text: 'JSX, components, context, For, Show and lifecycle.' },
        { pkg: '@pyreon/compiler', role: 'compiler', text: 'Decides at build time which expressions are live.' },
        { pkg: '@pyreon/runtime-dom', role: 'browser', text: 'Fine-grained DOM updates and hydration.' },
        { pkg: '@pyreon/runtime-server', role: 'server', text: 'Streaming SSR to strings and streams.' },
        { pkg: '@pyreon/sized-map', role: 'internals', text: 'A bounded cache used across the engine.' },
      ],
    },
  ],
  zero: [
    {
      kind: 'packages',
      label: 'also in the box',
      title: 'The pieces Zero is made of.',
      cols: 3,
      items: [
        { pkg: '@pyreon/head', role: 'metadata', text: 'Title, meta and link tags from any component, SSR-ready.' },
        { pkg: '@pyreon/server', role: 'server', text: 'The SSR handler, SSG prerendering and islands underneath Zero.' },
        { pkg: '@pyreon/zero-content', role: 'content', text: 'Markdown and MDX collections.', link: { label: 'See Content →', href: '/products/content' } },
        { pkg: '@pyreon/create-zero', role: 'scaffold', text: 'npm create @pyreon/zero@latest gets you a running app.' },
        { pkg: '@pyreon/meta', role: 'all-in-one', text: 'One import for the whole fundamentals ecosystem.' },
        { pkg: '@pyreon/zero-cli', role: 'cli', text: 'Dev, build and preview commands.' },
      ],
    },
  ],
  native: [
    {
      kind: 'steps',
      label: 'how it ships',
      title: 'Three steps from TSX to the App Store build.',
      items: [
        { title: 'You write TSX', text: 'Primitives, signals and the Pyreon packages you already use on the web. One `src/App.tsx`.' },
        { title: 'PMTC compiles it', text: "At build time the compiler emits Swift for iOS and Kotlin for Android. A construct it can't lower almost always gets a named warning, in milliseconds." },
        { title: 'Xcode and Gradle build it', text: 'The generated source links against small Swift and Kotlin runtimes. What lands on the phone is a SwiftUI or Compose app. No JavaScript engine draws its screens.' },
      ],
      visual: 'pipeline',
    },
    {
      kind: 'packages',
      label: 'runs on native today',
      title: 'The parts of your app that come along.',
      text: 'Anything bound to the DOM (a code editor, a rich-text editor) stays on the web, or runs inside a WebView with a two-way data bridge.',
      items: [
        { pkg: '@pyreon/primitives', role: 'UI', text: 'The canonical primitives (22 in the next release) → SwiftUI and Compose views.' },
        { pkg: '@pyreon/reactivity', role: 'state', text: 'signal, computed and effect → platform state.' },
        { pkg: '@pyreon/router', role: 'navigation', text: 'Nested routes, guards, loaders and inbound deep links.' },
        { pkg: '@pyreon/form', role: 'forms', text: 'Validated forms, proven on device.' },
        { pkg: '@pyreon/store · state-tree · machine', role: 'state', text: 'Stores, models and state machines.' },
        { pkg: '@pyreon/i18n · permissions', role: 'app logic', text: 'Translations and access rules.' },
        { pkg: '@pyreon/storage', role: 'persistence', text: "Persisted signals on the platform's own storage, on iOS and Android." },
        { pkg: '@pyreon/charts', role: 'charts', text: 'Every chart family, drawn natively.' },
        { pkg: '@pyreon/hooks', role: 'device', text: 'useClipboard, useColorScheme, useFetch, useOnline and more.' },
        { pkg: '@pyreon/toast', role: 'feedback', text: 'A native overlay over the same toast() queue.' },
        { pkg: '@pyreon/rx', role: 'data', text: 'Collection transforms lower to native operations.' },
        { pkg: 'Design System', role: 'styling', text: 'styled(), rocketstyle, Element and coolgrid patterns lower too.' },
      ],
    },
    {
      kind: 'stats',
      label: 'the dev loop',
      title: 'Fast enough to stay in flow.',
      text: 'Measured on an Apple-silicon Mac with the iOS 18.5 simulator and the scaffolded app. `pyreon-native check --watch` answers "will this run on the device?" without opening Xcode.',
      stats: [
        { value: '1–9 ms', label: 'compile the shared source' },
        { value: '≈ 3 s', label: 'edit, rebuild, reinstall, relaunch' },
        { value: '≈ 31 s', label: 'first run, from nothing to a running simulator' },
        { value: '0 s', label: 'comment-only edits skip the native build' },
      ],
    },
    {
      kind: 'packages',
      label: 'under the hood',
      title: 'Six packages, all on npm.',
      text: 'The runtimes ship as Swift and Kotlin source through npm, so the Pyreon side of your native targets resolves from the same lockfile as the web app. `npm create @pyreon/multiplatform@latest` wires it all up.',
      cols: 3,
      items: [
        { pkg: '@pyreon/native-compiler', role: 'TypeScript', text: 'PMTC itself: TSX in, SwiftUI and Compose out.' },
        { pkg: '@pyreon/native-cli', role: 'TypeScript', text: 'The pyreon-native binary: build, check, dev, assets, wire.' },
        { pkg: '@pyreon/native-runtime-swift', role: 'Swift', text: 'Core iOS runtime: tokens, HTTP, JSON, charts engine.' },
        { pkg: '@pyreon/native-runtime-kotlin', role: 'Kotlin', text: 'The Android twin, plus storage backends.' },
        { pkg: '@pyreon/native-router-swift', role: 'Swift', text: 'The router API on NavigationStack.' },
        { pkg: '@pyreon/native-router-kotlin', role: 'Kotlin', text: 'The router API on Compose state.' },
      ],
    },
  ],
  primitives: [
    {
      kind: 'callout',
      label: 'pairs with',
      title: 'Design System',
      text: 'Primitives keep a small, fixed token scale so every target agrees on the numbers. When you want your own look, wrap them: `styled(Stack)` and rocketstyle chains over a primitive lower to SwiftUI and Compose as well. Web-only apps that need breakpoints and theme-aware CSS use the Design System\'s elements directly.',
      links: [
        { label: 'Explore the Design System →', href: '/products/design', solid: true },
        { label: 'How one codebase ships three apps', href: '/products/native' },
      ],
    },
  ],
  design: [
    {
      kind: 'packages',
      label: 'inside the design system',
      title: 'Eleven packages, one system.',
      text: 'Use the whole thing through your components, or take only the layer you need: styler works on its own.',
      items: [
        { pkg: '@pyreon/rocketstyle', role: 'dimensions', text: 'States, sizes, variants and your own axes as typed props.' },
        { pkg: '@pyreon/styler', role: 'CSS-in-JS', text: 'styled, css, keyframes and global styles, deduplicated and SSR-safe.' },
        { pkg: '@pyreon/unistyle', role: 'responsive engine', text: 'Breakpoints, responsive values and themes as CSS variables.' },
        { pkg: '@pyreon/attrs', role: 'composition', text: 'Chainable default props; call-site props always win.' },
        { pkg: '@pyreon/elements', role: 'layout', text: 'Element, Text, List, Overlay and Portal.' },
        { pkg: '@pyreon/coolgrid', role: 'grid', text: 'Container, Row and Col with your own columns and breakpoints.' },
        { pkg: '@pyreon/ui-core', role: 'provider', text: 'PyreonUI: theme and light, dark or system mode in one component.' },
        { pkg: '@pyreon/kinetic', role: 'motion', text: 'Enter, leave, collapse, stagger and keyed-list animation on CSS transitions.', link: { label: 'See Motion →', href: '/products/kinetic' } },
        { pkg: '@pyreon/kinetic-presets', role: 'motion', text: '122 ready-made animations, imported one by one.' },
        { pkg: '@pyreon/document-primitives', role: 'documents', text: '18 document components (DocPage, DocTable, DocText…) themed like the rest of your UI.' },
        { pkg: '@pyreon/connector-document', role: 'documents', text: 'The bridge from ui-system components to the @pyreon/document export pipeline.' },
      ],
    },
  ],
  validation: [
    {
      kind: 'packages',
      label: 'which package do I need?',
      title: 'One product, two packages.',
      text: 'Validation ships as two npm packages with similar names. Most apps install only the first.',
      cols: 2,
      items: [
        {
          pkg: '@pyreon/validate',
          role: 'install this',
          hot: true,
          command: 'bun add @pyreon/validate',
          text: 'The validator you write schemas with: `s.object`, `s.string().email()` and the rest. Plus helpers for labels, translated errors and live validation that also work on Zod, Valibot and ArkType schemas.',
        },
        {
          pkg: '@pyreon/validation',
          role: 'comes with forms and stores',
          text: "The plumbing. Forms, Store and State-tree use it to accept any schema, and it's installed with them. You only import it yourself for its typed Zod, Valibot or ArkType adapters.",
        },
      ],
    },
  ],
}
