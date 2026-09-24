/**
 * Keep a previewed component's OVERLAYS on the canvas.
 *
 * A modal, dialog or drawer mounts through `<Portal target={document.body}>`,
 * which is right in an app and wrong in a workbench: the overlay escaped the
 * preview, covered the whole workbench with a `position: fixed` layer (so the
 * sidebar stopped taking clicks), rendered in the browser's default font —
 * the preview surface is what carries the kit's inherited typography — and
 * left the canvas itself looking empty.
 *
 * The runtime brackets portaled content in `<!--portal-->…<!--/portal-->`
 * comment markers, and its own teardown removes whatever sits BETWEEN the two
 * markers wherever they are. So a bracket can be relocated as a unit: this
 * moves every bracket mounted DIRECTLY on `document.body` into the active
 * preview host, where the host's containing block (`transform` / `contain:
 * layout`) confines `position: fixed` children to the preview rather than the
 * viewport.
 *
 * Deliberately scoped to body-level brackets. `@pyreon/elements`' `<Portal>`
 * (tooltips, popovers, menus) mounts into a per-instance WRAPPER div, and those
 * overlays are positioned from viewport coordinates measured against their
 * trigger — relocating one into a transformed ancestor would offset it by the
 * ancestor's position. They already render next to their trigger, which is
 * what the canvas needs.
 *
 * Hosts form a stack: the most recently attached host adopts. Removal is by
 * IDENTITY (leak class A — a host detached out of order must not pop another's
 * frame), and the one body observer lives only while a host is registered.
 */

const hosts: HTMLElement[] = []
let observer: MutationObserver | null = null

const isMarker = (n: Node, data: string): boolean =>
  n.nodeType === 8 && (n as Comment).data === data

/**
 * Move each body-level portal bracket into `host`. Returns how many brackets
 * moved. Pure DOM, exported for the unit test.
 */
export function adoptInto(host: HTMLElement, body: HTMLElement): number {
  let moved = 0
  let node: ChildNode | null = body.firstChild
  while (node) {
    if (!isMarker(node, 'portal')) {
      node = node.nextSibling
      continue
    }
    // Collect the whole bracket. Depth-counted: a bracket is closed by ITS
    // `/portal`, not by the first one met.
    const run: ChildNode[] = []
    let depth = 0
    let cur: ChildNode | null = node
    while (cur) {
      run.push(cur)
      if (isMarker(cur, 'portal')) depth += 1
      else if (isMarker(cur, '/portal')) {
        depth -= 1
        if (depth === 0) break
      }
      cur = cur.nextSibling
    }
    // An unclosed bracket is still being mounted — leave it; the observer
    // sees the closing marker arrive.
    if (depth !== 0) break
    // Depth 0 is only reached by breaking ON the closing marker.
    const next: ChildNode | null = cur!.nextSibling
    // Moving a focused element blurs it, and an overlay moves focus INTO itself
    // on open (a focus trap, an autofocus field). Restore it after the move so
    // the dialog is still keyboard-operable.
    const doc = body.ownerDocument
    const active = doc.activeElement
    const hadFocus = active !== null && run.some((n) => n === active || n.contains(active))
    const frag = doc.createDocumentFragment()
    for (const n of run) frag.appendChild(n)
    host.appendChild(frag)
    if (hadFocus && active instanceof HTMLElement) active.focus({ preventScroll: true })
    moved += 1
    node = next
  }
  return moved
}

function sweep(): void {
  const host = hosts[hosts.length - 1]
  if (!host || !host.isConnected || typeof document === 'undefined') return
  adoptInto(host, document.body)
}

/**
 * Adopt body-level portals into `host` until the returned disposer runs.
 * A no-op outside a browser.
 */
export function adoptBodyPortals(host: HTMLElement): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  hosts.push(host)
  if (!observer) {
    observer = new MutationObserver(sweep)
    observer.observe(document.body, { childList: true })
  }
  // A portal mounted BEFORE the host attached is already on the body, and no
  // mutation will announce it. The ref fires while the surface is still being
  // built in a detached fragment, so the catch-up sweep waits for the mount to
  // land (a microtask — the insertion is synchronous with the ref).
  sweep()
  queueMicrotask(sweep)
  return () => {
    const i = hosts.lastIndexOf(host)
    if (i !== -1) hosts.splice(i, 1)
    if (hosts.length === 0) {
      observer?.disconnect()
      observer = null
    }
  }
}

/** Test seam — how many hosts are registered. */
export function _adoptHostCount(): number {
  return hosts.length
}
