import { For } from '@pyreon/core'
import type { SiteSection } from '../content/types-site'
import { el, focusRing, tone, txt, type LinkAttrs } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { AutoGrid, SectionHead } from '../kit/layout'
import { InlineText } from '../kit/story'
import { Eyebrow, Heading, Lede, renderInline } from '../kit/type'
import { font, radius, text, weight } from '../theme'

/**
 * The brand page's own section kinds (`logos`, `palette`, `type`, `dodont`).
 * Colours here are DATA: each swatch and logo tile is painted with the hex the
 * content set gives it (the brand's own palette), not with a site token.
 */
export type BrandSectionData = Extract<SiteSection, { kind: 'logos' | 'palette' | 'type' | 'dodont' }>

export const isBrandSection = (s: SiteSection): s is BrandSectionData =>
  s.kind === 'logos' || s.kind === 'palette' || s.kind === 'type' || s.kind === 'dodont'

const Tile = el
  .config({ name: 'BrandLogoTile' })
  .attrs({ block: true, contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({ height: 150, borderRadius: radius.tile, border: '1px solid', borderColor: tone(m, 'line'), marginBottom: 6 }))

const Download = el
  .config({ name: 'BrandDownload' })
  .attrs<LinkAttrs & { download?: string | boolean | undefined }>({ tag: 'a' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'link'),
    textDecoration: 'underline',
    borderRadius: 2,
    extendCss: 'text-underline-offset: 3px;',
    focus: focusRing(m),
  }))

const Swatch = el
  .config({ name: 'BrandSwatch' })
  .attrs({ block: true, 'aria-hidden': 'true' })
  .theme((_t, m) => ({ height: 88, borderRadius: radius.note, border: '1px solid', borderColor: tone(m, 'line'), marginBottom: 10 }))

const Hex = txt
  .config({ name: 'BrandHex' })
  .attrs({ tag: 'code' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'text') }))

const Sample = txt
  .config({ name: 'BrandTypeSample' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontSize: 40, lineHeight: 1.1, letterSpacing: '-.03em', color: tone(m, 'strong'), overflowWrap: 'anywhere' }))

const Weights = el
  .config({ name: 'BrandWeights' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 14 })
  .theme((_t, m) => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0, color: tone(m, 'mist'), fontSize: 18 }))

const DoDont = el
  .config({ name: 'BrandDoDont' })
  .attrs({ tag: 'li', block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gap: '8px 24px',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.7fr)' },
    paddingTop: 16,
    paddingBottom: 16,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontSize: text.small.size,
    lineHeight: text.small.lineHeight,
    color: tone(m, 'mist'),
  }))

const DoDontList = el
  .config({ name: 'BrandDoDontList' })
  .attrs({ tag: 'ul', block: true })
  .theme((_t, m) => ({ listStyle: 'none', margin: 0, padding: 0, borderTop: '1px solid', borderColor: tone(m, 'line') }))

const Verdict = txt
  .config({ name: 'BrandDoDontLabel' })
  .attrs({ tag: 'b' })
  .theme(() => ({ display: 'block', fontFamily: font.mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: weight.medium, marginBottom: 4 }))
  .states((_t, m) => ({ ok: { color: tone(m, 'ok') }, err: { color: tone(m, 'err') }, why: { color: tone(m, 'fog') } }))

const Bar = el
  .config({ name: 'BrandGradient' })
  .attrs({ block: true, 'aria-hidden': 'true' })
  .theme(() => ({ height: 64, borderRadius: radius.note, marginTop: 18, marginBottom: 10 }))

const fileName = (href: string) => href.slice(href.lastIndexOf('/') + 1)

export function BrandSection(props: { s: BrandSectionData }) {
  const s = props.s
  switch (s.kind) {
    case 'logos':
      return (
        <>
          <SectionHead label="logo" title={s.title} text={s.text} />
          <AutoGrid min={230} gap={12}>
            <For each={s.items} by={(i) => i.href}>
              {(i) => (
                <GlowCard padding="compact">
                  <Tile style={`background:${i.background}`}>
                    <img src={i.href} alt="" width={72} height={72} loading="lazy" decoding="async" />
                  </Tile>
                  <Lede size="small">{renderInline(i.use)}</Lede>
                  <Download href={i.href} download={fileName(i.href)} data-allow-reload="">
                    {`Download ${i.file}`}
                  </Download>
                </GlowCard>
              )}
            </For>
          </AutoGrid>
        </>
      )
    case 'palette':
      return (
        <>
          <SectionHead label="colour" title={s.title} text={s.text} />
          <AutoGrid min={170} gap={12} tag="ul">
            <For each={s.swatches} by={(w) => w.hex + w.name}>
              {(w) => (
                <li>
                  <Swatch style={`background:${w.hex}`} />
                  <Heading tag="h3" size="step">
                    {w.name}
                  </Heading>
                  <Hex>{w.hex}</Hex>
                  <Lede size="small">{w.role}</Lede>
                </li>
              )}
            </For>
          </AutoGrid>
          <Bar style={`background:${s.gradient.css}`} />
          <Eyebrow>{s.gradient.name}</Eyebrow>
          <Lede size="small">
            <Hex>{s.gradient.css}</Hex>
          </Lede>
          <Lede size="small">{s.gradient.role}</Lede>
        </>
      )
    case 'type':
      return (
        <>
          <SectionHead label="type" title={s.title} />
          <AutoGrid min={300} gap={12}>
            <For each={s.faces} by={(f) => f.name}>
              {(f) => (
                <GlowCard>
                  <Eyebrow>{f.name}</Eyebrow>
                  <Sample style={`font-family:'${f.name}', ${f.name.includes('Mono') ? font.mono : font.sans}`}>Signals in. Updates out.</Sample>
                  <Weights aria-label="Weights">
                    <For each={f.weights} by={(w) => w}>
                      {(w) => <li style={`font-family:'${f.name}', ${f.name.includes('Mono') ? font.mono : font.sans};font-weight:${w}`}>{String(w)}</li>}
                    </For>
                  </Weights>
                  <Lede size="small">{renderInline(f.role)}</Lede>
                  <Download href={f.href} rel="noopener">{`${f.name} on Google Fonts`}</Download>
                </GlowCard>
              )}
            </For>
          </AutoGrid>
        </>
      )
    case 'dodont':
      return (
        <>
          <SectionHead label="usage" title={s.title} />
          <DoDontList>
            <For each={s.items} by={(i) => i.do}>
              {(i) => (
                <DoDont>
                  <InlineText>
                    <Verdict state="ok">Do</Verdict>
                    {renderInline(i.do)}
                  </InlineText>
                  <InlineText>
                    <Verdict state="err">Don't</Verdict>
                    {renderInline(i.dont)}
                  </InlineText>
                  <InlineText>
                    <Verdict state="why">Why</Verdict>
                    {renderInline(i.why)}
                  </InlineText>
                </DoDont>
              )}
            </For>
          </DoDontList>
        </>
      )
    default: {
      const never: never = s
      return never
    }
  }
}
