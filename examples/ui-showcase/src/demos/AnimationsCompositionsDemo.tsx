import { kinetic } from '@pyreon/kinetic'
import { compose, presets, reverse, withDelay, withDuration, withEasing } from '@pyreon/kinetic-presets'
import { signal } from '@pyreon/reactivity'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

const ComposedFadeSlide = kinetic('div').preset(compose(presets.fade, presets.slideUp))
const SlowFade = kinetic('div').preset(withDuration(presets.fade, 800, 500))
const SpringEased = kinetic('div').preset(
  withEasing(presets.scaleIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)'),
)
const DelayedFade = kinetic('div').preset(withDelay(presets.fadeUp, 200, 0))
const ReversedSlide = kinetic('div').preset(reverse(presets.slideUp))

const boxStyle =
  'padding: 24px; background: #0070f3; color: white; border-radius: 8px; text-align: center; font-weight: 600;'

export function AnimationsCompositionsDemo() {
  const composedOpen = signal(true)
  const slowOpen = signal(true)
  const springOpen = signal(true)
  const delayedOpen = signal(true)
  const reversedOpen = signal(true)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Composition Utilities</Title>
      <Paragraph style="margin-bottom: 24px">
        Combine and modify presets with `compose`, `withDuration`, `withEasing`, `withDelay`, `reverse`.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">compose(fade, slideUp)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => composedOpen.set(!composedOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <ComposedFadeSlide show={() => composedOpen()} style={boxStyle}>fade + slideUp</ComposedFadeSlide>
      </div>

      <Title size="h3" style="margin-bottom: 12px">withDuration(fade, 800, 500)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => slowOpen.set(!slowOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <SlowFade show={() => slowOpen()} style={boxStyle}>slow fade</SlowFade>
      </div>

      <Title size="h3" style="margin-bottom: 12px">withEasing(scaleIn, spring)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => springOpen.set(!springOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <SpringEased show={() => springOpen()} style={boxStyle}>scale with spring</SpringEased>
      </div>

      <Title size="h3" style="margin-bottom: 12px">withDelay(fadeUp, 200, 0)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => delayedOpen.set(!delayedOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <DelayedFade show={() => delayedOpen()} style={boxStyle}>delayed enter</DelayedFade>
      </div>

      <Title size="h3" style="margin-bottom: 12px">reverse(slideUp)</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => reversedOpen.set(!reversedOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <ReversedSlide show={() => reversedOpen()} style={boxStyle}>reversed direction</ReversedSlide>
      </div>
    </div>
  )
}
