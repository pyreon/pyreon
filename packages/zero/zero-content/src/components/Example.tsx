import { h, onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import {
  loadExampleComponent,
  resolveExample,
} from './example-registry'
import { getOrCreateSharedSignal } from './shared-signal-registry'

// ─── <Example> — load a real `.tsx` file inline (NOT iframe) ─────────
//
// The Pyreon-native replacement for `<Playground code={`...`} />`. Every
// example lives as a real source file in the consumer's repo. The
// component loads + mounts it inline so it shares the host page's
// signal graph, runtime, and CSS context. No iframe, no srcdoc, no
// escape passes, no SyntaxError when the user types a backslash.
//
// Authoring contract (consumer side):
//
//   examples/counter.tsx — a real Pyreon component file
//
//     import { signal, type Signal } from '@pyreon/reactivity'
//
//     export default function Counter(props: { shared?: Signal<number> }) {
//       const count = props.shared ?? signal(0)
//       return (
//         <div>
//           <button onClick={() => count.update(n => n + 1)}>+</button>
//           <span>{() => count()}</span>
//         </div>
//       )
//     }
//
// Then in markdown:
//
//   <Example file="./examples/counter" />
//
// And the consumer registers the glob at startup:
//
//   import { registerExamples } from '@pyreon/zero-content'
//   registerExamples(import.meta.glob('./examples/⁎⁎/⁎.tsx'))
//
// Signal-bridged demos:
//
//   <Example file="./examples/counter-button" share="cnt" />
//   <Example file="./examples/counter-readout" share="cnt" />
//
// Both examples receive the SAME `shared` signal (key="cnt"), so a
// click in the button example reactively updates the readout
// example. This pattern is the unique Pyreon DX win — no other docs
// framework's mount model lets two demos on the same page share live
// reactive state without iframe boundaries.

export interface ExampleProps {
  /**
   * Path key into the registered example glob. Extension is
   * optional — `./examples/counter` resolves to
   * `./examples/counter.tsx` (or `.ts`/`.jsx`/`.js` fallbacks) in
   * the glob.
   */
  file: string

  /**
   * Optional shared-signal key. Two `<Example>` elements with the
   * same `share` value get the SAME signal instance via the
   * shared-signal registry — interactions in one reactively flow to
   * the other.
   */
  share?: string

  /**
   * Initial value for a NEW shared signal (only used on the first
   * `<Example>` to register `share`; subsequent registrations are
   * no-ops). Default `0`.
   *
   * Typed as `unknown` because the registry is heterogeneous; the
   * example's own component asserts the actual type via its
   * `shared?: Signal<T>` prop.
   */
  shareInitial?: unknown

  /**
   * Optional className applied to the outer wrapper. Defaults to
   * `pyreon-example` only.
   */
  class?: string

  /**
   * Optional title shown above the rendered example. Useful when an
   * example needs context that doesn't belong in the markdown
   * prose.
   */
  title?: string
}

/**
 * The Example component. Renders a wrapper that mounts the resolved
 * example component once it's loaded.
 *
 * Loading is async (dynamic import) AND lazy: the example's chunk is
 * imported + mounted only when its wrapper nears the viewport
 * (IntersectionObserver, 400px rootMargin), so a page with many
 * `<Example>`s (the docs gallery has 40+) doesn't fire every chunk load
 * + mount on hydration — which otherwise streams content in
 * progressively and pushes LCP out. Above-the-fold examples (already
 * intersecting) load immediately; the rest load just before they scroll
 * into view, so there's no perceptible delay. During the load window the
 * wrapper shows a thin (a11y-hidden) loading placeholder. Eager fallback
 * when IntersectionObserver is unavailable.
 */
export function Example(props: ExampleProps): VNodeChild {
  // Loaded component — null until the dynamic import resolves.
  const Loaded = signal<ComponentFn | null>(null)
  // Error state — non-null if resolution OR load failed.
  const error = signal<string | null>(null)

  // Resolve the shared signal at SETUP (not inside the reactive
  // child accessor). If share is set, get or create it now; pass to
  // the loaded component on every render.
  let sharedSig: Signal<unknown> | undefined
  if (props.share !== undefined) {
    sharedSig = getOrCreateSharedSignal(props.share, props.shareInitial ?? 0)
  }

  // The wrapper element, captured via ref so onMount can observe it for
  // viewport proximity (lazy-mount).
  let rootEl: Element | null = null

  // Resolve + dynamically import the example chunk, then mount it. Called
  // once, either immediately (eager fallback) or when the wrapper nears
  // the viewport (lazy path).
  const beginLoad = (): void => {
    const loader = resolveExample(props.file)
    if (loader === null) {
      error.set(
        `Example "${props.file}" not found in the registered glob. ` +
          `Did you call registerExamples(import.meta.glob('./examples/**/*.tsx')) at app startup?`,
      )
      return
    }
    void loadExampleComponent(loader).then((Comp) => {
      if (Comp === null) {
        error.set(
          `Example "${props.file}" loaded but has no default export ` +
            `(or the default isn't a function). Examples must ` +
            `\`export default function MyExample(props) { ... }\`.`,
        )
        return
      }
      Loaded.set(Comp)
    })
  }

  onMount(() => {
    // Lazy-mount: defer each example's dynamic import until its wrapper is
    // near the viewport. A docs page with many <Example>s (the gallery has
    // 40+) otherwise fires every chunk load + component mount on hydration,
    // streaming content in progressively and pushing LCP out. With a
    // generous rootMargin the example is loaded just before it scrolls into
    // view, so there's no perceptible loading delay, while above-the-fold
    // examples (already intersecting at observe time) load immediately.
    //
    // Eager fallback when IntersectionObserver is unavailable (older
    // runtimes / SSR-ish environments) or the wrapper wasn't captured —
    // never leave an example unmounted.
    if (typeof IntersectionObserver === 'undefined' || rootEl === null) {
      beginLoad()
      return undefined
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          beginLoad()
        }
      },
      { rootMargin: '400px 0px' },
    )
    io.observe(rootEl)
    return () => io.disconnect()
  })

  return h(
    'div',
    {
      class: props.class ?? 'pyreon-example',
      ref: (el: Element | null) => {
        rootEl = el
      },
    },
    props.title !== undefined
      ? h(
          'div',
          { class: 'pyreon-example__title' },
          props.title,
        )
      : null,
    h(
      'div',
      { class: 'pyreon-example__surface' },
      () => {
        const err = error()
        if (err !== null) {
          return h(
            'pre',
            { class: 'pyreon-example__error', role: 'alert' },
            err,
          )
        }
        const Comp = Loaded()
        if (Comp === null) {
          // Decorative shimmer skeleton — hidden from the a11y tree.
          // `aria-hidden` (a global state, valid on any element) keeps it
          // out of the tree entirely; the real example replaces it once
          // loaded. A bare `aria-label` on this roleless <div> would be a
          // prohibited-ARIA violation, and with lazy-mount many skeletons
          // coexist below the fold — `role=status` would spam screen
          // readers with N "Loading example" announcements.
          return h(
            'div',
            {
              class: 'pyreon-example__loading',
              'aria-hidden': 'true',
            },
          )
        }
        // Mount the resolved example. If `shared` was requested,
        // pass it as a prop; otherwise pass empty props.
        const childProps = sharedSig !== undefined
          ? { shared: sharedSig }
          : {}
        return h(Comp as ComponentFn<typeof childProps>, childProps)
      },
    ),
  )
}
