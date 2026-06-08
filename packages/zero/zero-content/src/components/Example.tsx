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
 * Loading is async (dynamic import); during the load window the
 * wrapper shows a thin loading placeholder. This is the same pattern
 * Vite uses for any code-split chunk — the consumer sees an empty
 * shape, then the real component appears once the chunk arrives.
 * Examples are usually small enough that the placeholder flash is
 * imperceptible in practice.
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

  onMount(() => {
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
  })

  return h(
    'div',
    { class: props.class ?? 'pyreon-example' },
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
          return h(
            'div',
            {
              class: 'pyreon-example__loading',
              'aria-busy': 'true',
              'aria-label': 'Loading example',
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
