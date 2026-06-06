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

    // Track which headings are currently above the "active line" (the
    // top fifth of the viewport, BELOW the sticky header). The active
    // heading is the LOWEST one that has scrolled past the line — i.e.
    // the section the user is currently reading.
    //
    // The observer fires when a heading crosses the band edge (entering
    // or leaving the top 0-20% of the viewport). We rebuild the active
    // set by inspecting `boundingClientRect.top` of EVERY watched
    // heading (not just the ones in the callback batch) — the active
    // pick must consider all of them, even ones that didn't fire this
    // tick.
    //
    // Pre-fix the observer used `rootMargin: '-25% 0px -75% 0px'` which
    // creates a ZERO-height observation band (100% - 25% - 75% = 0%).
    // A heading can never be "intersecting" a 0-height band, so
    // `entries.filter(e => e.isIntersecting)` was always empty and
    // `activeSlug` never updated. The fix below uses a real-height
    // band (top 20% of the viewport, with a 64px offset for the
    // sticky header) — but more importantly, drives the active pick
    // from each heading's CURRENT rect rather than the (often empty)
    // intersection list.
    const pickActive = () => {
      // Find the heading whose top is closest to the active line —
      // anywhere from -∞ up to the line counts as "passed". The one
      // with the LARGEST top (closest to but not past the line) wins.
      // If no heading has scrolled past yet (top of page), the first
      // heading is the active fallback.
      const activeLine = 80 // header-height offset
      let best: { id: string; top: number } | null = null
      for (const el of elements) {
        const top = el.getBoundingClientRect().top
        if (top - activeLine < 1) {
          if (best === null || top > best.top) {
            best = { id: el.id, top }
          }
        }
      }
      if (best !== null) {
        activeSlug.set(best.id)
      } else if (elements.length > 0) {
        // Above the first heading — default to first
        activeSlug.set(elements[0]!.id)
      }
    }
    const observer = new IntersectionObserver(pickActive, {
      // Top 20% band (with 64px header inset). Any heading
      // crossing this band fires the callback; the callback then
      // re-evaluates ALL headings to pick the right one.
      rootMargin: '-64px 0px -80% 0px',
      threshold: [0, 1],
    })
    for (const el of elements) observer.observe(el)
    // Also fire on scroll — IntersectionObserver only fires on band
    // CROSSINGS, so a long section where the user scrolls without
    // crossing a heading boundary wouldn't refresh the active pick.
    // `passive: true` keeps the scroll perf identical to no listener.
    const onScroll = () => pickActive()
    window.addEventListener('scroll', onScroll, { passive: true })
    // Initial pick (the observer may not fire immediately if no
    // heading is in the band on first paint).
    pickActive()
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
    }
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
