import type { VNodeChild } from '@pyreon/core'
import { For } from '@pyreon/core'
import { GlowCard } from '../kit/cards'
import { Chip } from '../kit/controls'
import { AutoGrid, Box, Cluster, Grid, Icon, Stack, Text, Visible, Wrap } from '../kit/primitives'
import type { TextLeading, TextTone, TextVariant } from '../kit/primitives'

/**
 * `/brand/kit`, layer 1: every primitive (`kit/primitives/`) in its variants.
 * `KitGallery` renders this with its own `Specimen` frame. The ids are what
 * the docs e2e reads (`e2e/site-pages.spec.ts`, "primitives").
 */

type SpecimenFrame = (props: { name: string; children?: VNodeChild }) => VNodeChild

const ITEMS = ['one', 'two', 'three', 'four', 'five', 'six'] as const
const chips = (n: number) => ITEMS.slice(0, n).map((i) => <Chip>{i}</Chip>)

const cards = (n: number) =>
  ITEMS.slice(0, n).map((i) => (
    <GlowCard padding="compact">
      <Text variant="mono" tone="fog">
        {i}
      </Text>
    </GlowCard>
  ))

const VARIANTS: readonly TextVariant[] = ['mono', 'label', 'caption', 'small', 'body']
const TONES: readonly TextTone[] = ['fog', 'mist', 'text', 'strong', 'accent', 'accentText']
const LEADINGS: readonly TextLeading[] = ['flat', 'normal', 'detail', 'relaxed', 'loose']

function LayoutSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <>
      <Specimen name="Stack: gap 100 · 250 · 400; alignX block (default) · left · center">
        <Grid columns={{ xs: 1, md: 3 }} gap={300}>
          <Stack gap={100}>{chips(3)}</Stack>
          <Stack gap={250} alignX="left">
            {chips(3)}
          </Stack>
          <Stack gap={400} alignX="center">
            {chips(3)}
          </Stack>
        </Grid>
      </Specimen>
      <Specimen name="Cluster: gap 75 · 150 · 275; alignX left · center · spaceBetween; nowrap; tag ul">
        <Stack gap={300}>
          <Cluster gap={75}>{chips(6)}</Cluster>
          <Cluster gap={150} alignX="center">
            {chips(6)}
          </Cluster>
          <Cluster gap={275} alignX="spaceBetween">
            {chips(4)}
          </Cluster>
          <Cluster gap={150} nowrap>
            {chips(3)}
          </Cluster>
          <Cluster tag="ul" gap={75} aria-label="A cluster as a list">
            <For each={['ul', 'li', 'no bullets']} by={(t) => t}>
              {(t) => (
                <li>
                  <Chip>{t}</Chip>
                </li>
              )}
            </For>
          </Cluster>
        </Stack>
      </Specimen>
      <Specimen name="Box: pad 200 · padX 500 padY 150 · pad { xs: 150, md: 400 }">
        <Grid columns={{ xs: 1, md: 3 }} gap={300}>
          <GlowCard padding="flush">
            <Box pad={200}>{chips(1)}</Box>
          </GlowCard>
          <GlowCard padding="flush">
            <Box padX={500} padY={150}>
              {chips(1)}
            </Box>
          </GlowCard>
          <GlowCard padding="flush">
            <Box pad={{ xs: 150, md: 400 }}>{chips(1)}</Box>
          </GlowCard>
        </Grid>
      </Specimen>
    </>
  )
}

function GridSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <>
      <Specimen name="Grid: columns { xs: 1, md: 3 } · { xs: 2, lg: 6 }, gap 150">
        <Stack gap={300}>
          <Grid id="kit-grid-responsive" columns={{ xs: 1, md: 3 }} gap={150}>
            {cards(3)}
          </Grid>
          <Grid tag="ul" columns={{ xs: 2, lg: 6 }} gap={150} aria-label="A grid as a list">
            <For each={[...ITEMS]} by={(i) => i}>
              {(i) => (
                <li>
                  <Chip>{i}</Chip>
                </li>
              )}
            </For>
          </Grid>
        </Stack>
      </Specimen>
      <Specimen name="AutoGrid: min 200 · cols 3 (colsBelow 1) · cols 4 colsBelow 2">
        <Stack gap={300}>
          <AutoGrid id="kit-autogrid-min" min={200} gap={150}>
            {cards(6)}
          </AutoGrid>
          <AutoGrid id="kit-autogrid-cols" cols={3} gap={150}>
            {cards(3)}
          </AutoGrid>
          <AutoGrid cols={4} colsBelow={2} gap={150}>
            {cards(4)}
          </AutoGrid>
        </Stack>
      </Specimen>
      <Specimen name="Wrap: the page column (this gallery sits in one); nested, it adds its gutters">
        <GlowCard padding="flush">
          <Wrap>
            <Text variant="small" tone="mist" leading="loose" block>
              The column is layout.maxWidth wide with layout.gutter at each side.
            </Text>
          </Wrap>
        </GlowCard>
      </Specimen>
    </>
  )
}

function TextSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
  <Specimen name="Text: variant mono · label · caption · small · body; tone; leading; block; anywhere">
    <Stack gap={250}>
      <Cluster gap={300} alignY="bottom">
        <For each={[...VARIANTS]} by={(v) => v}>
          {(v) => (
            <Text variant={v} tone="text">
              {v}
            </Text>
          )}
        </For>
      </Cluster>
      <Cluster gap={300}>
        <For each={[...TONES]} by={(t) => t}>
          {(t) => (
            <Text variant="mono" tone={t}>
              {t}
            </Text>
          )}
        </For>
      </Cluster>
      <Grid columns={{ xs: 1, md: 5 }} gap={300}>
        <For each={[...LEADINGS]} by={(l) => l}>
          {(l) => (
            <Text variant="caption" tone="mist" leading={l} block>
              {`leading ${l}: two lines of caption text to show the line height.`}
            </Text>
          )}
        </For>
      </Grid>
      <Box pad={150}>
        <Text variant="mono" tone="accentText" block anywhere>
          @pyreon/a-very-long-package-name-that-breaks-anywhere-instead-of-overflowing
        </Text>
      </Box>
    </Stack>
  </Specimen>
  )
}

function VisibleIconSpecimens(props: { Specimen: SpecimenFrame }) {
  const Specimen = props.Specimen

  return (
    <>
      <Specimen name="Visible: from split · below split · from md · below md (resize to see them swap)">
        <Cluster gap={150}>
          <Visible from="split">
            <Chip>
              <span id="kit-visible-from-split">from split (≥ 700px)</span>
            </Chip>
          </Visible>
          <Visible below="split">
            <Chip>
              <span id="kit-visible-below-split">below split (&lt; 700px)</span>
            </Chip>
          </Visible>
          <Visible from="md">
            <Chip>from md (≥ 768px)</Chip>
          </Visible>
          <Visible below="md">
            <Chip>below md (&lt; 768px)</Chip>
          </Visible>
        </Cluster>
      </Specimen>
      <Specimen name="Icon: decorative (aria-hidden; 16 · 24) · named (aria-label)">
        <Cluster gap={300} alignY="center">
          <Text variant="mono" tone="accent">
            <Icon size={16} aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" />
            </Icon>
          </Text>
          <Text variant="mono" tone="accent">
            <Icon size={24} aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" />
            </Icon>
          </Text>
          <Text variant="mono" tone="text">
            <Icon size={16} aria-label="Next">
              <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" />
            </Icon>
          </Text>
        </Cluster>
      </Specimen>
    </>
  )
}

export function PrimitiveSpecimens(props: { Specimen: SpecimenFrame }) {
  return (
    <>
      <LayoutSpecimens Specimen={props.Specimen} />
      <GridSpecimens Specimen={props.Specimen} />
      <TextSpecimens Specimen={props.Specimen} />
      <VisibleIconSpecimens Specimen={props.Specimen} />
    </>
  )
}
