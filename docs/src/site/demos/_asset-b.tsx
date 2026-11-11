import { For } from '@pyreon/core'
import { radius } from '../theme'
import { el, tone } from '../kit/bases'
import { HEROES_B } from './_asset-b.generated'

/**
 * Hero visuals for the app-building-blocks and visual-and-tools product
 * pages, from the asset set (`scripts/copy-product-assets-b.ts` copies the
 * files into `public/assets/products/<id>/` and generates the table).
 *
 * The one local asset helper of this slice: when the shared `Picture` /
 * `AnimatedSvg` kit helpers land, only this file changes.
 *
 * Both kinds are plain `<img>` / `<picture>`, no JavaScript:
 *   - animated SVG: two pre-themed copies; CSS on `<html data-theme>` shows
 *     one, and `loading="lazy"` means the hidden one is never fetched.
 *     Reduced motion is handled inside the SVG (static end frame).
 *   - real capture: AVIF/WebP width variants for each theme, same switch.
 */
export interface HeroVariant {
  file: string
  width: number
  height: number
  format: string
}

export type HeroAsset =
  | { kind: 'svg'; width: number; height: number; alt: string; dark: string; light: string }
  | { kind: 'capture'; width: number; height: number; alt: string; dark: HeroVariant[]; light: HeroVariant[] }

export function heroAsset(id: string): HeroAsset | undefined {
  return HEROES_B[id]
}

const Frame = el
  .config({ name: 'ProductHeroVisual' })
  .attrs({ tag: 'figure', block: true })
  .theme((_t, m) => ({
    position: 'relative',
    margin: 0,
    marginTop: { xs: 40, lg: 56 },
    overflow: 'hidden',
    borderRadius: radius.demo,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'card'),
    extendCss: `
      & img { display: block; width: 100%; height: auto; }
      & [data-for-theme='light'] { display: none; }
      html[data-theme='light'] & [data-for-theme='light'] { display: block; }
      html[data-theme='light'] & [data-for-theme='dark'] { display: none; }
    `,
  }))
  .states(() => ({
    // A schematic SVG is drawn for 640 wide: keep it at a readable size, centred.
    svg: { maxWidth: 880, marginLeft: 'auto', marginRight: 'auto' },
    capture: {},
  }))

const srcset = (vs: readonly HeroVariant[], format: string) =>
  vs
    .filter((v) => v.format === format)
    .map((v) => `${v.file} ${v.width}w`)
    .join(', ')

const SIZES = '(min-width: 1280px) 1200px, calc(100vw - 32px)'

function Capture(props: { mode: 'dark' | 'light'; asset: Extract<HeroAsset, { kind: 'capture' }> }) {
  const vs = props.asset[props.mode]
  const fallback = vs.find((v) => v.format === 'webp' && v.width === 1280) ?? vs[0]
  return (
    <picture data-for-theme={props.mode}>
      <source type="image/avif" srcSet={srcset(vs, 'avif')} sizes={SIZES} />
      <source type="image/webp" srcSet={srcset(vs, 'webp')} sizes={SIZES} />
      <img
        src={fallback?.file}
        alt={props.asset.alt}
        width={props.asset.width}
        height={props.asset.height}
        loading="lazy"
        decoding="async"
      />
    </picture>
  )
}

/** The hero visual of product `id`, or nothing when this slice has none for it. */
export function ProductHeroVisual(props: { id: string }) {
  const asset = heroAsset(props.id)
  if (!asset) return null
  if (asset.kind === 'svg') {
    return (
      <Frame state="svg">
        <For each={['dark', 'light'] as const} by={(m) => m}>
          {(mode) => (
            <img
              data-for-theme={mode}
              src={asset[mode]}
              alt={asset.alt}
              width={asset.width}
              height={asset.height}
              loading="lazy"
              decoding="async"
            />
          )}
        </For>
      </Frame>
    )
  }
  return (
    <Frame state="capture">
      <Capture mode="dark" asset={asset} />
      <Capture mode="light" asset={asset} />
    </Frame>
  )
}
