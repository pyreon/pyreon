import '../ui-init'
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { Container } from '@pyreon/coolgrid'
import { renderToString } from '@pyreon/runtime-server'
import { sheet } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { describe, expect, it } from 'vitest'
import { el, tone, txt } from '../kit/bases'
import { AutoGrid, Box, Cluster, Grid, Icon, Stack, Text, Visible, Wrap } from '../kit/primitives'
import { breakpoints, font, layout, siteTheme, text } from '../theme'

/**
 * The primitives replace hand-written definitions at equal values, so a page
 * paints the same pixels after the swap. Each case renders, on the server
 * through `<PyreonUI>` like the site does, the definition a page used to
 * write (copied verbatim) and the primitive that replaced it, once through
 * the compiled JSX path (this file goes through the real `pyreon()` plugin)
 * and once through `h()`, and compares the element and its EFFECTIVE CSS:
 * per media query, every property's winning value (`elements`, then
 * `rocketstyle`, then `instance`), so a value that moved from the theme to an
 * Element prop still counts as the same.
 */

interface Rendered {
  /** Tag and attributes of the root element, without the hashed class and the rocketstyle name. */
  open: string
  /** `media|property` → value, after the cascade between the two layers. */
  css: Record<string, string>
}

const LAYER_ORDER = ['elements', 'rocketstyle', 'instance']
const RULE = /^@layer (\w+)\{(?:(@media[^{]+)\{)?\.([\w-]+)\{([\s\S]*)\}\}?\}$/

function effectiveCss(classes: readonly string[]): Record<string, string> {
  const rules = sheet
    .getStyleRules()
    .map((r) => RULE.exec(r.trim()))
    .filter((m): m is RegExpExecArray => m !== null && classes.includes(m[3] as string))
    .sort((a, b) => LAYER_ORDER.indexOf(a[1] as string) - LAYER_ORDER.indexOf(b[1] as string))
  const out: Record<string, string> = {}
  for (const m of rules) {
    const media = (m[2] ?? '').trim()
    // Pseudo-state blocks (`&:hover { }` …) are empty on every primitive and every legacy definition here.
    const body = (m[4] as string).replace(/&[^{]*\{[^}]*\}/g, '')
    for (const decl of body.split(';')) {
      const i = decl.indexOf(':')
      if (i < 0) continue
      const prop = decl.slice(0, i).trim()
      if (prop) out[`${media}|${prop}`] = decl.slice(i + 1).trim().replace(/\s+/g, ' ')
    }
  }

  return out
}

async function render(node: VNodeChild): Promise<Rendered> {
  sheet.reset()
  const html = await renderToString(h(PyreonUI, { theme: siteTheme, mode: 'dark' }, h('main', null, node)))
  const open = /^<main>(<[^>]+>)/.exec(html)?.[1] ?? ''
  const classes = /class="([^"]*)"/.exec(open)?.[1]?.split(/\s+/) ?? []

  return {
    open: open.replace(/ class="[^"]*"/, '').replace(/ data-rocketstyle="[^"]*"/, ''),
    css: effectiveCss(classes),
  }
}

/** The legacy definition, then the primitive through compiled JSX and through `h()`. */
async function expectSame(legacy: VNodeChild, jsx: VNodeChild, viaH: VNodeChild): Promise<void> {
  const want = await render(legacy)
  expect(Object.keys(want.css).length).toBeGreaterThan(0)
  expect(await render(jsx)).toEqual(want)
  expect(await render(viaH)).toEqual(want)
}

const kids = () => [h('i', null, 'a'), h('i', null, 'b')]

describe('Stack replaces the hand-written stacks', () => {
  it('a stretched stack (CompareStack, OpenStack: gap 18)', async () => {
    const Legacy = el.config({ name: 'CompareStack' }).attrs({ block: true, contentAlignX: 'block', gap: 18 })
    await expectSame(h(Legacy, null, ...kids()), <Stack gap={225}>{kids()}</Stack>, h(Stack, { gap: 225 }, ...kids()))
  })

  it('a stack that may shrink in a grid (BenchStack: gap 20, min-width 0)', async () => {
    const Legacy = el.config({ name: 'BenchStack' }).attrs({ block: true, contentAlignX: 'block', gap: 20 }).theme(() => ({ minWidth: 0 }))
    await expectSame(
      h(Legacy, null, ...kids()),
      <Stack gap={250} shrink>
        {kids()}
      </Stack>,
      h(Stack, { gap: 250, shrink: true }, ...kids()),
    )
  })

  it("a left-aligned stack (ProductPage's Stack: gap 24, Element's default alignment)", async () => {
    const Legacy = el.config({ name: 'Stack' }).attrs({ block: true, gap: 24 })
    await expectSame(
      h(Legacy, null, ...kids()),
      <Stack gap={300} alignX="left">
        {kids()}
      </Stack>,
      h(Stack, { gap: 300, alignX: 'left' }, ...kids()),
    )
  })

  it('a column of the home split (HomeStack size md: gap in the theme, top, align-self start)', async () => {
    const Legacy = el
      .config({ name: 'HomeStack' })
      .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
      .theme(() => ({ alignSelf: 'start', minWidth: 0 }))
      .sizes(() => ({ sm: { gap: 12 }, md: { gap: 22 }, lg: { gap: 32 } }))
    await expectSame(
      h(Legacy, { size: 'md' }, ...kids()),
      <Stack gap={275} alignY="top" selfStart shrink>
        {kids()}
      </Stack>,
      h(Stack, { gap: 275, alignY: 'top', selfStart: true, shrink: true }, ...kids()),
    )
  })

  it('a list stack drops its bullets (Meters: ul, gap 8)', async () => {
    const Legacy = el.config({ name: 'Meters' }).attrs({ tag: 'ul', block: true, gap: 8 }).theme(() => ({ listStyle: 'none', margin: 0, padding: 0 }))
    await expectSame(
      h(Legacy, { 'aria-label': 'Meters' }, h('li', null, 'x')),
      <Stack tag="ul" gap={100} alignX="left" aria-label="Meters">
        <li>x</li>
      </Stack>,
      h(Stack, { tag: 'ul', gap: 100, alignX: 'left', 'aria-label': 'Meters' }, h('li', null, 'x')),
    )
  })

  it('takes a gap per breakpoint', async () => {
    const Legacy = el.config({ name: 'R' }).attrs({ block: true, contentAlignX: 'block', gap: { xs: 12, md: 20 } })
    await expectSame(
      h(Legacy, null, ...kids()),
      <Stack gap={{ xs: 150, md: 250 }}>{kids()}</Stack>,
      h(Stack, { gap: { xs: 150, md: 250 } }, ...kids()),
    )
  })
})

describe('Cluster replaces the hand-written rows', () => {
  it('a wrapping row, centred on the line (OpenRow, ShowcaseRow: gap 10)', async () => {
    const Legacy = el
      .config({ name: 'OpenRow' })
      .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
      .theme(() => ({ flexWrap: 'wrap' }))
    await expectSame(
      h(Legacy, null, ...kids()),
      <Cluster gap={125} alignY="center">
        {kids()}
      </Cluster>,
      h(Cluster, { gap: 125, alignY: 'center' }, ...kids()),
    )
  })

  it('a list of chips (ReleaseChips, BenchVersions, ShowcaseChips: ul, gap 6)', async () => {
    const Legacy = el
      .config({ name: 'ReleaseChips' })
      .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 6 })
      .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))
    await expectSame(
      h(Legacy, { 'aria-label': 'Chips' }, h('li', null, 'x')),
      <Cluster tag="ul" gap={75} aria-label="Chips">
        <li>x</li>
      </Cluster>,
      h(Cluster, { tag: 'ul', gap: 75, 'aria-label': 'Chips' }, h('li', null, 'x')),
    )
  })

  it('a centred row (ProductEndCtas: gap 12)', async () => {
    const Legacy = el
      .config({ name: 'ProductEndCtas' })
      .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'center', contentAlignY: 'center', gap: 12 })
      .theme(() => ({ flexWrap: 'wrap' }))
    await expectSame(
      h(Legacy, null, ...kids()),
      <Cluster gap={150} alignX="center" alignY="center">
        {kids()}
      </Cluster>,
      h(Cluster, { gap: 150, alignX: 'center', alignY: 'center' }, ...kids()),
    )
  })
})

describe('Text replaces the hand-written mono captions', () => {
  it('a block mono detail line (BenchMono, BenchProductMono: 12px, 1.55, fog)', async () => {
    const Legacy = txt
      .config({ name: 'BenchMono' })
      .attrs({ tag: 'span' })
      .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.55, color: tone(m, 'fog') }))
    await expectSame(
      h(Legacy, null, 'x'),
      <Text variant="mono" tone="fog" leading="detail" block>
        x
      </Text>,
      h(Text, { variant: 'mono', tone: 'fog', leading: 'detail', block: true }, 'x'),
    )
  })

  it('a block package line in the accent (MigrateMono, BenchTally: no line height of its own)', async () => {
    const Legacy = txt
      .config({ name: 'MigrateMono' })
      .attrs({ tag: 'span' })
      .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'accentText') }))
    await expectSame(
      h(Legacy, null, 'x'),
      <Text variant="mono" tone="accentText" block>
        x
      </Text>,
      h(Text, { variant: 'mono', tone: 'accentText', block: true }, 'x'),
    )
  })

  it('an inline mono caption (ProjectMono: 1.6)', async () => {
    const Legacy = txt
      .config({ name: 'ProjectMono' })
      .attrs({ tag: 'span' })
      .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.6, color: tone(m, 'fog') }))
    await expectSame(
      h(Legacy, null, 'x'),
      <Text variant="mono" tone="fog" leading="relaxed">
        x
      </Text>,
      h(Text, { variant: 'mono', tone: 'fog', leading: 'relaxed' }, 'x'),
    )
  })

  it("the home's mono and its uppercase label state (HomeMono default and upper)", async () => {
    const Legacy = txt
      .config({ name: 'HomeMono' })
      .attrs({ tag: 'span' })
      .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 12, lineHeight: 1.5, color: tone(m, 'fog') }))
      .states((_t, m) => ({ default: {}, upper: { fontSize: text.eyebrow.size, letterSpacing: text.eyebrow.tracking, textTransform: 'uppercase', color: tone(m, 'fog') } }))
    await expectSame(
      h(Legacy, null, 'x'),
      <Text variant="mono" tone="fog" leading="normal">
        x
      </Text>,
      h(Text, { variant: 'mono', tone: 'fog', leading: 'normal' }, 'x'),
    )
    await expectSame(
      h(Legacy, { state: 'upper' }, 'x'),
      <Text variant="label" tone="fog" leading="normal">
        x
      </Text>,
      h(Text, { variant: 'label', tone: 'fog', leading: 'normal' }, 'x'),
    )
  })
})

describe('Visible replaces the show/hide blocks', () => {
  it('from the split width (HomeWideOnly) and below it (HomeNarrowOnly)', async () => {
    const Wide = el.config({ name: 'HomeWideOnly' }).attrs({ block: true }).theme(() => ({ extendCss: '@media (max-width: 699.98px) { display: none; }' }))
    const Narrow = el.config({ name: 'HomeNarrowOnly' }).attrs({ block: true }).theme(() => ({ extendCss: '@media (min-width: 700px) { display: none; }' }))
    await expectSame(h(Wide, null, 'w'), <Visible from="split">w</Visible>, h(Visible, { from: 'split' }, 'w'))
    await expectSame(h(Narrow, null, 'n'), <Visible below="split">n</Visible>, h(Visible, { below: 'split' }, 'n'))
  })

  it('on a theme breakpoint (BlogNarrowOnly shape: below lg)', async () => {
    const Legacy = el.config({ name: 'BelowLg' }).attrs({ block: true }).theme(() => ({ extendCss: `@media (min-width: ${breakpoints.lg}px) { display: none; }` }))
    await expectSame(h(Legacy, null, 'n'), <Visible below="lg">n</Visible>, h(Visible, { below: 'lg' }, 'n'))
  })
})

describe('Grid, AutoGrid and Wrap', () => {
  it('Grid: equal columns per breakpoint (HomeProducts: ul, 1 → 6 from lg, gap 12)', async () => {
    const Legacy = el
      .config({ name: 'HomeProducts' })
      .attrs({ tag: 'ul', block: true })
      .theme(() => ({ display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(6, minmax(0, 1fr))' } }))
    const want = await render(h(Legacy, null, h('li', null, 'x')))
    // The legacy theme put the columns and the gap in the rocketstyle layer
    // under unistyle's media; the primitive hands them to Element: compare the
    // properties that decide the layout at each width.
    for (const node of [
      <Grid tag="ul" columns={{ xs: 1, lg: 6 }} gap={150}>
        <li>x</li>
      </Grid>,
      h(Grid, { tag: 'ul', columns: { xs: 1, lg: 6 }, gap: 150 }, h('li', null, 'x')),
    ]) {
      const got = await render(node)
      expect(got.open).toBe(want.open)
      for (const key of ['|display', '|gap', '|list-style', '|margin', '|padding', '|grid-template-columns', '|align-items', '|justify-items']) {
        expect(got.css[key], key).toBe(want.css[key])
      }
      const lg = (r: Rendered) => Object.entries(r.css).find(([k]) => k.endsWith('|grid-template-columns') && k.startsWith('@media'))
      expect(lg(got)).toEqual(lg(want))
    }
  })

  it('AutoGrid: the layout.tsx AutoGrid values, through the typed styles override (min, cols, list)', async () => {
    // The columns and the gap are a typed `styles` override now, so they take
    // the theme's unit rule (px → rem against rootSize 16) and its media
    // queries (em), as a `.theme()` value does; the values are equal at the
    // default root font size.
    const wantMin = { '|gap': '0.75rem', '|grid-template-columns': 'repeat(auto-fit,minmax(min(260px,100%),1fr))' }
    for (const node of [<AutoGrid min={260} gap={150}><li>x</li></AutoGrid>, h(AutoGrid, { min: 260, gap: 150 }, h('li', null, 'x'))]) {
      const got = await render(node)
      for (const [key, value] of Object.entries(wantMin)) expect(got.css[key], key).toBe(value)
    }
    // A list: the reset is a theme flag.
    const gotList = await render(<AutoGrid tag="ul"><li>x</li></AutoGrid>)
    expect(gotList.css['|gap']).toBe('0.875rem')
    expect(gotList.css['|grid-template-columns']).toBe('repeat(auto-fit,minmax(min(250px,100%),1fr))')
    for (const key of ['|list-style', '|margin', '|padding']) expect(gotList.css[key], key).toBeDefined()
    // `cols`: one column below lg, the count from the theme's lg breakpoint (992px = 62em).
    const gotCols = await render(<AutoGrid cols={3}><i>x</i></AutoGrid>)
    expect(gotCols.css['|grid-template-columns']).toBe('repeat(1,minmax(0,1fr))')
    expect(gotCols.css[`@media only screen and (min-width: ${breakpoints.lg / 16}em)|grid-template-columns`]).toBe('repeat(3,minmax(0,1fr))')
  })

  it('Wrap: the coolgrid column with the layout gutters, as before', async () => {
    // layout.tsx's Wrap, verbatim (it moved to primitives/wrap.tsx unchanged).
    function LegacyWrap(props: { children?: VNodeChild }) {
      return (
        <Container
          width={layout.maxWidth}
          css={{
            xs: `padding-left:${layout.gutter.xs}px;padding-right:${layout.gutter.xs}px;`,
            md: `padding-left:${layout.gutter.md}px;padding-right:${layout.gutter.md}px;`,
          }}
        >
          {props.children}
        </Container>
      )
    }
    sheet.reset()
    const a = await renderToString(h(PyreonUI, { theme: siteTheme, mode: 'dark' }, <LegacyWrap>x</LegacyWrap>))
    sheet.reset()
    const b = await renderToString(h(PyreonUI, { theme: siteTheme, mode: 'dark' }, <Wrap>x</Wrap>))
    expect(b).toBe(a)
  })
})

describe('Box and Icon', () => {
  it('Box: padding from the space scale; the specific side wins within a breakpoint', async () => {
    const r = await render(<Box pad={200} padTop={225} padX={{ xs: 150, md: 500 }}>x</Box>)
    // A typed `styles` override: unistyle folds the sides into the `padding`
    // shorthand (top, x, bottom) and renders px as rem (rootSize 16).
    expect(r.css['|padding']).toBe('1.125rem 0.75rem 1rem')
    expect(Object.entries(r.css).some(([k, v]) => k.startsWith('@media') && k.endsWith('|padding') && v === '1.125rem 2.5rem 1rem')).toBe(true)
    expect(r.css['|align-items']).toBe('stretch')
    expect(r.css['|margin']).toBeUndefined()
  })

  it('Icon: decorative with aria-hidden, an image with a name with aria-label (compiled and h())', async () => {
    const path = () => h('path', { d: 'M0 0h1' })
    for (const html of [await renderToString(<Icon size={16} aria-hidden="true">{path()}</Icon>), await renderToString(h(Icon, { size: 16, 'aria-hidden': 'true' }, path()))]) {
      expect(html).toBe('<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M0 0h1"></path></svg>')
    }
    for (const html of [await renderToString(<Icon size={24} box={24} aria-label="Next">{path()}</Icon>), await renderToString(h(Icon, { size: 24, box: 24, 'aria-label': 'Next' }, path()))]) {
      expect(html).toContain('role="img"')
      expect(html).toContain('aria-label="Next"')
      expect(html).toContain('viewBox="0 0 24 24"')
      expect(html).not.toContain('aria-hidden')
    }
  })
})

describe('no primitive sets an outer margin', () => {
  it.each([
    ['Stack', () => <Stack gap={200}>x</Stack>],
    ['Cluster', () => <Cluster gap={200}>x</Cluster>],
    ['Box', () => <Box pad={200}>x</Box>],
    ['Grid', () => <Grid columns={2} gap={200}>x</Grid>],
    ['AutoGrid', () => <AutoGrid>x</AutoGrid>],
    ['Visible', () => <Visible from="md">x</Visible>],
    ['Text', () => <Text variant="body">x</Text>],
  ] as const)('%s', async (_name, node) => {
    const r = await render(node())
    const margins = Object.entries(r.css).filter(([k, v]) => /\|margin/.test(k) && v !== '0' && v !== '0px')
    expect(margins).toEqual([])
  })
})
