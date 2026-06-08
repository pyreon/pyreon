// ─── Built-in MDX component names ─────────────────────────────────────────
//
// SINGLE source of truth. Both the MDX validator (`mdx-scan/validate.ts`)
// and the virtual-components renderer (`mdx-scan/scanner.ts`) MUST import
// from here so the two sides can never drift on order / contents.
//
// Pre-fix history (PR-A audit L10): the same list lived as a `const` in
// `mdx-scan/scanner.ts` (order `[Callout, CodeGroup, CodeBlock]`) AND
// as an `export const` in `mdx-scan/validate.ts` (order
// `[Callout, CodeBlock, CodeGroup]`). Two reasonable orderings → silent
// future drift the moment one side adds a new built-in without the
// other. Locked here with a frozen alphabetical canonical order so any
// new built-in lands in ONE place.
export const BUILT_IN_COMPONENTS = Object.freeze([
  'APICard',
  'Callout',
  'CodeBlock',
  'CodeGroup',
  'CompatMatrix',
  // PR-M audit M6+M7+M8 — math, mermaid, details
  'Details',
  // <Example file="./..." share="key"> — Pyreon-native docs DX
  // primitive. Loads + mounts a real `.tsx` file inline (NOT iframe).
  // Cross-Example signal-sharing via a module-level registry — two
  // examples with the same `share` key get the SAME signal instance.
  'Example',
  // PR-F audit H7 — built-in `<Image>` so the emit-jsx layer's
  // local-image rewrite (`![alt](./hero.png)` → `<Image src={import(...)
  // }>`) can auto-import from `virtual:zero-content/components`. Re-
  // exported from `@pyreon/zero` (an existing peer dep).
  'Image',
  'Math',
  'Mermaid',
  'PackageBadge',
  'Playground',
  'PropTable',
  'Tabs',
] as const)

export type BuiltInComponentName = (typeof BUILT_IN_COMPONENTS)[number]
