import { signal } from '@pyreon/reactivity'
import { DemoSurface, GlowCard } from '../kit/cards'
import { Pill, Segmented } from '../kit/controls'
import { Meters, PaperButton, PaperHint } from '../kit/demo'
import { AutoGrid } from '../kit/layout'
import { KitScope } from '../kit/scope'
import { el } from '../kit/bases'

const Row = el.config({ name: 'KitLiveRow' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 }).theme(() => ({ flexWrap: 'wrap', marginBottom: 16 }))

/**
 * The gallery's interactive specimens, as one island: the button Pill,
 * Segmented, and the paper DemoSurface driving Meters. `/brand/kit` is a
 * static page like the rest of the site, so anything with a handler lives in
 * an island; `KitScope` gives these rocketstyle components their theme when
 * the island hydrates on its own.
 */
export default function KitGalleryLive() {
  const seg = signal<'web' | 'ios' | 'android'>('web')
  const count = signal(0)
  return (
    <KitScope>
      <Row>
        <Pill onClick={() => count.set(count.peek() + 1)}>{() => `Button · ${count()}`}</Pill>
        <Segmented label="Target" options={['web', 'ios', 'android'] as const} value={() => seg()} onChange={(v) => seg.set(v)} />
      </Row>
      <AutoGrid cols={2} gap={16}>
        <DemoSurface aria-label="Paper surface sample">
          <PaperButton type="button" variant="primary" onClick={() => count.set(count.peek() + 1)}>
            Increment
          </PaperButton>
          <PaperHint>{() => `Clicked ${count()} times.`}</PaperHint>
        </DemoSurface>
        <GlowCard padding="compact">
          <Meters
            label="Sample meters"
            items={[
              { label: 'count', value: () => count() },
              { label: 'segment', value: () => seg() },
            ]}
          />
        </GlowCard>
      </AutoGrid>
    </KitScope>
  )
}
