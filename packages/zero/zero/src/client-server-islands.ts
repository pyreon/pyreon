/**
 * The server-island half of an islands-only page: activate the server islands
 * that sit outside every client island, under the build's route base. A page
 * with server islands but no client islands loads ONLY this (about 1 KB gz),
 * not the client-island runtime (about 22 KB gz).
 *
 * The base is the build-time `__ZERO_BASE__`, passed explicitly: a marker's
 * attributes never decide where its fragment — inserted as HTML — is fetched
 * from (see `activateServerIslandElement` in `@pyreon/server`).
 */
import { activateServerIslandElement, setServerIslandBase } from '@pyreon/server/client'

/** zero's route base, a build-time constant (see vite-plugin.ts). */
declare const __ZERO_BASE__: string

/**
 * Set the server-island base for markers rendered without a router (inside a
 * client island) and activate the top-level ones. A marker INSIDE a client
 * island is left to that island: it activates itself when the island
 * hydrates, and swapping its fragment in first would change the DOM the
 * island hydrates against.
 */
export function startServerIslands(): void {
  const base = typeof __ZERO_BASE__ !== 'undefined' ? __ZERO_BASE__ : '/'
  setServerIslandBase(base)
  // pyreon-lint-disable-next-line pyreon/no-window-in-ssr, pyreon/no-dom-in-setup -- client-only: called after startIslandsOnlyPage found a document
  const markers = document.querySelectorAll<HTMLElement>('pyreon-server-island[data-name]:not([data-pyreon-si])')
  for (const el of markers) {
    if (el.closest('pyreon-island') === null) activateServerIslandElement(el, base)
  }
}
