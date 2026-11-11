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
}
