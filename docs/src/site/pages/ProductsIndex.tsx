import { For, Show } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import productsJson from '../content/_products.json'
import type { ProductsIndexPage } from '../content/types-site'
import { el, tone, txt } from '../kit/bases'
import { GlowCard, Glyph } from '../kit/cards'
import { InstallCommand } from '../kit/controls'
import { inlineText } from '../kit/inline'
import { AutoGrid, Section, Wrap } from '../kit/layout'
import { Numeral, TextLink } from '../kit/proof'
import { Eyebrow, Heading, Lede, renderInline, StatusBadge } from '../kit/type'
import { font, text } from '../theme'

/** `/products` — every product, grouped (`content/_products.json`). */
const DATA = productsJson as unknown as ProductsIndexPage

const CardTop = el.config({ name: 'ProductCardTop' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })

const Tile = el
  .config({ name: 'ProductCardTile' })
  .attrs({ contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 12,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    color: tone(m, 'text'),
  }))

const Pkg = txt
  .config({ name: 'ProductCardPackage' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: 11.5, color: tone(m, 'accentText'), overflowWrap: 'anywhere' }))

const ProofLine = txt
  .config({ name: 'ProductCardProof' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: 13.5, lineHeight: 1.5, color: tone(m, 'mist') }))

const Caveat = txt
  .config({ name: 'ProductCardCaveat' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.mono, fontSize: text.caveat.size, lineHeight: 1.5, color: tone(m, 'fog') }))

const Group = el.config({ name: 'ProductGroup' }).attrs({ tag: 'section', block: true, gap: 22 }).theme(() => ({ marginBottom: 72 }))

const EndBox = el.config({ name: 'ProductsEnd' }).attrs({ block: true, contentAlignX: 'center', gap: 16 }).theme(() => ({ textAlign: 'center' }))

const Footnote = txt
  .config({ name: 'ProductsFootnote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 8, fontFamily: font.mono, fontSize: text.caveat.size, color: tone(m, 'fog') }))

export function ProductsIndex() {
  const byId = new Map(DATA.products.map((p) => [p.id, p]))
  useHead({
    title: `${DATA.hero.title} · Pyreon`,
    meta: [{ name: 'description', content: inlineText(DATA.hero.lede) }],
  })
  return (
    <>
      <Section size="hero">
        <Wrap>
          <Eyebrow>{DATA.hero.eyebrow}</Eyebrow>
          <Heading tag="h1" size="hero">
            {DATA.hero.title}
          </Heading>
          <Lede size="hero">{renderInline(DATA.hero.lede)}</Lede>
        </Wrap>
      </Section>
      <Section size="tight">
        <Wrap>
          <For each={DATA.groups} by={(g) => g.id}>
            {(g) => (
              <Group aria-labelledby={`group-${g.id}`}>
                <div>
                  <Heading tag="h2" size="card" id={`group-${g.id}`}>
                    {g.title}
                  </Heading>
                  <Lede size="small">{renderInline(g.text)}</Lede>
                </div>
                <AutoGrid min={280} tag="ul">
                  <For each={g.productIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))} by={(p) => p.id}>
                    {(p) => (
                      <li>
                        <GlowCard href={p.href} padding="compact" state={p.proof ? 'hot' : 'default'}>
                          <CardTop>
                            <Tile>
                              <Glyph id={p.id} size={22} />
                            </Tile>
                            <div>
                              <Heading tag="h3" size="step" style="margin:0">
                                {p.name}
                                {p.status ? <StatusBadge>{p.status}</StatusBadge> : null}
                              </Heading>
                              <Pkg>{p.package}</Pkg>
                            </div>
                          </CardTop>
                          <Lede size="small">{renderInline(p.pitch)}</Lede>
                          <Show when={() => !!p.proof}>
                            <div>
                              <Numeral tag="span" size="strip">
                                {p.proof?.stat}
                              </Numeral>
                              <ProofLine>{renderInline(p.proof?.label ?? '')}</ProofLine>
                              <Caveat>{p.proof?.condition}</Caveat>
                            </div>
                          </Show>
                        </GlowCard>
                      </li>
                    )}
                  </For>
                </AutoGrid>
              </Group>
            )}
          </For>
          <Lede size="card">
            {renderInline(DATA.underneath.text)} <TextLink href={DATA.underneath.link.href}>{DATA.underneath.link.label}</TextLink>
          </Lede>
          <Footnote>
            {DATA.proofFooter} <TextLink href={DATA.proofFooterLink.href}>{DATA.proofFooterLink.label}</TextLink>
          </Footnote>
        </Wrap>
      </Section>
      <Section size="end">
        <Wrap>
          <EndBox>
            <Heading tag="h2" size="end">
              {DATA.end.title}
            </Heading>
            <Lede size="section">{renderInline(DATA.end.text)}</Lede>
            <Eyebrow>{DATA.end.primary.label}</Eyebrow>
            <InstallCommand command={DATA.end.primary.command} variant="hot" />
            <Eyebrow>{DATA.end.secondary.label}</Eyebrow>
            <InstallCommand command={DATA.end.secondary.command} />
            <TextLink href={DATA.end.tertiary.href}>{DATA.end.tertiary.label}</TextLink>
          </EndBox>
        </Wrap>
      </Section>
    </>
  )
}
