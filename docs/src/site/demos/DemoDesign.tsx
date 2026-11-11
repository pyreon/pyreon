import { signal } from '@pyreon/reactivity'
import { PyreonUI } from '@pyreon/ui-core'
import { font, radius } from '../theme'
import { el, focusRing, tone, txt, type ButtonAttrs } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { DemoGrid } from '../kit/demo'
import { CardSegmented, DemoStack } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * Design System demo (`design.json` → demo): ONE real rocketstyle
 * definition (`@pyreon/rocketstyle` over `@pyreon/elements`' Element, the
 * same base the kit uses) with three dimensions: state, size, variant. The
 * stage sits inside a nested `<PyreonUI mode>`, so the light/dark switch is
 * the real provider re-scoping `data-theme`, not a class swap. The state
 * sets the button's colour as a custom property; the variant decides
 * whether it fills or outlines, so every combination comes from writing
 * each dimension once.
 */
const STATES = ['primary', 'secondary', 'danger'] as const
const SIZES = ['sm', 'md', 'lg'] as const
const VARIANTS = ['solid', 'outline'] as const
const MODES = ['light', 'dark'] as const

/** The component a consumer would import: `<Button state size variant>`. */
const Button = el
  .config({ name: 'DemoDesignButton' })
  .attrs<ButtonAttrs>({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center' })
  .theme((_t, m) => ({
    border: '1px solid',
    borderRadius: radius.note,
    fontFamily: font.sans,
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
    transition: 'background-color .15s, color .15s, border-color .15s, padding .15s',
    focus: focusRing(m),
  }))
  .states((_t, m) => ({
    primary: { extendCss: `--btn: ${tone(m, 'accent')};` },
    secondary: { extendCss: `--btn: ${tone(m, 'mist')};` },
    danger: { extendCss: `--btn: ${tone(m, 'err')};` },
  }))
  .sizes(() => ({
    sm: { height: 30, paddingLeft: 12, paddingRight: 12, fontSize: 13 },
    md: { height: 38, paddingLeft: 16, paddingRight: 16, fontSize: 14 },
    lg: { height: 48, paddingLeft: 22, paddingRight: 22, fontSize: 16 },
  }))
  .variants((_t, m) => ({
    solid: { backgroundColor: 'var(--btn)', borderColor: 'var(--btn)', color: tone(m, 'solidText') },
    outline: { backgroundColor: 'transparent', borderColor: 'var(--btn)', color: 'var(--btn)' },
  }))

const Ghost = el
  .config({ name: 'DemoDesignGhost' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 38,
    paddingLeft: 16,
    paddingRight: 16,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    borderRadius: radius.note,
    backgroundColor: 'transparent',
    color: tone(m, 'text'),
    fontFamily: font.sans,
    fontSize: 14,
    cursor: 'pointer',
    focus: focusRing(m),
  }))

const Stage = el
  .config({ name: 'DemoDesignStage' })
  .attrs({ block: true, contentAlignX: 'center', contentAlignY: 'center' })
  .theme((_t, m) => ({
    minWidth: 0,
    minHeight: 300,
    padding: { xs: 18, sm: 32 },
    borderRadius: radius.demo,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'bg'),
    transition: 'background-color .2s',
  }))

const Card = el
  .config({ name: 'DemoDesignCard' })
  .attrs({ block: true, gap: 10 })
  .theme((_t, m) => ({
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: radius.note + 4,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    boxShadow: tone(m, 'cardShadow'),
  }))

const CardTitle = txt.config({ name: 'DemoDesignTitle' }).attrs({ tag: 'h3' }).theme((_t, m) => ({ margin: 0, fontSize: 18, fontWeight: 650, color: tone(m, 'text') }))
const CardText = txt.config({ name: 'DemoDesignText' }).attrs({ tag: 'p' }).theme((_t, m) => ({ margin: 0, fontSize: 14, lineHeight: 1.5, color: tone(m, 'mist') }))
const Row = el.config({ name: 'DemoDesignRow' }).attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 }).theme(() => ({ flexWrap: 'wrap', marginTop: 6 }))

const Control = el.config({ name: 'DemoDesignControl' }).attrs({ block: true, gap: 6 }).theme(() => ({ minWidth: 0 }))

export default function DemoDesign() {
  const state = signal<(typeof STATES)[number]>('primary')
  const size = signal<(typeof SIZES)[number]>('md')
  const variant = signal<(typeof VARIANTS)[number]>('solid')
  const mode = signal<(typeof MODES)[number]>('light')

  const code = () =>
    `<Button\n  state="${state()}"\n  size="${size()}"\n  variant="${variant()}"\n>Delete</Button>\n// mode comes from <PyreonUI mode="${mode()}">`

  return (
    <DemoGrid>
      <GlowCard padding="compact">
        <DemoStack>
          <Control>
            <Eyebrow>state</Eyebrow>
            <CardSegmented label="state" options={STATES} value={() => state()} onChange={(v) => state.set(v)} />
          </Control>
          <Control>
            <Eyebrow>size</Eyebrow>
            <CardSegmented label="size" options={SIZES} value={() => size()} onChange={(v) => size.set(v)} />
          </Control>
          <Control>
            <Eyebrow>variant</Eyebrow>
            <CardSegmented label="variant" options={VARIANTS} value={() => variant()} onChange={(v) => variant.set(v)} />
          </Control>
          <Control>
            <Eyebrow>mode</Eyebrow>
            <CardSegmented label="mode" options={MODES} value={() => mode()} onChange={(v) => mode.set(v)} />
          </Control>
          <CodeBlock code={code()} label="What a consumer writes" />
        </DemoStack>
      </GlowCard>
      <PyreonUI mode={() => mode()}>
        <Stage aria-label="Rendered component">
          <Card>
            <CardTitle>Delete project?</CardTitle>
            <CardText>This removes the project and its 12 deployments.</CardText>
            <Row>
              <Button type="button" state={state()} size={size()} variant={variant()}>
                Delete
              </Button>
              <Ghost type="button">Cancel</Ghost>
            </Row>
          </Card>
        </Stage>
      </PyreonUI>
    </DemoGrid>
  )
}
