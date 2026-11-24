/**
 * In-place HMR for the PROJECT's component modules (`atlas dev` only).
 *
 * `@pyreon/vite-plugin` makes every component module self-accept and hand its
 * freshly evaluated namespace to `globalThis.__pyreon_hmr_swap__` (installed
 * by the router for its own route components). When no handler claims the
 * module it invalidates, and the update climbed through the virtual catalog to
 * the app shell: a full page reload for every component edit.
 *
 * This chains onto that hook: a module the catalog imported is swapped into
 * the catalog (`__atlasHot`) and the preview re-mounts, keeping the selection
 * and every control value; anything else goes to the previous handler, so the
 * router's own swap and the reload fallback are unchanged.
 */
import { __atlasHot } from 'virtual:atlas/catalog'

type Swap = (id: string, mod: unknown) => boolean

interface HotHost {
  __pyreon_hmr_swap__?: Swap
  __ATLAS_MODEL__?: { restartPreview: (options?: { theme?: boolean }) => void }
}

export function installComponentHmr(): void {
  const host = globalThis as HotHost
  const previous = host.__pyreon_hmr_swap__
  host.__pyreon_hmr_swap__ = (id, mod) => {
    const swap = __atlasHot.get(id.split('?')[0] ?? id)
    if (!swap) return previous ? previous(id, mod) : false
    swap(mod)
    // Re-mount ONLY the preview: the theme provider and the chrome stay.
    host.__ATLAS_MODEL__?.restartPreview({ theme: false })
    return true
  }
}
