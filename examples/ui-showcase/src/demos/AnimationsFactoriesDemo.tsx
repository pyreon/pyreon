import { kinetic } from '@pyreon/kinetic'
import {
  createBlur,
  createFade,
  createRotate,
  createScale,
  createSlide,
} from '@pyreon/kinetic-presets'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const FactoryFadeUp = kinetic('div').preset(createFade({ direction: 'up', distance: 24 }))
const FactorySlideRight = kinetic('div').preset(createSlide({ direction: 'right', distance: 32 }))
const FactoryScaleSpring = kinetic('div').preset(
  createScale({ from: 0.5, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }),
)
const FactoryRotate = kinetic('div').preset(createRotate({ degrees: 30, duration: 400 }))
const FactoryBlurScale = kinetic('div').preset(createBlur({ amount: 12, scale: 0.95 }))

const boxStyle =
  'padding: 24px; background: #0070f3; color: white; border-radius: 8px; text-align: center; font-weight: 600;'

export function AnimationsFactoriesDemo() {
  const fadeOpen = signal(true)
  const slideOpen = signal(true)
  const scaleOpen = signal(true)
  const rotateOpen = signal(true)
  const blurOpen = signal(true)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Preset Factories</Title>
      <Paragraph style="margin-bottom: 24px">
        Build custom presets with `createFade`, `createSlide`, `createScale`, `createRotate`, `createBlur`.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">createFade(direction, distance)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => fadeOpen.set(!fadeOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <FactoryFadeUp show={() => fadeOpen()} style={boxStyle}>fade up 24px</FactoryFadeUp>
      </div>

      <Title size="h3" style="margin-bottom: 12px">createSlide(direction, distance)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => slideOpen.set(!slideOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <FactorySlideRight show={() => slideOpen()} style={boxStyle}>slide right 32px</FactorySlideRight>
      </div>

      <Title size="h3" style="margin-bottom: 12px">createScale(from, easing)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => scaleOpen.set(!scaleOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <FactoryScaleSpring show={() => scaleOpen()} style={boxStyle}>scale spring 0.5→1</FactoryScaleSpring>
      </div>

      <Title size="h3" style="margin-bottom: 12px">createRotate(degrees, duration)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => rotateOpen.set(!rotateOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <FactoryRotate show={() => rotateOpen()} style={boxStyle}>rotate 30°</FactoryRotate>
      </div>

      <Title size="h3" style="margin-bottom: 12px">createBlur(amount, scale)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => blurOpen.set(!blurOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <FactoryBlurScale show={() => blurOpen()} style={boxStyle}>blur 12px + scale</FactoryBlurScale>
      </div>
    </div>
  )
}
