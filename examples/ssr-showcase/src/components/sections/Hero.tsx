/**
 * Hero — full-width section with responsive height and a background image.
 * Tests: responsive `minHeight`/`maxHeight` via `{ xs, md, lg }` objects,
 * image loading, `inversed`-aware text color via theme mode.
 */

import { element } from '../core'
import { Image } from '../base'

const Wrapper = element
  .config({ name: 'sections/Hero' })
  .attrs({ tag: 'section', block: true, direction: 'rows', alignX: 'center', alignY: 'center' })
  .theme((t) => ({
    position: 'relative',
    height: { xs: 420, md: 560, lg: 640 },
    paddingX: { xs: t.space.large, md: t.space.xxLarge },
    overflow: 'hidden',
    background: 'linear-gradient(180deg, #a5aead 0%, #b1bab9 52%, #b0b8b7 100%)',
    color: t.color.light.base,
  }))

const Heading = element
  .attrs({ tag: 'h1' })
  .theme((t) => ({
    fontFamily: t.fontFamily.base,
    fontSize: { xs: t.fontSize.xxLarge, md: t.fontSize.xxxLarge },
    fontWeight: 300,
    margin: t.space.reset,
    textAlign: 'center',
    zIndex: 1,
  }))

const Subtitle = element
  .attrs({ tag: 'p' })
  .theme((t) => ({
    fontFamily: t.fontFamily.base,
    fontSize: { xs: t.fontSize.medium, md: t.fontSize.large },
    fontWeight: 300,
    marginTop: t.space.medium,
    maxWidth: { xs: '100%', md: 640 },
    textAlign: 'center',
    zIndex: 1,
  }))

const BgImage = element
  .attrs({ tag: 'span' })
  .theme(() => ({
    position: 'absolute',
    inset: 0,
    opacity: 0.25,
    zIndex: 0,
  }))

type Props = {
  heading: string
  subtitle?: string
}

const Hero = (props: Props) => (
  <Wrapper>
    <BgImage>
      <Image seed="hero-showcase" width={1600} height={800} alt="" />
    </BgImage>
    <Heading>{props.heading}</Heading>
    {props.subtitle ? <Subtitle>{props.subtitle}</Subtitle> : null}
  </Wrapper>
)

Hero.displayName = 'sections/Hero'
export default Hero
