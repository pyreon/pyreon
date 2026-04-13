/**
 * Image — responsive image component using picsum.photos placeholders.
 *
 * Generates deterministic placeholder URLs seeded by a `seed` prop. Tests:
 * image loading, responsive sizing, border-radius, aspect-ratio. Uses
 * `styled('img')` directly (not rocketstyle Element) because `src` /
 * `alt` / `width` are native HTML attributes that need passthrough.
 */

import { styled } from '@pyreon/styler'

const Img = styled('img', { layer: 'elements' })`
  display: block;
  max-width: 100%;
  border-radius: 8px;
`

const CircleImg = styled('img', { layer: 'elements' })`
  display: block;
  border-radius: 999px;
  object-fit: cover;
`

type Props = {
  seed: string
  width: number
  height?: number
  alt?: string
  circle?: boolean
}

const Image = (props: Props) => {
  const height = props.height ?? props.width
  const src = `https://picsum.photos/seed/${props.seed}/${props.width}/${height}`
  const alt = props.alt ?? `random image ${props.seed}`
  if (props.circle) {
    return <CircleImg src={src} alt={alt} width={props.width} height={height} loading="lazy" />
  }
  return <Img src={src} alt={alt} width={props.width} height={height} loading="lazy" />
}

Image.displayName = 'base/Image'
export default Image
