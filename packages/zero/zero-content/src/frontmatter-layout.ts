// ─── Per-page layout helper (PR-I audit M11) ──────────────────────────────
//
// Lets `.md` frontmatter pin an alternate layout for a single page
// without rewriting the route. The convention:
//
//     ---
//     title: Special Page
//     layout: landing
//     ---
//
// Means "render this page wrapped by the `landing` layout instead of
// the default route layout". The route consults `resolvePageLayout`
// against a registry the user supplies (typically auto-built from
// `src/layouts/*.tsx`); a missing layout name falls back to the
// default layout with a console warning so authors get feedback.
//
// Pure / runtime-agnostic — no DOM / Vite imports. Callable from SSR,
// CSR, and tests alike.

import type { ComponentFn, VNodeChild } from '@pyreon/core'

/** Layout-shape contract. Layouts wrap the rendered page content. */
export type ContentLayout = ComponentFn<{ children: VNodeChild }>

/** Layout registry — name → component map. Typically populated by the
 *  user via `import.meta.glob('./layouts/*.tsx', { eager: true })`
 *  + name-from-filename derivation. */
export type ContentLayoutRegistry = Record<string, ContentLayout>

export interface ResolvedPageLayout {
  /** The layout component to render. Always set — falls back to
   *  `defaultLayout` when the frontmatter name doesn't match a
   *  registry entry. */
  layout: ContentLayout
  /** Whether the resolution fell back to the default. `true` means the
   *  frontmatter named a layout that wasn't in the registry. */
  fellBack: boolean
  /** The requested layout name when fallback occurred, for diagnostics. */
  missingName?: string
}

export interface ResolvePageLayoutArgs {
  /** Frontmatter object from the compiled `.md` module. */
  frontmatter: Record<string, unknown>
  /** Layout registry — the user's `src/layouts/*` map. */
  registry: ContentLayoutRegistry
  /** Default layout, used when frontmatter has no `layout` field OR
   *  the named layout isn't in the registry. */
  defaultLayout: ContentLayout
}

/**
 * Resolve the layout component for a page given its frontmatter +
 * a layout registry. Pure — exported for testing.
 */
export function resolvePageLayout(
  args: ResolvePageLayoutArgs,
): ResolvedPageLayout {
  const requested = args.frontmatter['layout']
  if (typeof requested !== 'string' || requested.length === 0) {
    return { layout: args.defaultLayout, fellBack: false }
  }
  const hit = args.registry[requested]
  if (hit) {
    return { layout: hit, fellBack: false }
  }
  return {
    layout: args.defaultLayout,
    fellBack: true,
    missingName: requested,
  }
}
