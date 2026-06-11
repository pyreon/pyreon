import { onMount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'

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
// Mounts after the static SSR markup. The markdown body that contains
// the heading elements with matching `id`s is rendered inside a
// `<Suspense>` boundary that resolves AFTER this component's `onMount`,
// so `document.getElementById(slug)` returns null the first time. We
// retry on `requestAnimationFrame` until the headings appear (up to
// ~2 seconds), then set up the IntersectionObserver + scroll listener
// + DOM-patching effect.
//
// Why a direct DOM-patching effect instead of `class={() => ...}`?
// Empirically the reactive class accessor on links nested inside a
// mapped child accessor doesn't re-fire when `activeSlug.set()` is
// called — the per-link class accessor stays at its initial-evaluation
// value after hydration. Selecting the active link by `href="#<slug>"`
// and toggling the class via `classList` sidesteps the entire reactive-
// prop wiring problem.
//
// SSR-safe: when IntersectionObserver isn't defined (server / no JS),
// the component emits the static list without scroll-spy state.
export function Toc(props: TocProps) {
  const activeSlug = signal<string | null>(null)

  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const headings = props.headings()
    if (headings.length === 0) return undefined

    let cancelled = false
    let cleanupFn: (() => void) | null = null

    const setupScrollSpy = (elements: HTMLElement[]) => {
      // CACHED-TOPS scroll-spy. The naive version read
      // `getBoundingClientRect()` for EVERY heading on every trigger —
      // and the triggers storm (IntersectionObserver fires per heading
      // crossing during initial layout; scroll fires per tick), so page
      // load paid ~N×N forced-layout reads (measured ~10ms/load on
      // /docs/reactivity — the single biggest JS item in the CPU
      // profile, ahead of the framework's whole mount path). Instead:
      // cache each heading's DOCUMENT-relative top (one batched read
      // pass), recompute ONLY on real layout changes (ResizeObserver on
      // the body — Suspense chunks resolving, images loading), and make
      // pickActive pure arithmetic over the cache + window.scrollY:
      // ZERO layout reads on scroll / observer triggers.
      let tops: { id: string; top: number }[] = []
      const recomputeTops = () => {
        const scrollY = window.scrollY
        tops = elements.map((el) => ({
          id: el.id,
          top: el.getBoundingClientRect().top + scrollY,
        }))
      }

      // Find the heading whose top is closest to the active line —
      // anywhere from -∞ up to the line counts as "passed". The one
      // with the LARGEST top (closest to but not past the line) wins.
      // If no heading has scrolled past yet (top of page), fall back
      // to the first heading.
      const pickActive = () => {
        const activeLine = window.scrollY + 80 // header-height offset
        let best: { id: string; top: number } | null = null
        for (const t of tops) {
          if (t.top - activeLine < 1) {
            if (best === null || t.top > best.top) {
              best = t
            }
          }
        }
        if (best !== null) {
          activeSlug.set(best.id)
        } else if (tops.length > 0) {
          activeSlug.set(tops[0]!.id)
        }
      }

      // Pre-fix the observer used `rootMargin: '-25% 0px -75% 0px'`
      // which creates a ZERO-height observation band (100% - 25% - 75%
      // = 0%). A heading can never be "intersecting" a 0-height band,
      // so the observer never fired. The fix below uses a real-height
      // band AND drives the active pick from each heading's current
      // bbox rather than the intersection list — IntersectionObserver
      // only fires on band crossings, not continuously while scrolling.
      //
      // rAF-COALESCED: pickActive reads getBoundingClientRect for EVERY
      // heading, and its raw triggers storm — the observer fires once per
      // heading crossing during initial layout (~N fires on a long page)
      // and the scroll listener fires per scroll tick. Uncoalesced that
      // was N×N forced-layout reads at hydration (measured ~10ms/load on
      // /docs/reactivity — the single biggest JS item in the page-load
      // CPU profile, bigger than the framework's whole mount path) plus
      // per-scroll-event jank. Coalescing to one pickActive per animation
      // frame keeps ONE batched read pass regardless of trigger volume.
      let rafId = 0
      const schedulePick = () => {
        if (rafId !== 0) return
        rafId = requestAnimationFrame(() => {
          rafId = 0
          pickActive()
        })
      }
      const observer = new IntersectionObserver(schedulePick, {
        rootMargin: '-64px 0px -80% 0px',
        threshold: [0, 1],
      })
      for (const el of elements) observer.observe(el)
      const onScroll = () => schedulePick()
      window.addEventListener('scroll', onScroll, { passive: true })
      // Content above a heading changing height (Suspense resolve, image
      // decode, code-block hydration) moves the cached tops. The body
      // RESIZES REPEATEDLY while a page hydrates (each resolving chunk),
      // so recompute is SETTLE-DEBOUNCED: one batched read pass ~150ms
      // after the layout goes quiet, instead of one per resize frame
      // (which re-created the load-time cost the cache exists to kill —
      // measured 1729 vs 47 profile samples, recompute-storm vs pick).
      // Trade-off: the active link can lag a mid-settle layout shift by
      // ≤150ms — invisible next to the shift itself.
      let settleTimer: ReturnType<typeof setTimeout> | null = null
      const resizeObserver = new ResizeObserver(() => {
        if (settleTimer !== null) clearTimeout(settleTimer)
        settleTimer = setTimeout(() => {
          settleTimer = null
          recomputeTops()
          schedulePick()
        }, 150)
      })
      resizeObserver.observe(document.body)
      // Initial pass — synchronous so the first paint carries the right
      // active link (no one-frame flash of no-highlight).
      recomputeTops()
      pickActive()

      // Direct DOM patch instead of relying on `class={() => ...}` on
      // each link (which empirically doesn't re-fire after hydration
      // when nested inside a mapped child accessor).
      const eff = effect(() => {
        const slug = activeSlug()
        const prev = document.querySelector('.pyreon-toc__link--active')
        if (prev !== null && prev.getAttribute('href') !== `#${slug}`) {
          prev.classList.remove('pyreon-toc__link--active')
          prev.removeAttribute('aria-current')
        }
        if (slug !== null) {
          const next = document.querySelector(
            `.pyreon-toc__link[href="#${slug}"]`,
          )
          if (next !== null) {
            next.classList.add('pyreon-toc__link--active')
            next.setAttribute('aria-current', 'location')
          }
        }
      })

      cleanupFn = () => {
        if (rafId !== 0) cancelAnimationFrame(rafId)
        if (settleTimer !== null) clearTimeout(settleTimer)
        observer.disconnect()
        resizeObserver.disconnect()
        window.removeEventListener('scroll', onScroll)
        eff.dispose()
      }
    }

    // Retry-until-DOM-ready loop. The Suspense boundary that contains
    // the heading elements resolves asynchronously. We poll on rAF
    // until at least one heading is in the DOM, then proceed. Bail
    // after ~2 seconds (120 frames @ 60fps) if nothing ever shows —
    // probably a no-headings page where the static fallback is fine.
    let attempts = 0
    const MAX_ATTEMPTS = 120
    const tryFind = () => {
      if (cancelled) return
      const elements = headings
        .map((h) => document.getElementById(h.slug))
        .filter((el): el is HTMLElement => el !== null)
      if (elements.length > 0) {
        setupScrollSpy(elements)
        return
      }
      attempts++
      if (attempts < MAX_ATTEMPTS) {
        requestAnimationFrame(tryFind)
      }
    }
    requestAnimationFrame(tryFind)

    return () => {
      cancelled = true
      cleanupFn?.()
    }
  })

  return (
    <aside
      class="pyreon-toc"
      aria-label="On this page"
      ref={(el: HTMLElement | null) => {
        if (!el) return
        // Mobile collapsible behavior: clicking the label toggles
        // `is-open` on the aside. The CSS at the narrow-viewport
        // media query uses this to animate the list open/closed.
        // Desktop ignores the class (CSS doesn't reference it for
        // wide viewports).
        const label = el.querySelector('.pyreon-toc__label')
        if (label) {
          label.addEventListener('click', () => {
            el.classList.toggle('is-open')
          })
        }
        // Auto-close when a link is clicked (so the TOC doesn't
        // stay open over the section the user jumped to).
        el.addEventListener('click', (e) => {
          const target = e.target as HTMLElement
          if (target.classList?.contains('pyreon-toc__link')) {
            el.classList.remove('is-open')
          }
        })
      }}
    >
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
                    class="pyreon-toc__link"
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
