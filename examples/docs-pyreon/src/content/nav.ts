/**
 * Sidebar navigation tree — drives both the left rail and the
 * landing-page entry list. Hand-curated so we control the grouping;
 * each page's title is read from the rendered markdown's `meta.title`
 * (via lazy import in the route component).
 *
 * Slugs map onto `[...slug]` route params and to files under
 * `src/content/`.
 */
export interface NavSection {
  title: string
  items: { title: string; href: string; description?: string }[]
}

export const nav: NavSection[] = [
  {
    title: 'Getting started',
    items: [
      {
        title: 'Introduction',
        href: '/',
        description: 'Why we built our own docs platform on top of Pyreon.',
      },
      {
        title: 'Reactivity',
        href: '/docs/reactivity',
        description: 'Signals, computed, effect, batch — the foundation.',
      },
    ],
  },
  {
    title: 'Examples',
    items: [
      {
        title: 'Live playground',
        href: '/docs/reactivity#try-it-yourself',
        description: 'A 30-line counter with an interactive code editor.',
      },
    ],
  },
]

export function findPageTitle(slug: string): string | null {
  for (const sec of nav) for (const it of sec.items) if (it.href === slug || it.href === '/' + slug) return it.title
  return null
}
