import { For } from '@pyreon/core'
import { clampSize, display, font, gradient, radius, text, weight } from '../theme'
import { el, pair, tone, txt } from './bases'
import { GlowCard } from './cards'
import { AutoGrid } from './layout'
import { Eyebrow, Heading, Lede, renderInline } from './type'

// ─── FactList ─────────────────────────────────────────────────────────────

const FactsBox = el
  .config({ name: 'FactList' })
  .attrs({ tag: 'dl', block: true })
  .theme((_t, m) => ({ margin: 0, borderTop: '1px solid', borderColor: tone(m, 'line') }))

const FactRow = el
  .config({ name: 'FactRow' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: '112px minmax(0, 1fr)',
    gap: 16,
    paddingTop: 15,
    paddingBottom: 15,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontSize: text.small.size,
  }))

const FactKey = el
  .config({ name: 'FactKey' })
  .attrs({ tag: 'dt' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: text.eyebrowTight.size,
    letterSpacing: text.eyebrowTight.tracking,
    textTransform: 'uppercase',
    color: tone(m, 'fog'),
    paddingTop: 3,
  }))

const FactValue = el
  .config({ name: 'FactValue' })
  .attrs({ tag: 'dd' })
  .theme((_t, m) => ({ margin: 0, color: tone(m, 'text'), fontFamily: font.sans, minWidth: 0, overflowWrap: 'break-word' }))

/** `.p-facts` — key/value rows (a `<dl>`). Values use the inline grammar. */
export function FactList(props: { facts: readonly { key: string; value: string }[] }) {
  return (
    <FactsBox>
      <For each={props.facts} by={(f) => f.key}>
        {(f) => (
          <FactRow>
            <FactKey>{f.key}</FactKey>
            <FactValue>{renderInline(f.value)}</FactValue>
          </FactRow>
        )}
      </For>
    </FactsBox>
  )
}

// ─── NumberedCards ────────────────────────────────────────────────────────

const CardBody = el.config({ name: 'NumberedCardBody' }).attrs({ block: true, gap: 12 }).theme(() => ({ minHeight: 156 }))

/** `.p-why` — numbered cards, auto-fit (min 250px); the first is `hot`. */
export function NumberedCards(props: { items: readonly { title: string; text: string }[] }) {
  const items = props.items.map((it, i) => ({ ...it, i }))
  return (
    <AutoGrid min={250} tag="ol">
      <For each={items} by={(it) => it.i}>
        {(it) => (
          <li>
            <GlowCard state={it.i === 0 ? 'hot' : 'default'}>
              <CardBody>
                <Eyebrow state="accent" aria-hidden="true">
                  {String(it.i + 1).padStart(2, '0')}
                </Eyebrow>
                <Heading tag="h3" size="card">
                  {it.title}
                </Heading>
                <Lede size="card">{renderInline(it.text)}</Lede>
              </CardBody>
            </GlowCard>
          </li>
        )}
      </For>
    </AutoGrid>
  )
}

/** `.p-steps` — numbered step cards in three columns. */
export function StepCards(props: { items: readonly { title: string; text: string }[] }) {
  const items = props.items.map((it, i) => ({ ...it, i }))
  return (
    <AutoGrid cols={3} tag="ol">
      <For each={items} by={(it) => it.i}>
        {(it) => (
          <li>
            <GlowCard state={it.i === 0 ? 'hot' : 'default'}>
              <Eyebrow state="accent">{`step ${it.i + 1}`}</Eyebrow>
              <Heading tag="h3" size="step">
                {it.title}
              </Heading>
              <Lede size="card">{renderInline(it.text)}</Lede>
            </GlowCard>
          </li>
        )}
      </For>
    </AutoGrid>
  )
}

// ─── FeatureList ──────────────────────────────────────────────────────────

const FeatureBox = el
  .config({ name: 'FeatureList' })
  .attrs({ tag: 'ul', block: true })
  .theme((_t, m) => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' },
    columnGap: 56,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const FeatureRow = txt
  .config({ name: 'FeatureRow' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({
    display: 'grid',
    gridTemplateColumns: '30px minmax(0, 1fr)',
    paddingTop: 16,
    paddingBottom: 16,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.sans,
    fontSize: text.body.size,
    lineHeight: 1.55,
    fontWeight: weight.regular,
    color: tone(m, 'mist'),
  }))

const FeaturePlus = txt
  .config({ name: 'FeaturePlus' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({ color: tone(m, 'accent'), fontFamily: font.mono }))

const FeatureName = txt
  .config({ name: 'FeatureName' })
  .attrs({ tag: 'b' })
  .theme((_t, m) => ({ color: tone(m, 'text'), fontWeight: weight.regular }))

/** `.p-feat` — two-column "+" list. */
export function FeatureList(props: { items: readonly { name: string; text: string }[] }) {
  return (
    <FeatureBox>
      <For each={props.items} by={(f) => f.name}>
        {(f) => (
          <FeatureRow>
            <FeaturePlus>+</FeaturePlus>
            <span>
              <FeatureName>{renderInline(f.name)}</FeatureName>
              {f.text ? ' ' : ''}
              {renderInline(f.text)}
            </span>
          </FeatureRow>
        )}
      </For>
    </FeatureBox>
  )
}

// ─── ApiGroups ────────────────────────────────────────────────────────────

const ChipRow = el
  .config({ name: 'ApiChips' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const GroupBox = el.config({ name: 'ApiGroup' }).attrs({ block: true, gap: 10 })
const GroupsBox = el.config({ name: 'ApiGroups' }).attrs({ block: true, gap: 22 })

const ApiChip = txt
  .config({ name: 'ApiChip' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({
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
  }))

/** `.p-api` — exports grouped by role, as mono chips. */
export function ApiGroups(props: { groups: readonly { name: string; items: readonly string[] }[] }) {
  return (
    <GroupsBox>
      <For each={props.groups} by={(g) => g.name}>
        {(g) => (
          <GroupBox>
            <Eyebrow>{`${g.name} · ${g.items.length}`}</Eyebrow>
            <ChipRow aria-label={g.name}>
              <For each={g.items} by={(x) => x}>
                {(x) => <ApiChip>{x}</ApiChip>}
              </For>
            </ChipRow>
          </GroupBox>
        )}
      </For>
    </GroupsBox>
  )
}

// ─── LimitNote ────────────────────────────────────────────────────────────

const LimitBox = el
  .config({ name: 'LimitNote' })
  .attrs({ block: true, gap: 4 })
  .theme((_t, m) => ({
    height: '100%',
    paddingTop: 18,
    paddingBottom: 18,
    paddingLeft: 20,
    paddingRight: 20,
    border: '1px dashed',
    borderColor: tone(m, 'line2'),
    borderRadius: radius.note,
  }))

const LimitTitle = txt
  .config({ name: 'LimitTitle' })
  .attrs({ tag: 'h3' })
  .theme((_t, m) => ({
    margin: 0,
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: text.small.lineHeight,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
  }))

/** `.p-lim` — a dashed "good to know" note. Honest limits are part of the pitch. */
export function LimitNote(props: { title: string; text: string }) {
  return (
    <LimitBox>
      <LimitTitle>{props.title}</LimitTitle>
      <Lede size="small">{renderInline(props.text)}</Lede>
    </LimitBox>
  )
}

// ─── StatRow ──────────────────────────────────────────────────────────────

const StatsBox = el
  .config({ name: 'StatRow' })
  .attrs({ tag: 'dl', block: true })
  .theme((_t, m) => ({
    margin: 0,
    display: 'grid',
    gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
    borderTop: '1px solid',
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
  }))

const StatCell = el
  .config({ name: 'StatCell' })
  .attrs({ block: true, gap: 6, contentAlignY: 'top' })
  .theme(() => ({ paddingTop: 26, paddingBottom: 26, paddingRight: 20, minWidth: 0 }))

/** Big ember-gradient numerals. The gradient is for large display text only. */
export const StatValue = el
  .config({ name: 'StatValue' })
  .attrs({ tag: 'dd' })
  .theme((_t, m) => ({
    margin: 0,
    order: 0,
    fontFamily: font.sans,
    fontSize: clampSize(display.stat),
    lineHeight: 1.05,
    fontWeight: weight.medium,
    letterSpacing: display.stat.tracking,
    backgroundImage: pair(m, gradient.ember),
    backgroundClip: 'text',
    color: 'transparent',
    extendCss: '-webkit-background-clip: text; font-variant-numeric: tabular-nums;',
  }))

const StatLabel = el
  .config({ name: 'StatLabel' })
  .attrs({ tag: 'dt' })
  .theme((_t, m) => ({
    order: 1,
    fontFamily: font.sans,
    fontSize: text.ui.size,
    lineHeight: 1.5,
    color: tone(m, 'fog'),
  }))

/** `.p-times` / `.bh-stats` — gradient numbers with captions (a `<dl>`; the number reads first). */
export function StatRow(props: { stats: readonly { value: string; label: string }[] }) {
  return (
    <StatsBox>
      <For each={props.stats} by={(s) => s.label}>
        {(s) => (
          <StatCell>
            <StatLabel>{s.label}</StatLabel>
            <StatValue>{s.value}</StatValue>
          </StatCell>
        )}
      </For>
    </StatsBox>
  )
}

// ─── Section-level helpers used by product pages ──────────────────────────

/** A labelled list of `{ q, a }` pairs as native disclosure widgets. */
const FaqItem = el
  .config({ name: 'FaqItem' })
  .attrs({ tag: 'details', block: true })
  .theme((_t, m) => ({
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    paddingTop: 18,
    paddingBottom: 18,
  }))

const FaqQuestion = txt
  .config({ name: 'FaqQuestion' })
  .attrs({ tag: 'summary' })
  .theme((_t, m) => ({
    cursor: 'pointer',
    fontFamily: font.sans,
    fontSize: 17,
    lineHeight: 1.45,
    fontWeight: weight.medium,
    color: tone(m, 'text'),
    borderRadius: 4,
    focus: { outlineWidth: '2px', outlineStyle: 'solid', outlineColor: tone(m, 'focus'), outlineOffset: '4px' },
  }))

const FaqAnswer = txt
  .config({ name: 'FaqAnswer' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    marginTop: 10,
    marginBottom: 0,
    maxWidth: 720,
    fontFamily: font.sans,
    fontSize: text.body.size,
    lineHeight: text.body.lineHeight,
    fontWeight: weight.regular,
    color: tone(m, 'mist'),
  }))

const FaqList = el
  .config({ name: 'FaqList' })
  .attrs({ block: true })
  .theme((_t, m) => ({ borderTop: '1px solid', borderColor: tone(m, 'line'), maxWidth: 860 }))

/** Questions a sceptical developer asks, answered plainly (`<details>`). */
export function Faq(props: { items: readonly { q: string; a: string }[] }) {
  return (
    <FaqList>
      <For each={props.items} by={(f) => f.q}>
        {(f) => (
          <FaqItem>
            <FaqQuestion>{f.q}</FaqQuestion>
            <FaqAnswer>{renderInline(f.a)}</FaqAnswer>
          </FaqItem>
        )}
      </For>
    </FaqList>
  )
}
