import { h, type VNode } from '@pyreon/core'
import type { StyleOverride } from '@pyreon/elements'
import { css } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { el } from '../factory'

/**
 * #4354: a per-instance override must beat the component's own `.theme()` for
 * the same property. The override is the typed `styles` prop (same keys and
 * value shapes as `.theme()`); `css={css`…`}` stays as the escape hatch. Shared
 * by the SSR test (which renders it for real and pins the output below) and
 * the real-Chromium test (which cannot run `renderToString` in the page, so it
 * hydrates the pinned output).
 */

/** The issue's reproduction. */
export const Grid = el
  .config({ name: 'IssueGrid' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }))

/** Three columns from `md` (768px), over the theme's one. */
export const GRID_STYLES: StyleOverride = { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } }

/** A plain property the theme sets, plus a unit value (16 → 1rem, as in a theme). */
export const Swatch = el.config({ name: 'IssueSwatch' }).theme(() => ({ color: 'rgb(10, 20, 30)' }))

export const SWATCH_STYLES: StyleOverride = { color: 'rgb(200, 100, 50)', paddingTop: 16 }

/** A pseudo-state the theme sets: the override's `hover` group, as in `.theme()`. */
export const HoverSwatch = el
  .config({ name: 'IssueHoverSwatch' })
  .theme(() => ({ color: 'rgb(10, 20, 30)', hover: { color: 'rgb(10, 20, 30)' } }))

export const HOVER_STYLES: StyleOverride = { hover: { color: 'rgb(1, 150, 2)' } }

/** The escape hatch: a `css` tagged-template result, also in the instance layer. */
export const ESCAPE_CSS = css`
  color: rgb(5, 6, 7);
`

export const instanceCssTree = (): VNode =>
  h(
    PyreonUI,
    { theme },
    h(Grid as never, { id: 'grid', styles: GRID_STYLES }, h('span', {}, 'a'), h('span', {}, 'b'), h('span', {}, 'c')),
    h(Swatch as never, { id: 'swatch', styles: SWATCH_STYLES }, 'swatch'),
    h(HoverSwatch as never, { id: 'hover', styles: HOVER_STYLES }, 'hover'),
    h(Swatch as never, { id: 'escape', css: ESCAPE_CSS }, 'escape'),
  )

/**
 * What `renderToString(instanceCssTree())` and the styler's SSR `<style>` emit,
 * pinned (the SSR test fails on any drift and prints the new values). The
 * real-Chromium test hydrates exactly this.
 */
export const SSR_HTML =
  "<div class=\"pyr-4ss9mx pyr-1n7tw6e\" id=\"grid\" data-rocketstyle=\"IssueGrid\" data-pyr-element=\"Element\"><span>a</span><span>b</span><span>c</span></div><div class=\"pyr-id9rzt pyr-sbn6rx\" id=\"swatch\" data-rocketstyle=\"IssueSwatch\" data-pyr-element=\"Element\">swatch</div><div class=\"pyr-d4yn5x pyr-c0e7uh\" id=\"hover\" data-rocketstyle=\"IssueHoverSwatch\" data-pyr-element=\"Element\">hover</div><div class=\"pyr-ueam52 pyr-sbn6rx\" id=\"escape\" data-rocketstyle=\"IssueSwatch\" data-pyr-element=\"Element\">escape</div>"

export const SSR_CSS =
  "@layer elements, rocketstyle, instance;@layer rocketstyle{.pyr-1n7tw6e{display: grid; grid-template-columns: minmax(0, 1fr); &:hover { } &:focus-visible { } &:active { } &:disabled, &[aria-disabled='true'] { }}}@layer elements{.pyr-4ss9mx{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: stretch; width: 100%; height: auto; display: flex;}}@layer instance{@media only screen and (min-width: 48em){.pyr-4ss9mx{grid-template-columns: repeat(3, minmax(0, 1fr));}}}@layer rocketstyle{.pyr-sbn6rx{color: rgb(10, 20, 30); &:hover { } &:focus-visible { } &:active { } &:disabled, &[aria-disabled='true'] { }}}@layer elements{.pyr-id9rzt{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: auto; width: auto; height: auto; display: inline-flex;}}@layer instance{.pyr-id9rzt{color: rgb(200, 100, 50); padding-top: 1rem;}}@layer rocketstyle{.pyr-c0e7uh{color: rgb(10, 20, 30); &:hover { color: rgb(10, 20, 30); } &:focus-visible { } &:active { } &:disabled, &[aria-disabled='true'] { }}}@layer elements{.pyr-d4yn5x{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: auto; width: auto; height: auto; display: inline-flex;}}@layer instance{.pyr-d4yn5x{&:hover{color: rgb(1, 150, 2);}}}@layer elements{.pyr-ueam52{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: auto; width: auto; height: auto; display: inline-flex;}}@layer instance{.pyr-ueam52{color: rgb(5, 6, 7);}}"
