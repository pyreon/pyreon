import '../ui-init'
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { Badge } from '../kit/badge'
import { Tag } from '../kit/tag'
import { el, focusRing, tapArea, tone, txt, type LinkAttrs } from '../kit/bases'
import { Note } from '../kit/note'
import { Text } from '../kit/primitives'
import { Numeral, StatBody } from '../kit/proof'
import { font, radius, text, weight } from '../theme'
import { cssDiff, renderElements, renderRoot, type RenderedElement } from './effective-css'

/**
 * The S3 families replace hand-written definitions. Each case renders, on the
 * server through `<PyreonUI>` like the site does, the definition a page or
 * kit file used to write (copied verbatim from the commit before) and the
 * family component that replaced it, once through compiled JSX (this file
 * goes through the real `pyreon()` plugin) and once through `h()`, and
 * compares the element and its effective CSS, pseudo-states and nested media
 * included (`effective-css.ts`).
 *
 * Where the two differ, the test names every differing property: those are
 * the intentional changes (a duplicate that differed from the token only by
 * accident takes the token value), listed in the PR with their crops. Any
 * other drift fails.
 */

/** Effective CSS of the root through compiled JSX and through `h()` must agree; returns it. */
async function both(jsx: unknown, viaH: unknown): Promise<RenderedElement> {
  const a = await renderRoot(jsx as never)
  const b = await renderRoot(viaH as never)
  expect(b).toEqual(a)
  return a
}

/**
 * The outer margin a legacy definition carried (the parent's gap or a Box now
 * sets it) is not part of the component: compare without any margin key, and
 * check separately that the component's own margin is 0.
 */
const withoutMargin = (css: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(css).filter(([k]) => !/\|margin(-(top|bottom|left|right))?$/.test(k)))

describe('Badge replaces StatusBadge and the badge lettering', () => {
  // kit/type.tsx before this change, verbatim.
  const StatusBadge = txt
    .config({ name: 'StatusBadge' })
    .attrs({ tag: 'span' })
    .theme((_t, m) => ({
      display: 'inline-block',
      marginLeft: 8,
      paddingLeft: 7,
      paddingRight: 7,
      paddingTop: 1,
      paddingBottom: 1,
      borderRadius: radius.pill,
      border: '1px solid',
      borderColor: tone(m, 'warn'),
      color: tone(m, 'warn'),
      fontFamily: font.mono,
      fontSize: 10,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      verticalAlign: '2px',
      whiteSpace: 'nowrap',
    }))

  it('size sm, tone experimental, placed after a name: the same element and CSS as StatusBadge (plus the shared nowrap pill rule: flex-shrink 0)', async () => {
    const want = await renderRoot(h(StatusBadge, null, 'next release'))
    const got = await both(
      <Badge tone="experimental" size="sm" placement="after">
        next release
      </Badge>,
      h(Badge, { tone: 'experimental', size: 'sm', placement: 'after' }, 'next release'),
    )
    expect(got.open).toBe(want.open)
    // flex-shrink only acts in a flex row (NextReleaseNote, a Cluster): there it keeps the pill whole, as the verdict chip always was.
    expect(cssDiff(want.css, got.css)).toEqual(['||flex-shrink'])
  })

  it('without a placement it has no outer margin (a recipe card no longer needs to cancel one)', async () => {
    const got = await both(<Badge tone="experimental" size="sm">x</Badge>, h(Badge, { tone: 'experimental', size: 'sm' }, 'x'))
    expect(Object.keys(got.css).filter((k) => k.includes('margin'))).toEqual([])
  })

  it('bare, placed before a line: the withdrawn word (BenchWithdrawnTag) with the gap on the badge scale (10px → 8px)', async () => {
    const WithdrawnTag = txt
      .config({ name: 'BenchWithdrawnTag' })
      .attrs({ tag: 'span' })
      .theme((_t, m) => ({
        display: 'inline-block',
        marginRight: 10,
        fontFamily: font.mono,
        fontSize: 10.5,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: tone(m, 'err'),
      }))
    const want = await renderRoot(h(WithdrawnTag, null, 'withdrawn'))
    const got = await both(
      <Badge tone="loss" bare placement="before">
        withdrawn
      </Badge>,
      h(Badge, { tone: 'loss', bare: true, placement: 'before' }, 'withdrawn'),
    )
    expect(got.open).toBe(want.open)
    expect(got.css['||margin-right']).toBe('0.5rem')
    expect(want.css['||margin-right']).toBe('0.625rem')
    // The pill's box properties are present and zeroed (bare); everything a reader sees but the gap is the same.
    for (const k of ['||font-family', '||font-size', '||letter-spacing', '||text-transform', '||color', '||display', '||line-height']) expect(got.css[k], k).toBe(want.css[k])
  })

  it('Text variant badge is the lettering MigrateTerm wrote by hand (its margin now a Box above it)', async () => {
    const Term = txt
      .config({ name: 'MigrateTerm' })
      .attrs({ tag: 'b' })
      .theme((_t, m) => ({ display: 'block', marginTop: 8, fontFamily: font.mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: weight.medium, color: tone(m, 'fog') }))
    const want = await renderRoot(h(Term, null, 'how'))
    const got = await both(
      <Text variant="badge" tone="fog" medium block tag="b">
        how
      </Text>,
      h(Text, { variant: 'badge', tone: 'fog', medium: true, block: true, tag: 'b' }, 'how'),
    )
    expect(got.open).toBe(want.open)
    expect(got.css).toEqual(withoutMargin(want.css))
  })
})

describe('Tag replaces Chip, ApiChip, BenchJump and HomeTagLink', () => {
  // kit/controls.tsx `Chip` before this change, verbatim (kit/blocks.tsx `ApiChip` was the same theme on an `li`, without `display`).
  const chipTheme = (m: Parameters<typeof tone>[0]) => ({
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.4,
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    color: tone(m, 'mist'),
    backgroundColor: tone(m, 'sheen'),
    overflowWrap: 'anywhere',
  })
  const Chip = txt
    .config({ name: 'Chip' })
    .attrs({ tag: 'span' })
    .theme((_t, m) => ({ display: 'inline-block', ...chipTheme(m) }))
  const ApiChip = txt.config({ name: 'ApiChip' }).attrs({ tag: 'li' }).theme((_t, m) => chipTheme(m))

  it('static md: the same element and CSS as Chip', async () => {
    const want = await renderRoot(h(Chip, null, 'useForm'))
    const got = await both(<Tag>useForm</Tag>, h(Tag, null, 'useForm'))
    expect(got).toEqual(want)
  })

  it('static md as a list item: ApiChip, plus inline-block (a flex item of the Cluster, so blockified either way)', async () => {
    const want = await renderRoot(h(ApiChip, null, 'useForm'))
    const got = await both(<Tag tag="li">useForm</Tag>, h(Tag, { tag: 'li' }, 'useForm'))
    expect(got.open).toBe(want.open)
    expect(cssDiff(want.css, got.css)).toEqual(['||display'])
  })

  it('link md: BenchJump on the tag scale (padding-x 13 → 12, border line → line2), same hover, focus ring and tap area', async () => {
    const JumpLink = el
      .config({ name: 'BenchJump' })
      .attrs<LinkAttrs>({ tag: 'a' })
      .theme((_t, m) => ({
        display: 'inline-block',
        paddingTop: 7,
        paddingBottom: 7,
        paddingLeft: 13,
        paddingRight: 13,
        borderRadius: radius.pill,
        border: '1px solid',
        borderColor: tone(m, 'line'),
        fontFamily: font.mono,
        fontSize: text.mono.size,
        color: tone(m, 'mist'),
        textDecoration: 'none',
        hover: { color: tone(m, 'text'), borderColor: tone(m, 'lineHover') },
        focus: focusRing(m),
        extendCss: tapArea,
      }))
    const want = await renderRoot(h(JumpLink, { href: '#method' }, 'method'))
    const got = await both(<Tag href="#method">method</Tag>, h(Tag, { href: '#method' }, 'method'))
    expect(got.open).toBe(want.open)
    expect(cssDiff(want.css, got.css)).toEqual(LINK_BASE_DIFF.concat(['||border-color', '||padding']).sort())
    expect([want.css['||padding'], got.css['||padding']]).toEqual(['0.4375rem 0.8125rem', '0.4375rem 0.75rem'])
  })

  it('link sm: HomeTagLink', async () => {
    const TagLink = el
      .config({ name: 'HomeTagLink' })
      .attrs<LinkAttrs>({ tag: 'a' })
      .theme((_t, m) => ({
        display: 'inline-block',
        paddingTop: 5,
        paddingBottom: 5,
        paddingLeft: 11,
        paddingRight: 11,
        borderRadius: radius.pill,
        border: '1px solid',
        borderColor: tone(m, 'line2'),
        fontFamily: font.mono,
        fontSize: 11.5,
        color: tone(m, 'mist'),
        textDecoration: 'none',
        extendCss: tapArea,
        hover: { color: tone(m, 'text'), borderColor: tone(m, 'lineHover') },
        focus: focusRing(m),
      }))
    const want = await renderRoot(h(TagLink, { href: '/products/form' }, 'Forms'))
    const got = await both(
      <Tag size="sm" href="/products/form">
        Forms
      </Tag>,
      h(Tag, { size: 'sm', href: '/products/form' }, 'Forms'),
    )
    expect(got.open).toBe(want.open)
    expect(cssDiff(want.css, got.css)).toEqual(LINK_BASE_DIFF)
  })
})

/**
 * The legacy link tags were built on the element base (`el`), the Tag on the
 * text base (`txt`). What differs between the two bases is inert on an
 * inline-block anchor: the flex keys (`align-items`, `align-self`,
 * `flex-direction`, `justify-content`) do nothing on an inline-block, and in
 * the touch-screen tap area (inline-flex, one text child, `align-items:
 * center` from `tapArea`) both centre the text; `box-sizing: border-box` is
 * the site's global reset (`site-css.ts`); `cursor: pointer` is an anchor's
 * own; `height` / `width: auto` and `position: relative` (no positioned
 * child) change nothing; `font-weight: inherit` is an anchor's own, and
 * `line-height: normal` is what the `el` anchor computed (measured in
 * Chromium on the built page: `normal`).
 */
const LINK_BASE_DIFF: string[] = [
  '||align-items',
  '||align-self',
  '||box-sizing',
  '||cursor',
  '||flex-direction',
  '||font-weight',
  '||height',
  '||justify-content',
  '||line-height',
  '||position',
  '||width',
]

describe('Note replaces the hand-written caveats, captions and hints', () => {
  const caveatOf = (name: string, extra: Record<string, unknown>, tag: 'p' | 'span' = 'p') =>
    txt
      .config({ name })
      .attrs({ tag })
      .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.caveat.size, color: tone(m, 'fog'), ...extra }))

  it('caveat: the proof Caveat and TableNote (its margin now a Box), same CSS', async () => {
    const Caveat = caveatOf('Caveat', { letterSpacing: text.caveat.tracking, lineHeight: 1.6 })
    const TableNote = caveatOf('TableNote', { marginTop: 12, letterSpacing: text.caveat.tracking, lineHeight: 1.6 })
    const got = await both(<Note>x</Note>, h(Note, null, 'x'))
    const caveat = await renderRoot(h(Caveat, null, 'x'))
    expect(got.open).toBe(caveat.open)
    expect(cssDiff(caveat.css, got.css)).toEqual(['||display'])
    expect(cssDiff(withoutMargin((await renderRoot(h(TableNote, null, 'x'))).css), got.css)).toEqual(['||display', '||margin'])
  })

  it('caveat: the section notes take the caveat tracking they lacked (MigrateNote, CompareChecked, SiteSectionCaption)', async () => {
    const MigrateNote = caveatOf('MigrateNote', { marginTop: 10, lineHeight: 1.6 })
    const SiteSectionCaption = caveatOf('SiteSectionCaption', { marginTop: 14, maxWidth: 760, lineHeight: 1.6 })
    const got = await both(<Note>x</Note>, h(Note, null, 'x'))
    expect(cssDiff(withoutMargin((await renderRoot(h(MigrateNote, null, 'x'))).css), withoutMargin(got.css))).toEqual(['||display', '||letter-spacing'])
    const measured = await both(<Note measure>x</Note>, h(Note, { measure: true }, 'x'))
    expect(cssDiff(withoutMargin((await renderRoot(h(SiteSectionCaption, null, 'x'))).css), withoutMargin(measured.css))).toEqual(['||display', '||letter-spacing'])
  })

  it('caveat as a figcaption: DiagramCaption', async () => {
    const DiagramCaption = txt
      .config({ name: 'DiagramCaption' })
      .attrs({ tag: 'figcaption' })
      .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.caveat.size, letterSpacing: text.caveat.tracking, lineHeight: 1.6, color: tone(m, 'fog') }))
    const want = await renderRoot(h(DiagramCaption, null, 'x'))
    const got = await both(<Note tag="figcaption">x</Note>, h(Note, { tag: 'figcaption' }, 'x'))
    expect(got.open).toBe(want.open)
    // A figcaption is a block already; a margin of 0 is its default.
    expect(cssDiff(want.css, got.css)).toEqual(['||display', '||margin'])
  })

  it('caption: HomeNote; mono: ShowcaseNote and OpenHint', async () => {
    const HomeNote = txt
      .config({ name: 'HomeNote' })
      .attrs({ tag: 'p' })
      .theme((_t, m) => ({ margin: 0, marginTop: 14, fontFamily: font.sans, fontSize: text.caption.size, lineHeight: text.caption.lineHeight, color: tone(m, 'fog') }))
    const ShowcaseNote = txt
      .config({ name: 'ShowcaseNote' })
      .attrs({ tag: 'p' })
      .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.6, color: tone(m, 'fog') }))
    const OpenHint = txt
      .config({ name: 'OpenHint' })
      .attrs({ tag: 'p' })
      .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.5, color: tone(m, 'fog') }))
    const caption = await both(<Note size="caption">x</Note>, h(Note, { size: 'caption' }, 'x'))
    expect(cssDiff(withoutMargin((await renderRoot(h(HomeNote, null, 'x'))).css), withoutMargin(caption.css))).toEqual(['||display'])
    const showcase = await both(
      <Note size="mono" leading="relaxed">
        x
      </Note>,
      h(Note, { size: 'mono', leading: 'relaxed' }, 'x'),
    )
    expect(cssDiff((await renderRoot(h(ShowcaseNote, null, 'x'))).css, showcase.css)).toEqual(['||display'])
    const hint = await both(<Note size="mono">x</Note>, h(Note, { size: 'mono' }, 'x'))
    expect(cssDiff((await renderRoot(h(OpenHint, null, 'x'))).css, hint.css)).toEqual(['||display'])
  })
})

describe('StatBody sizes replace the page-local stat parts', () => {
  const strip = (els: RenderedElement[]) => els.map((e) => ({ ...e, open: e.open.replace(' data-stat=""', '') }))

  it('hero: the benchmarks hero stat (numeral, label 16px, the condition in the caveat style)', async () => {
    const Label = txt
      .config({ name: 'BenchHeroStatLabel' })
      .attrs({ tag: 'span' })
      .theme((_t, m) => ({ display: 'block', fontFamily: font.sans, fontSize: 16, lineHeight: 1.35, fontWeight: weight.medium, color: tone(m, 'strong') }))
    const Condition = txt
      .config({ name: 'BenchHeroStatCondition' })
      .attrs({ tag: 'span' })
      .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.caveat.size, lineHeight: 1.55, color: tone(m, 'fog') }))
    const want = await renderElements(
      h('div', null, h('span', null, h(Numeral, { size: 'strip' }, '2.6×'), ' ', h(Label, null, 'faster')), h(Condition, null, 'one run')),
    )
    const viaJsx = strip(
      await renderElements(
        <div>
          <StatBody size="hero" numeral="strip" stat="2.6×" label="faster" note="one run" />
        </div>,
      ),
    )
    const viaH = strip(await renderElements(h('div', null, h(StatBody, { size: 'hero', numeral: 'strip', stat: '2.6×', label: 'faster', note: 'one run' }))))
    expect(viaH).toEqual(viaJsx)
    expect(viaJsx.map((e) => e.open)).toEqual(want.map((e) => e.open))
    const [, , numeral, label, detail] = viaJsx
    expect(numeral?.css).toEqual(want[2]?.css)
    expect(cssDiff(want[3]?.css ?? {}, label?.css ?? {})).toEqual(['||margin'])
    expect(cssDiff(want[4]?.css ?? {}, detail?.css ?? {})).toEqual(['||letter-spacing', '||overflow-wrap'])
  })

  it('product: the products index card proof (numeral card, label 13.5px mist, the condition in the caveat style)', async () => {
    const ProofLine = txt
      .config({ name: 'ProductCardProof' })
      .attrs({ tag: 'p' })
      .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: 13.5, lineHeight: 1.5, color: tone(m, 'mist') }))
    const Caveat = txt
      .config({ name: 'ProductCardCaveat' })
      .attrs({ tag: 'p' })
      .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.caveat.size, lineHeight: 1.5, color: tone(m, 'fog') }))
    const want = await renderElements(h('div', null, h(Numeral, { tag: 'span', size: 'card' }, '8.7×'), h(ProofLine, null, 'faster'), h(Caveat, null, 'one run')))
    const viaJsx = strip(
      await renderElements(
        <div>
          <StatBody size="product" numeral="card" stat="8.7×" label="faster" note="one run" />
        </div>,
      ),
    )
    const viaH = strip(await renderElements(h('div', null, h(StatBody, { size: 'product', numeral: 'card', stat: '8.7×', label: 'faster', note: 'one run' }))))
    expect(viaH).toEqual(viaJsx)
    // div > span[data-stat] > (numeral, label) + detail: the label and the condition are block spans now, where they were paragraphs.
    const [, , numeral, label, detail] = viaJsx
    expect(numeral?.css).toEqual(want[1]?.css)
    expect(cssDiff(want[2]?.css ?? {}, label?.css ?? {})).toEqual(['||display', '||font-weight'])
    expect(cssDiff(want[3]?.css ?? {}, detail?.css ?? {})).toEqual(['||display', '||letter-spacing', '||margin', '||overflow-wrap'])
  })

  it("Numeral size inline: the featured product card's 22px, without an inline style", async () => {
    const got = await both(
      <Numeral tag="span" size="inline">
        4×
      </Numeral>,
      h(Numeral, { tag: 'span', size: 'inline' }, '4×'),
    )
    expect(got.css['||font-size']).toBe('1.375rem')
  })
})
