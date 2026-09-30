import type { SuspenseBoundary, VNodeChild } from '@pyreon/core'
import { effect, getContextOwner, runUntracked, runWithContextOwner } from '@pyreon/reactivity'

type Cleanup = () => void
type Mount = (child: VNodeChild, parent: Node, anchor: Node | null) => Cleanup

/**
 * The DOM half of a `<Suspense>` boundary: show its fallback while any async
 * DESCENDANT it registered is still loading (see `SuspenseBoundary` in
 * `@pyreon/core`).
 *
 * `<Suspense>`'s own accessor only sees its DIRECT child, and for that child it
 * renders the fallback INSTEAD of the child — possible because a loading direct
 * child has nothing mounted yet. A descendant deeper down is different: it only
 * exists because its ancestors inside the boundary mounted, so replacing the
 * content with the fallback would unmount those ancestors (their state, their
 * DOM, a second run of their setup and `onMount` when they come back). Vue keeps
 * such a pending tree mounted off-screen; this does the same.
 *
 * `start`/`end` delimit everything the `<Suspense>` rendered. While the boundary
 * has pending loads the nodes between them are MOVED into a detached fragment
 * (still mounted, still reactive — every Pyreon boundary resolves its live
 * parent through its own marker) and the fallback is mounted in their place;
 * when the last load settles, the fallback goes and the same nodes move back.
 * No descendant is torn down, so nothing is lost and nothing runs twice.
 */
export function attachSuspenseBoundary(
  boundary: SuspenseBoundary,
  start: Comment,
  end: Comment,
  mount: Mount,
): Cleanup {
  const owner = getContextOwner()
  let offscreen: DocumentFragment | null = null
  let fallbackCleanup: Cleanup | null = null

  const e = effect(() => {
    const pending = boundary.pending() > 0
    runUntracked(() => {
      const parent = end.parentNode
      if (parent === null) return
      if (pending && offscreen === null) {
        const frag = document.createDocumentFragment()
        for (let n = start.nextSibling; n !== null && n !== end; ) {
          const next: ChildNode | null = n.nextSibling
          frag.appendChild(n)
          n = next
        }
        offscreen = frag
        // Bracketed and removed explicitly: `mount` may hand back a no-op
        // remover for nodes it expects a freshly-built parent to take with it
        // (`_elementDepth`), and this parent outlives the fallback.
        const fbStart = document.createComment('suspense-fallback')
        parent.insertBefore(fbStart, end)
        const dispose = runWithContextOwner(owner, () => mount(boundary.fallback(), parent, end))
        fallbackCleanup = () => {
          dispose()
          for (let n = fbStart.nextSibling; n !== null && n !== end; ) {
            const next: ChildNode | null = n.nextSibling
            n.remove()
            n = next
          }
          fbStart.remove()
        }
      } else if (!pending && offscreen !== null) {
        fallbackCleanup?.()
        fallbackCleanup = null
        parent.insertBefore(offscreen, end)
        offscreen = null
      }
    })
  })

  return () => {
    e.dispose()
    fallbackCleanup?.()
    fallbackCleanup = null
    // Content still off-screen is torn down by the subtree's own cleanup (it
    // resolves its live parent — the fragment); only the delimiters are ours.
    offscreen = null
    start.parentNode?.removeChild(start)
    end.parentNode?.removeChild(end)
  }
}
