import { fade, kinetic, scaleIn, slideDown, slideLeft, slideRight, slideUp } from '@pyreon/kinetic'
import { signal } from '@pyreon/reactivity'
import { Button, Card, Title, Paragraph } from '@pyreon/ui-components'

const FadeBox = kinetic('div').preset(fade)
const SlideUpBox = kinetic('div').preset(slideUp)
const SlideDownBox = kinetic('div').preset(slideDown)
const SlideLeftBox = kinetic('div').preset(slideLeft)
const SlideRightBox = kinetic('div').preset(slideRight)
const ScaleInBox = kinetic('div').preset(scaleIn)

const boxStyle = 'padding: 24px; background: #0070f3; color: white; border-radius: 8px; text-align: center; font-weight: 600;'

export function AnimationsBasicDemo() {
  const fadeOpen = signal(true)
  const slideUpOpen = signal(true)
  const slideDownOpen = signal(true)
  const slideLeftOpen = signal(true)
  const slideRightOpen = signal(true)
  const scaleInOpen = signal(true)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Basic Animations</Title>
      <Paragraph style="margin-bottom: 24px">
        Six core kinetic presets — fade, slide (4 directions), and scale.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Fade</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => fadeOpen.set(!fadeOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <FadeBox show={() => fadeOpen()} style={boxStyle}>fade</FadeBox>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Slide Up</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => slideUpOpen.set(!slideUpOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <SlideUpBox show={() => slideUpOpen()} style={boxStyle}>slideUp</SlideUpBox>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Slide Down</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => slideDownOpen.set(!slideDownOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <SlideDownBox show={() => slideDownOpen()} style={boxStyle}>slideDown</SlideDownBox>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Slide Left</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => slideLeftOpen.set(!slideLeftOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <SlideLeftBox show={() => slideLeftOpen()} style={boxStyle}>slideLeft</SlideLeftBox>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Slide Right</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => slideRightOpen.set(!slideRightOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <SlideRightBox show={() => slideRightOpen()} style={boxStyle}>slideRight</SlideRightBox>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Scale In</Title>
      <div style="margin-bottom: 24px;">
        <Button state="primary" onClick={() => scaleInOpen.set(!scaleInOpen())} style="margin-bottom: 12px;">
          Toggle
        </Button>
        <ScaleInBox show={() => scaleInOpen()} style={boxStyle}>scaleIn</ScaleInBox>
      </div>
    </div>
  )
}
