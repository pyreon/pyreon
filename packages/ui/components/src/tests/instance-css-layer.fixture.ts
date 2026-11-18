import { h, type VNode } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { el } from '../factory'

/**
 * #4354: a per-instance `css` prop must beat the component's own `.theme()`
 * for the same property. Shared by the SSR test (which renders it for real and
 * pins the output below) and the real-Chromium test (which cannot run
 * `renderToString` in the page, so it hydrates the pinned output).
 */

/** The issue's exact reproduction. */
export const Grid = el
  .config({ name: 'IssueGrid' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }))

export const GRID_CSS = '@media (min-width: 768px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }'

/** A plain property the theme sets. */
export const Swatch = el.config({ name: 'IssueSwatch' }).theme(() => ({ color: 'rgb(10, 20, 30)' }))

export const SWATCH_CSS = 'color: rgb(200, 100, 50);'

/** A pseudo-class the theme sets. */
export const HoverSwatch = el
  .config({ name: 'IssueHoverSwatch' })
  .theme(() => ({ color: 'rgb(10, 20, 30)', hover: { color: 'rgb(10, 20, 30)' } }))

export const HOVER_CSS = '&:hover { color: rgb(1, 150, 2); }'

export const instanceCssTree = (): VNode =>
  h(
    PyreonUI,
    { theme },
    h(Grid as never, { id: 'grid', css: GRID_CSS }, h('span', {}, 'a'), h('span', {}, 'b'), h('span', {}, 'c')),
    h(Swatch as never, { id: 'swatch', css: SWATCH_CSS }, 'swatch'),
    h(HoverSwatch as never, { id: 'hover', css: HOVER_CSS }, 'hover'),
  )

/**
 * What `renderToString(instanceCssTree())` and the styler's SSR `<style>` emit,
 * pinned (the SSR test fails on any drift and prints the new values). The
 * real-Chromium test hydrates exactly this.
 */
export const SSR_HTML =
  "<div class=\"pyr-1kkey4n pyr-1n7tw6e\" id=\"grid\" data-rocketstyle=\"IssueGrid\" data-pyr-element=\"Element\"><span>a</span><span>b</span><span>c</span></div><div class=\"pyr-eb8cd0 pyr-sbn6rx\" id=\"swatch\" data-rocketstyle=\"IssueSwatch\" data-pyr-element=\"Element\">swatch</div><div class=\"pyr-18t2fgp pyr-c0e7uh\" id=\"hover\" data-rocketstyle=\"IssueHoverSwatch\" data-pyr-element=\"Element\">hover</div>"

export const SSR_CSS =
  "@layer elements, rocketstyle, instance;@layer rocketstyle{.pyr-1n7tw6e{display: grid; grid-template-columns: minmax(0, 1fr); &:hover { } &:focus-visible { } &:active { } &:disabled, &[aria-disabled='true'] { }}}@layer elements{.pyr-1kkey4n{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: stretch; width: 100%; height: auto; display: flex;}}@layer instance{@media (min-width: 768px){.pyr-1kkey4n{grid-template-columns: repeat(3, minmax(0, 1fr));}}}@layer rocketstyle{.pyr-sbn6rx{color: rgb(10, 20, 30); &:hover { } &:focus-visible { } &:active { } &:disabled, &[aria-disabled='true'] { }}}@layer elements{.pyr-eb8cd0{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: auto; width: auto; height: auto; display: inline-flex;}}@layer instance{.pyr-eb8cd0{color: rgb(200, 100, 50);}}@layer rocketstyle{.pyr-c0e7uh{color: rgb(10, 20, 30); &:hover { color: rgb(10, 20, 30); } &:focus-visible { } &:active { } &:disabled, &[aria-disabled='true'] { }}}@layer elements{.pyr-18t2fgp{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: auto; width: auto; height: auto; display: inline-flex;}}@layer instance{.pyr-18t2fgp{&:hover { color: rgb(1, 150, 2); }}}"
