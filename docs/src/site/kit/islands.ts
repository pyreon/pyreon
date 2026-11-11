import { island } from '@pyreon/zero'

/**
 * Kit-level islands. Every interactive piece of a static marketing page is an
 * island (see `render-mode.ts`); these are the ones the kit and the shell use.
 * Declarations stay literal `island(() => import(…), {…})` calls so
 * `@pyreon/vite-plugin` puts them in the islands registry.
 */

/** The copy button of an install command; hydrates when it scrolls into view. */
export const CopyButtonIsland = island(() => import('./command'), { name: 'CopyButton', hydrate: 'visible', prefetch: 'idle' })

/** The whole nav bar: menus, mobile sheet, theme toggle. Small; hydrates at idle. */
export const SiteNavIsland = island(() => import('../shell/SiteNav'), { name: 'SiteNav', hydrate: 'idle' })

/** The video of a `Loop`: loads near the viewport, follows theme and screen size. */
export const LoopPlayerIsland = island(() => import('./LoopPlayer'), { name: 'LoopPlayer', hydrate: 'visible' })
