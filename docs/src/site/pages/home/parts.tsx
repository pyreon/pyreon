import { el, focusRing, pair, tone, txt, type LinkAttrs } from '../../kit/bases'
import { breakpoints, font, radius, syntax, text, weight } from '../../theme'

/**
 * Styled pieces of the homepage that no other page uses (server-rendered
 * kit components; the page is static HTML).
 */

/** Cards in a row share one height (the grid stretches the item; the card fills it). */
const equalCards = '& > li { display: flex; } & > li > * { flex: 1 1 auto; min-width: 0; }'

/** Two columns from 960px (`.split` / `.once`): text left, the visual right. */
export const Split = el
  .config({ name: 'HomeSplit' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    gap: { xs: 40, lg: 64 },
    alignItems: 'start',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 1fr)' },
  }))

export const Stack = el
  .config({ name: 'HomeStack' })
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  // Content height: a card inside must not stretch to the other column.
  .theme(() => ({ alignSelf: 'start', minWidth: 0 }))
  .sizes(() => ({ sm: { gap: 12 }, md: { gap: 22 }, lg: { gap: 32 } }))

/** The hero visual: the source file beside the three-platform loop (≥ 700px only). */
export const TargetsGrid = el
  .config({ name: 'HomeTargets' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'none',
    marginTop: 64,
    extendCss: `
      @media (min-width: 700px) { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); }
      @media (min-width: ${breakpoints.lg}px) { grid-template-columns: minmax(0, 300px) minmax(0, 1fr); align-items: start; }
    `,
  }))

/** Below 700px the hero shows the trace animation instead of the targets. */
export const PhoneOnly = el
  .config({ name: 'HomePhoneOnly' })
  .attrs({ block: true })
  .theme(() => ({ marginTop: 40, extendCss: '@media (min-width: 700px) { display: none; }' }))

/** The platforms section carries the loop on phones (the hero hides it). */
export const PhoneLoop = el
  .config({ name: 'HomePhoneLoop' })
  .attrs({ block: true })
  .theme(() => ({ marginTop: 32, extendCss: '@media (min-width: 700px) { display: none; }' }))

/** Code pane: file label row + highlighted code (no card padding). */
export const Pane = el
  .config({ name: 'HomePane' })
  .attrs({ block: true, contentAlignX: 'block' })
  .theme((_t, m) => ({
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: m(syntax.light.bg, syntax.dark.bg),
  }))

export const PaneHead = el
  .config({ name: 'HomePaneHead' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 12 })
  .theme((_t, m) => ({
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 16,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: 11.5,
    color: tone(m, 'fog'),
    flexWrap: 'wrap',
  }))

/** The labels under the loop: one per third, real text (not in the video). */
export const TargetLabels = el
  .config({ name: 'HomeTargetLabels' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, listStyle: 'none', margin: 0, marginTop: 14, padding: 0, textAlign: 'center' }))

export const TargetLabel = el
  .config({ name: 'HomeTargetLabel' })
  .attrs({ tag: 'li', block: true, gap: 4 })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 12, color: tone(m, 'text') }))

export const Mono = txt
  .config({ name: 'HomeMono' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 12, lineHeight: 1.5, color: tone(m, 'fog') }))
  .states((_t, m) => ({ default: {}, upper: { fontSize: text.eyebrow.size, letterSpacing: text.eyebrow.tracking, textTransform: 'uppercase', color: tone(m, 'fog') } }))

export const Note = txt
  .config({ name: 'HomeNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 14, fontFamily: font.sans, fontSize: text.caption.size, lineHeight: text.caption.lineHeight, color: tone(m, 'fog') }))

/** `.bench` — the verdict list beside the counter. */
export const BenchList = el
  .config({ name: 'HomeBenchList' })
  .attrs({ tag: 'ul', block: true })
  .theme((_t, m) => ({ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid', borderColor: tone(m, 'line') }))

export const BenchRow = el
  .config({ name: 'HomeBenchRow' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '4px 14px',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 14,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.sans,
    fontSize: text.small.size,
    color: tone(m, 'mist'),
  }))

export const Strong = txt.config({ name: 'HomeStrong' }).attrs({ tag: 'b' }).theme((_t, m) => ({ fontWeight: weight.medium, color: tone(m, 'text') }))

/** Five proof cards in a row from 1200px, two below, one on phones. */
export const StripGrid = el
  .config({ name: 'HomeStrip' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    display: 'grid',
    gap: 12,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' },
    extendCss: equalCards,
  }))

/** The comparison table's scroll region (it scrolls inside itself, never the page). */
export const TableBox = el
  .config({ name: 'HomeTableBox' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    overflowX: 'auto',
    borderRadius: radius.card,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    focus: focusRing(m),
  }))

/** Cell styles of the comparison table. */
const tableCss = (m: Parameters<typeof tone>[0]) => `
  th, td { text-align: left; vertical-align: top; padding: 14px 16px; border-top: 1px solid ${tone(m, 'line')}; }
  thead th { border-top: none; font-weight: ${weight.medium}; color: ${tone(m, 'text')}; }
  tbody th { font-weight: 400; color: ${tone(m, 'mist')}; }
  td { color: ${tone(m, 'mist')}; }
  .us { color: ${tone(m, 'strong')}; background: ${tone(m, 'currentFill')}; }
  thead .us { color: ${tone(m, 'accent')}; }
  .behind td.us { color: ${tone(m, 'warn')}; }
`

export const CompareTable = el
  .config({ name: 'HomeCompareTable' })
  .attrs({ tag: 'table' })
  .theme((_t, m) => ({
    // Element lays itself out as flex; a table must stay a table.
    display: 'table',
    width: '100%',
    minWidth: 760,
    borderCollapse: 'collapse',
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: 1.45,
    extendCss: tableCss(m),
  }))

/** Below 700px the comparison is a list of cards, one per column (no sideways scroll to read a row). */
export const WideOnly = el.config({ name: 'HomeWideOnly' }).attrs({ block: true }).theme(() => ({ extendCss: '@media (max-width: 699.98px) { display: none; }' }))
export const NarrowOnly = el.config({ name: 'HomeNarrowOnly' }).attrs({ block: true }).theme(() => ({ extendCss: '@media (min-width: 700px) { display: none; }' }))

export const DefList = el
  .config({ name: 'HomeDefList' })
  .attrs({ tag: 'dl', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
    gap: '10px 14px',
    margin: 0,
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: 1.45,
    color: tone(m, 'mist'),
    extendCss: `dt { color: ${tone(m, 'fog')}; } dd { margin: 0; } .behind { color: ${tone(m, 'warn')}; }`,
  }))

export const MapTable = el
  .config({ name: 'HomeMapTable' })
  .attrs({ tag: 'table' })
  .theme((_t, m) => ({
    display: 'table',
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: font.mono,
    fontSize: 12.5,
    extendCss: `
      th { text-align: left; padding: 8px 10px 8px 0; font-weight: ${text.eyebrow.weight}; font-size: ${text.eyebrow.size}px; letter-spacing: ${text.eyebrow.tracking}; text-transform: uppercase; color: ${tone(m, 'fog')}; }
      td { padding: 11px 10px 11px 0; border-top: 1px solid ${tone(m, 'line')}; color: ${tone(m, 'mist')}; }
      td:first-child { color: ${pair(m, { dark: syntax.dark.type, light: syntax.light.type })}; white-space: nowrap; }
      @media (max-width: 479.98px) { & { font-size: 11px; } th { letter-spacing: .08em; } }
    `,
  }))

/** `.ticks` — bullet points with an ember dash. */
export const Ticks = el
  .config({ name: 'HomeTicks' })
  .attrs({ tag: 'ul', block: true, gap: 10 })
  .theme((_t, m) => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: text.small.lineHeight,
    color: tone(m, 'mist'),
    extendCss: `li { position: relative; padding-left: 22px; } li::before { content: ''; position: absolute; left: 0; top: .72em; width: 10px; height: 2px; border-radius: 2px; background: ${tone(m, 'accent')}; }`,
  }))

/** The finding line under the AI example (what `validate` prints). */
export const Finding = txt
  .config({ name: 'HomeFinding' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: 1.5,
    color: tone(m, 'mist'),
    overflowWrap: 'anywhere',
  }))

/** Tags under an audience card: small mono pills that link to the product. */
export const TagLink = el
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
    hover: { color: tone(m, 'text'), borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))

export const Row = el.config({ name: 'HomeRow' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 }).theme(() => ({ flexWrap: 'wrap' }))

/** Featured products: 6 columns, each card spans 6 (full), 3 (half) or 2 (third) from 960px. */
export const ProductsGrid = el
  .config({ name: 'HomeProducts' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    display: 'grid',
    gap: 12,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(6, minmax(0, 1fr))' },
  }))

export const ProductCell = el
  .config({ name: 'HomeProductCell' })
  .attrs({ tag: 'li', block: true, contentAlignX: 'block' })
  .theme(() => ({ extendCss: '& > * { flex: 1 1 auto; }' }))
  .sizes(() => ({
    full: { gridColumn: { lg: 'span 6' } },
    half: { gridColumn: { lg: 'span 3' } },
    third: { gridColumn: { lg: 'span 2' } },
  }))

/** `.compat` — the five compat layer tiles. */
export const CompatGrid = el
  .config({ name: 'HomeCompat' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    display: 'grid',
    gap: 12,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' },
    extendCss: equalCards,
  }))

/** `.term` — the reproduce command, one `$` line per step. */
export const Terminal = el
  .config({ name: 'HomeTerminal' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    position: 'relative',
    minWidth: 0,
    overflowX: 'auto',
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: 20,
    paddingRight: 20,
    borderRadius: radius.pane,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: m(syntax.light.bg, syntax.dark.bg),
    fontFamily: font.mono,
    fontSize: { xs: 12, md: 13 },
    lineHeight: 1.85,
    color: m(syntax.light.fg, syntax.dark.fg),
    focus: focusRing(m),
    extendCss: 'font-variant-ligatures: none; white-space: pre;',
  }))

export const Prompt = txt.config({ name: 'HomePrompt' }).attrs({ tag: 'span', 'aria-hidden': 'true' }).theme((_t, m) => ({ color: tone(m, 'prompt'), marginRight: 10 }))

export const TermFoot = el.config({ name: 'HomeTermFoot' }).attrs({ block: true, contentDirection: 'inline', contentAlignX: 'right' }).theme(() => ({ marginTop: 12 }))

/** Status column label: dot + mono label in the status colour. */
export const StatusLabel = txt
  .config({ name: 'HomeStatusLabel' })
  .attrs({ tag: 'span' })
  .theme(() => ({ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: font.mono, fontSize: text.eyebrow.size, letterSpacing: text.eyebrow.tracking, textTransform: 'uppercase' }))
  .states((_t, m) => ({ ok: { color: tone(m, 'ok') }, warn: { color: tone(m, 'warn') } }))

export const Bullets = el
  .config({ name: 'HomeBullets' })
  .attrs({ tag: 'ul', block: true, gap: 6 })
  .theme((_t, m) => ({ margin: 0, paddingLeft: 18, fontFamily: font.sans, fontSize: text.small.size, lineHeight: text.small.lineHeight, color: tone(m, 'mist') }))

export const CardNum = txt.config({ name: 'HomeCardNum' }).attrs({ tag: 'span' }).theme((_t, m) => ({ fontFamily: font.mono, fontSize: 11.5, color: tone(m, 'accent') }))

export const Arrow = txt.config({ name: 'HomeArrow' }).attrs({ tag: 'span', 'aria-hidden': 'true' }).theme((_t, m) => ({ color: tone(m, 'accent'), marginLeft: 'auto' }))

/** The chart under a proof number (theme-aware inline SVG). */
export const ChartSlot = el.config({ name: 'HomeChartSlot' }).attrs({ block: true }).theme(() => ({ marginTop: 14, maxWidth: 420 }))

/** A proof card's label (`.strip .l`). */
export const StripLabel = txt
  .config({ name: 'HomeStripLabel' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({ margin: 0, marginTop: 10, fontFamily: font.sans, fontSize: 15, lineHeight: 1.35, fontWeight: weight.medium, color: tone(m, 'strong') }))
