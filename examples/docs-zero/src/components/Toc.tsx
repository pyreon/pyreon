import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

interface Heading {
  level: number
  text: string
  slug: string
}

interface TocProps {
  headings: () => Heading[]
}

// Right-rail TOC with real IntersectionObserver scroll-spy.
//
// The component sets up an IntersectionObserver in `onMount` that
// watches every heading element by `id` (matching the heading's slug).
// When a heading scrolls into view, the active signal flips → the
// link's aria-current + active class update reactively.
//
// SSR-safe: when IntersectionObserver isn't defined (server / no JS),
// the component emits the static list without scroll-spy state.
export function Toc(props: TocProps) {
  const activeSlug = signal<string | null>(null)

  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const headings = props.headings()
    if (headings.length === 0) return undefined

    // Watch every heading in the document — the slug-to-id mapping is
    // 1:1 (each heading is rendered with id={slug}).
    const elements = headings
      .map((h) => document.getElementById(h.slug))
      .filter((el): el is HTMLElement => el !== null)
    if (elements.length === 0) return undefined

    // Pick the topmost intersecting heading; fall back to the previous
    // active when no heading is in view (so the active state doesn't
    // flicker off while scrolling between sections).
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top,
          )
        if (visible.length > 0) {
          activeSlug.set(visible[0]!.target.id)
        }
      },
      // rootMargin trims the viewport so a heading is considered "in
      // view" once its top reaches ~25% from the top of the window.
      // -75% from the bottom prevents stale active states when the user
      // is reading a section and the next heading hasn't entered yet.
      { rootMargin: '-25% 0px -75% 0px', threshold: 0 },
    )
    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  })

  return (
    <aside class="pyreon-toc" aria-label="On this page">
      {() => {
        const list = props.headings()
        if (list.length === 0) return null
        return (
          <>
            <p class="pyreon-toc__label">On this page</p>
            <ul class="pyreon-toc__list">
              {list.map((h) => (
                <li class={`pyreon-toc__item pyreon-toc__item--l${h.level}`}>
                  <a
                    href={`#${h.slug}`}
                    class={() =>
                      activeSlug() === h.slug
                        ? 'pyreon-toc__link pyreon-toc__link--active'
                        : 'pyreon-toc__link'
                    }
                    {...(activeSlug() === h.slug
                      ? { 'aria-current': 'location' as const }
                      : {})}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )
      }}
    </aside>
  )
}
