import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { fill } from '../../content/fill'
import type { BenchmarksTemplate } from '../../content/types-site'
import { el, tone, txt } from '../../kit/bases'
import { GlowCard } from '../../kit/cards'
import { inlineText } from '../../kit/inline'
import { AutoGrid } from '../../kit/layout'
import { KitScope } from '../../kit/scope'
import { ToggleChips } from '../../kit/toggles'
import { Eyebrow, Heading, renderInline } from '../../kit/type'
import { font, text } from '../../theme'
import { matchesFilter, tally, type ProductBenchSummary, type ProductFilter } from './model'

/**
 * "Every product": the filter chips and the cards they filter, as a zero
 * island (`islands.ts`, `hydrate: 'visible'`). The server renders every card
 * with "all" pressed, which is the whole list a reader without JavaScript
 * needs; the island adopts it and the chips filter. The summaries come from
 * each product content file's `benchmarks` (the route loader), sorted.
 */
export type ProductCardsProps = {
  products: ProductBenchSummary[]
  copy: BenchmarksTemplate['products']
}

const Stack = el.config({ name: 'BenchProductsStack' }).attrs({ block: true, contentAlignX: 'block', gap: 20 }).theme(() => ({ minWidth: 0 }))

const Card = el.config({ name: 'BenchProductCard' }).attrs({ block: true, gap: 8 }).theme(() => ({ minWidth: 0 }))

const Mono = txt
  .config({ name: 'BenchProductMono' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, lineHeight: 1.55, color: tone(m, 'fog') }))

const Tally = txt
  .config({ name: 'BenchTally' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({ display: 'block', fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'accentText') }))

const FILTERS: readonly ProductFilter[] = ['all', 'win', 'loss', 'info']

export default function ProductCards(props: ProductCardsProps) {
  const c = props.copy
  const filter = signal<ProductFilter>('all')
  const visible = () => props.products.filter((p) => matchesFilter(p, filter()))
  const total = props.products.length
  return (
    <KitScope>
      <Stack>
        <ToggleChips<ProductFilter>
          kind="filter"
          label={c.control}
          options={FILTERS.map((f) => ({ value: f, label: c.filters[f], count: props.products.filter((p) => matchesFilter(p, f)).length }))}
          value={() => filter()}
          onChange={(v) => filter.set(v)}
        />
        <p aria-live="polite">
          <Mono>{() => fill(c.shown, { shown: visible().length, total })}</Mono>
        </p>
        <AutoGrid min={260} gap={12} tag="ul">
          <For each={() => visible()} by={(p) => p.id}>
            {(p) => (
              <li data-product={p.id}>
                <GlowCard
                  href={p.href}
                  padding="compact"
                  aria-label={fill(c.card, { name: p.name, headline: inlineText(p.headline), tally: tally(p.counts, c.tally) })}
                >
                  <Card>
                    <Eyebrow state="accent">{p.name}</Eyebrow>
                    <Heading tag="h3" size="step">
                      {renderInline(p.headline)}
                    </Heading>
                    <Mono>{renderInline(p.rival)}</Mono>
                    <Tally>{tally(p.counts, c.tally)}</Tally>
                  </Card>
                </GlowCard>
              </li>
            )}
          </For>
        </AutoGrid>
      </Stack>
    </KitScope>
  )
}
