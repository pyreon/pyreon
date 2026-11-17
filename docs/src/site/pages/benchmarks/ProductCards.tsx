import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { fill } from '../../content/fill'
import type { BenchmarksTemplate } from '../../content/types-site'
import { GlowCard } from '../../kit/cards'
import { inlineText } from '../../kit/inline'
import { Stack } from '../../kit/primitives/stack'
import { AutoGrid } from '../../kit/primitives/auto-grid'
import { Text } from '../../kit/primitives/text'
import { KitScope } from '../../kit/scope'
import { ToggleChips } from '../../kit/toggles'
import { Eyebrow, Heading, renderInline } from '../../kit/type'
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

const FILTERS: readonly ProductFilter[] = ['all', 'win', 'loss', 'info']

export default function ProductCards(props: ProductCardsProps) {
  const c = props.copy
  const filter = signal<ProductFilter>('all')
  const visible = () => props.products.filter((p) => matchesFilter(p, filter()))
  const total = props.products.length
  return (
    <KitScope>
      <Stack gap={250} shrink>
        <ToggleChips<ProductFilter>
          kind="filter"
          label={c.control}
          options={FILTERS.map((f) => ({ value: f, label: c.filters[f], count: props.products.filter((p) => matchesFilter(p, f)).length }))}
          value={() => filter()}
          onChange={(v) => filter.set(v)}
        />
        <p aria-live="polite">
          <Text variant="mono" tone="fog" leading="detail" block>{() => fill(c.shown, { shown: visible().length, total })}</Text>
        </p>
        <AutoGrid min={260} gap={150} tag="ul">
          <For each={() => visible()} by={(p) => p.id}>
            {(p) => (
              <li data-product={p.id}>
                <GlowCard
                  href={p.href}
                  padding="compact"
                  aria-label={fill(c.card, { name: p.name, headline: inlineText(p.headline), tally: tally(p.counts, c.tally) })}
                >
                  <Stack gap={100} alignX="left" shrink>
                    <Eyebrow state="accent">{p.name}</Eyebrow>
                    <Heading tag="h3" size="step">
                      {renderInline(p.headline)}
                    </Heading>
                    <Text variant="mono" tone="fog" leading="detail" block>{renderInline(p.rival)}</Text>
                    <Text variant="mono" tone="accentText" block>{tally(p.counts, c.tally)}</Text>
                  </Stack>
                </GlowCard>
              </li>
            )}
          </For>
        </AutoGrid>
      </Stack>
    </KitScope>
  )
}
