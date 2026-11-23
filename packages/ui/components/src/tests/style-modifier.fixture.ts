import { h, type VNode } from '@pyreon/core'
import { Element } from '@pyreon/elements'
import { rocketstyle } from '@pyreon/rocketstyle'
import { css } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import Card from '../components/Card'
import { el } from '../factory'

/**
 * A one-off look is a named, typed modifier on the component (rocketstyle's
 * multi-value `.multiple()` dimension), not a style prop. #4354 was an
 * instance override losing to the component's `.theme()`; a modifier is a
 * theme slice, so it is merged over the theme and cannot lose to it. Shared by
 * the SSR test (which renders it for real and pins the output below) and the
 * real-Chromium test (which cannot run `renderToString` in the page, so it
 * hydrates the pinned output).
 */

/** The issue's grid, with its looks as modifiers. */
export const Grid = el
  .config({ name: 'IssueGrid' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }))
  .multiple({
    // breakpoint object: three columns from md (768px), the theme's one below
    threeUp: { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } },
    // single value
    dense: { gap: 2 },
    // mobile-first array, `null` = keep the theme's value at that breakpoint
    stepped: { paddingTop: [null, null, 16] },
  })

/** A theme colour, overridden by a state, overridden by a modifier. */
export const Swatch = el
  .config({ name: 'IssueSwatch' })
  .theme(() => ({ color: 'rgb(10, 20, 30)', paddingTop: 4 }))
  .states({ primary: { color: 'rgb(9, 9, 9)' } })
  .sizes({ large: { paddingTop: 8 } })
  .variants({ loud: { color: 'rgb(8, 8, 8)' } })
  .multiple({ accent: { color: 'rgb(200, 100, 50)', paddingTop: 16 } })

/** A pseudo-state the theme sets, overridden by a modifier's `hover` group. */
export const HoverSwatch = el
  .config({ name: 'IssueHoverSwatch' })
  .theme(() => ({ color: 'rgb(10, 20, 30)', hover: { color: 'rgb(10, 20, 30)' } }))
  .multiple({ hot: { hover: { color: 'rgb(1, 150, 2)' } } })

/** A shipped component, extended downstream: Card's theme padding and its `filled` variant fill. */
export const CompactCard = Card.multiple({
  compact: { padding: 4, backgroundColor: 'rgb(250, 240, 230)' },
})

/** A bare Element-based rocketstyle component: no `.styles()`, the default theme bridge renders it. */
export const BareGrid = rocketstyle()({ name: 'BareGrid', component: Element })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }))
  .multiple({ threeUp: { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } } })

/** The same grid under `useBooleans: true`, where a modifier is a boolean prop. */
export const BoolGrid = rocketstyle({ useBooleans: true })({ name: 'BoolGrid', component: Element })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }))
  .multiple({
    threeUp: { gridTemplateColumns: { md: 'repeat(3, minmax(0, 1fr))' } },
    dense: { gap: 2 },
  })

/** Caller-chosen values: `.params()`; a look (`dense`) still overrides a parameter. */
export const ParamGrid = el
  .config({ name: 'ParamGrid' })
  .attrs({ block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, color: 'rgb(10, 20, 30)' }))
  .variants({ loud: { color: 'rgb(8, 8, 8)' } })
  .params({
    columns: (n: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }),
    gapPx: (px: number) => ({ gap: px }),
    tint: (c: string) => ({ color: c, hover: { color: 'rgb(1, 150, 2)' } }),
  })
  .multiple({ dense: { gap: 2 }, accent: { color: 'rgb(200, 100, 50)' } })

/** The escape hatch: a `css` tagged-template result, in `@layer instance`, still beats the theme. */
export const ESCAPE_CSS = css`
  color: rgb(5, 6, 7);
`

const cells = () => [h('span', {}, 'a'), h('span', {}, 'b'), h('span', {}, 'c')]

export const styleModifierTree = (): VNode =>
  h(
    PyreonUI,
    { theme },
    h(Grid, { id: 'grid', multiple: ['threeUp', 'dense'] }, ...cells()),
    h(Grid, { id: 'stepped', multiple: ['stepped'] }, ...cells()),
    h(Swatch, { id: 'swatch', state: 'primary', size: 'large', variant: 'loud', multiple: ['accent'] }, 'swatch'),
    h(HoverSwatch, { id: 'hover', multiple: ['hot'] }, 'hover'),
    h(CompactCard, { id: 'card', variant: 'filled', multiple: ['compact'] }, 'card'),
    h(BareGrid, { id: 'bare', multiple: ['threeUp'] }, ...cells()),
    h(BoolGrid, { id: 'bool', threeUp: true, dense: false }, ...cells()),
    h(Swatch as never, { id: 'escape', css: ESCAPE_CSS }, 'escape'),
    h(ParamGrid, { id: 'params', columns: [1, null, 3], tint: 'rgb(3, 4, 5)', variant: 'loud' }, ...cells()),
  )

/**
 * What `renderToString(styleModifierTree())` and the styler's SSR `<style>`
 * emit, pinned (the SSR test fails on any drift and prints the new values).
 * The real-Chromium test hydrates exactly this.
 */
export const SSR_HTML =
  "<div class=\"pyr-1me5b1j pyr-1ph8fbl\" id=\"grid\" data-rocketstyle=\"IssueGrid\" data-pyr-element=\"Element\"><span>a</span><span>b</span><span>c</span></div><div class=\"pyr-1me5b1j pyr-uoh872\" id=\"stepped\" data-rocketstyle=\"IssueGrid\" data-pyr-element=\"Element\"><span>a</span><span>b</span><span>c</span></div><div class=\"pyr-v7kvxa pyr-hu2930\" id=\"swatch\" data-rocketstyle=\"IssueSwatch\" data-pyr-element=\"Element\">swatch</div><div class=\"pyr-v7kvxa pyr-1v604g0\" id=\"hover\" data-rocketstyle=\"IssueHoverSwatch\" data-pyr-element=\"Element\">hover</div><div class=\"pyr-1me5b1j pyr-gmjh1q\" id=\"card\" data-rocketstyle=\"Card\" data-pyr-element=\"Element\">card</div><div class=\"pyr-1me5b1j pyr-1sm6518\" id=\"bare\" data-rocketstyle=\"BareGrid\" data-pyr-element=\"Element\"><span>a</span><span>b</span><span>c</span></div><div class=\"pyr-1me5b1j pyr-1gbq6ps\" id=\"bool\" data-rocketstyle=\"BoolGrid\" data-pyr-element=\"Element\"><span>a</span><span>b</span><span>c</span></div><div class=\"pyr-ueam52 pyr-tasbo\" id=\"escape\" data-rocketstyle=\"IssueSwatch\" data-pyr-element=\"Element\">escape</div><div class=\"pyr-1me5b1j pyr-10vlaa2\" id=\"params\" data-rocketstyle=\"ParamGrid\" data-pyr-element=\"Element\"><span>a</span><span>b</span><span>c</span></div>"

export const SSR_CSS =
  "@layer elements, rocketstyle, instance;@layer rocketstyle{.pyr-1ph8fbl{display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.125rem;}}@layer rocketstyle{@media only screen and (min-width: 48em){.pyr-1ph8fbl{grid-template-columns: repeat(3, minmax(0, 1fr));}}}@layer elements{.pyr-1me5b1j{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: stretch; width: 100%; height: auto; display: flex;}}@layer rocketstyle{.pyr-uoh872{display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.25rem;}}@layer rocketstyle{@media only screen and (min-width: 48em){.pyr-uoh872{padding-top: 1rem;}}}@layer rocketstyle{.pyr-hu2930{color: rgb(200, 100, 50); padding-top: 1rem;}}@layer elements{.pyr-v7kvxa{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: auto; width: auto; height: auto; display: inline-flex;}}@layer rocketstyle{.pyr-1v604g0{color: rgb(10, 20, 30); &:hover { color: rgb(1, 150, 2); }}}@layer rocketstyle{.pyr-gmjh1q{background-color: rgb(250, 240, 230); color: rgba(15, 23, 42, 0.8); border-radius: 0.5rem; padding: 0.25rem;}}@layer rocketstyle{.pyr-1sm6518{display: grid; grid-template-columns: minmax(0, 1fr);}}@layer rocketstyle{@media only screen and (min-width: 48em){.pyr-1sm6518{grid-template-columns: repeat(3, minmax(0, 1fr));}}}@layer rocketstyle{.pyr-1gbq6ps{display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.25rem;}}@layer rocketstyle{@media only screen and (min-width: 48em){.pyr-1gbq6ps{grid-template-columns: repeat(3, minmax(0, 1fr));}}}@layer rocketstyle{.pyr-tasbo{color: rgb(10, 20, 30); padding-top: 0.25rem;}}@layer elements{.pyr-ueam52{position: relative; box-sizing: border-box; flex-direction: column; align-items: flex-start; justify-content: center; align-self: auto; width: auto; height: auto; display: inline-flex;}}@layer instance{.pyr-ueam52{color: rgb(5, 6, 7);}}@layer rocketstyle{.pyr-10vlaa2{display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 0.25rem; color: rgb(3, 4, 5); &:hover { color: rgb(1, 150, 2); }}}@layer rocketstyle{@media only screen and (min-width: 48em){.pyr-10vlaa2{grid-template-columns: repeat(3, minmax(0, 1fr));}}}"
