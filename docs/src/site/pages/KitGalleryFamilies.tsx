import type { VNodeChild } from '@pyreon/core'
import { For } from '@pyreon/core'
import { Badge, type BadgeTone } from '../kit/badge'
import { Tag } from '../kit/tag'
import { GlowCard, PackageName } from '../kit/cards'
import { Note, type NoteSize } from '../kit/note'
import { AutoGrid, Cluster, Stack, Text } from '../kit/primitives'
import { Numeral, StatBody } from '../kit/proof'
import { Heading, Lede } from '../kit/type'

/**
 * `/brand/kit`, layer 2: the component families S3 consolidated — badges and
 * tags (`kit/badge.tsx`), notes (`kit/note.tsx`), and the stat sizes and
 * card compositions (`kit/stat.tsx`, `kit/cards.tsx`). `KitGallery` renders
 * this with its own `Specimen` frame. Locked figures only: every number here
 * is a specimen of a style, read from no claim.
 */

type SpecimenFrame = (props: { name: string; children?: VNodeChild }) => VNodeChild

const TONES: readonly BadgeTone[] = ['win', 'tie', 'split', 'loss', 'info', 'experimental']
const NOTE_SIZES: readonly NoteSize[] = ['caveat', 'mono', 'caption', 'ui', 'small']
const SAMPLE_CONDITION = 'one run · M3 Max · record of 2026-11-05'

function BadgeSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <Specimen name="Badge: tone win · tie · split · loss · info · experimental; size md · sm; placement after · before; bare">
      <Stack gap={250}>
        <Cluster gap={150} alignY="center">
          <For each={TONES} by={(t) => t}>
            {(t) => <Badge tone={t}>{t}</Badge>}
          </For>
        </Cluster>
        <Cluster gap={150} alignY="center">
          <For each={TONES} by={(t) => t}>
            {(t) => (
              <Badge tone={t} size="sm">
                {t}
              </Badge>
            )}
          </For>
        </Cluster>
        <Heading tag="h3" size="step">
          A name with its marker
          <Badge tone="experimental" size="sm" placement="after">
            next release
          </Badge>
        </Heading>
        <Lede size="small">
          <Badge tone="loss" bare placement="before">
            withdrawn
          </Badge>
          A status word that leads a line takes the badge lettering without the pill.
        </Lede>
      </Stack>
    </Specimen>
  )
}

function TagSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <Specimen name="Tag: static md · sm; link md · sm (one anchor, hover, focus ring); tag li">
      <Stack gap={250}>
        <Cluster gap={75} alignY="center">
          <Tag>useForm</Tag>
          <Tag size="sm">useField</Tag>
          <Tag href="/benchmarks">jump to a page</Tag>
          <Tag size="sm" href="/products/form">
            Forms
          </Tag>
        </Cluster>
        <Cluster tag="ul" gap={75} aria-label="Tags as list items">
          <Tag tag="li">signal</Tag>
          <Tag tag="li">computed</Tag>
          <Tag tag="li">effect</Tag>
        </Cluster>
      </Stack>
    </Specimen>
  )
}

function TextLetteringSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <Specimen name="Text: variant caveat · badge; tone ok · warn · err; medium">
      <Stack gap={150}>
        <Text variant="caveat" tone="fog" block>
          {SAMPLE_CONDITION}
        </Text>
        <Cluster gap={200} alignY="center">
          <Text variant="badge" tone="ok" medium>
            Do
          </Text>
          <Text variant="badge" tone="warn" medium>
            Careful
          </Text>
          <Text variant="badge" tone="err" medium>
            Don't
          </Text>
          <Text variant="badge" tone="fog">
            How it works
          </Text>
        </Cluster>
      </Stack>
    </Specimen>
  )
}

function NoteSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <Specimen name="Note: size caveat · mono · caption · ui · small; tone fog · mist; measure; tag figcaption">
      <Stack gap={200}>
        <For each={NOTE_SIZES} by={(s) => s}>
          {(s) => <Note size={s}>{`${s}: ${SAMPLE_CONDITION}`}</Note>}
        </For>
        <Note size="small" tone="mist">
          small · mist: a figure's caption at reading size.
        </Note>
        <Note measure>
          measure: a caveat under a full-width block stops at the note measure, so a long line never runs the width of the page. The rest of this
          sentence is here only to reach that measure on a wide screen.
        </Note>
      </Stack>
    </Specimen>
  )
}

function StatSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <Specimen name="StatBody: size product · hero · Numeral inline · PackageName block (strip and band are above)">
      <AutoGrid min={260} gap={150}>
        <GlowCard padding="compact" state="hot">
          <PackageName block>@pyreon/charts</PackageName>
          <div>
            <StatBody size="product" numeral="card" stat="8.7×" label="a product card's proof line" note={SAMPLE_CONDITION} />
          </div>
        </GlowCard>
        <div>
          <StatBody size="hero" numeral="strip" stat="2.6×" label="the benchmarks hero's stat" note={SAMPLE_CONDITION} />
        </div>
        <GlowCard padding="compact">
          <Lede size="small">
            <Numeral tag="span" size="inline">
              4×
            </Numeral>{' '}
            a numeral inside a line of copy
          </Lede>
        </GlowCard>
      </AutoGrid>
    </Specimen>
  )
}

/** Every family specimen, in the gallery's order. */
export function FamilySpecimens(props: { Specimen: SpecimenFrame }) {
  return (
    <>
      <BadgeSpecimens Specimen={props.Specimen} />
      <TagSpecimens Specimen={props.Specimen} />
      <TextLetteringSpecimens Specimen={props.Specimen} />
      <NoteSpecimens Specimen={props.Specimen} />
      <StatSpecimens Specimen={props.Specimen} />
    </>
  )
}
