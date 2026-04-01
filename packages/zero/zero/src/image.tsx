import type { VNodeChild } from '@pyreon/core'
import { createRef } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { FormatSource } from './image-plugin'
import { useIntersectionObserver } from './utils/use-intersection-observer'

// ─── Image optimization component ───────────────────────────────────────────
//
// <Image> provides:
// - Lazy loading via IntersectionObserver (loads when near viewport)
// - Automatic width/height to prevent CLS (Cumulative Layout Shift)
// - Responsive srcset generation from width descriptors
// - Multi-format support via <picture> (WebP/AVIF with fallback)
// - Blur-up placeholder while loading
// - Priority loading for above-the-fold images

export interface ImageProps {
  /** Image source URL. */
  src: string
  /** Alt text (required for accessibility). */
  alt: string
  /** Intrinsic width of the image. */
  width: number
  /** Intrinsic height of the image. */
  height: number
  /** Responsive sizes attribute. Default: "100vw" */
  sizes?: string
  /** Responsive srcset string or source array. */
  srcset?: string | ImageSource[]
  /** Per-format source sets for <picture>. Provided automatically by imagePlugin. */
  formats?: FormatSource[]
  /** Loading strategy. "lazy" uses IntersectionObserver, "eager" loads immediately. Default: "lazy" */
  loading?: 'lazy' | 'eager'
  /** Mark as priority (LCP image). Disables lazy loading, adds fetchPriority="high". */
  priority?: boolean
  /** Low-quality placeholder image URL or base64 data URI for blur-up effect. */
  placeholder?: string
  /** CSS class name. */
  class?: string
  /** Inline styles. */
  style?: string
  /** CSS object-fit. Default: "cover" */
  fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  /** Decode async. Default: true */
  decoding?: 'sync' | 'async' | 'auto'
  /**
   * Raw mode — renders a plain `<img>` without the container div,
   * aspect-ratio, max-width, or lazy loading wrapper.
   * Use when the Image is inside a custom layout (absolute positioning, etc.).
   */
  raw?: boolean
}

export interface ImageSource {
  src: string
  width: number
}

/**
 * Optimized image component with lazy loading, responsive images,
 * multi-format <picture> support, and blur-up placeholders.
 *
 * @example
 * // With imagePlugin — spread the import directly
 * import hero from "./hero.jpg?optimize"
 * <Image {...hero} alt="Hero" priority />
 *
 * @example
 * // Manual usage
 * <Image src="/hero.jpg" alt="Hero" width={1200} height={630} />
 */
export function Image(props: ImageProps): VNodeChild {
  // Raw mode: plain <img> without container, lazy loading, or layout constraints
  if (props.raw) {
    return (
      <img
        src={props.src}
        alt={props.alt}
        width={props.width}
        height={props.height}
        class={props.class}
        style={props.style}
        decoding={props.decoding ?? 'async'}
        loading={props.loading ?? 'lazy'}
        fetchPriority={props.priority ? 'high' : undefined}
      />
    ) as any
  }

  const isEager = props.priority || props.loading === 'eager'
  const loaded = signal(isEager)
  const inView = signal(isEager)
  const containerRef = createRef<HTMLElement>()

  // Resolve srcset from string or array
  const resolvedSrcset =
    typeof props.srcset === 'string'
      ? props.srcset
      : props.srcset?.map((s) => `${s.src} ${s.width}w`).join(', ')

  const sizes = props.sizes ?? '100vw'
  const fit = props.fit ?? 'cover'
  const hasFormats = props.formats && props.formats.length > 0
  const aspectRatio = `${props.width} / ${props.height}`

  if (!isEager) {
    useIntersectionObserver(
      () => containerRef.current ?? undefined,
      () => inView.set(true),
    )
  }

  // Static styles (don't depend on signals)
  const containerStyle = [
    'position: relative',
    'overflow: hidden',
    `aspect-ratio: ${aspectRatio}`,
    `max-width: ${props.width}px`,
    'width: 100%',
    props.style,
  ]
    .filter(Boolean)
    .join('; ')

  const imgEl = (
    <img
      src={() => (inView() ? props.src : '')}
      srcSet={() => (!hasFormats && inView() && resolvedSrcset ? resolvedSrcset : '')}
      sizes={resolvedSrcset ? sizes : undefined}
      alt={props.alt}
      width={props.width}
      height={props.height}
      loading={isEager ? 'eager' : 'lazy'}
      decoding={props.decoding ?? 'async'}
      fetchPriority={props.priority ? 'high' : undefined}
      onLoad={() => loaded.set(true)}
      style={() =>
        [
          'display: block',
          'width: 100%',
          'height: 100%',
          `object-fit: ${fit}`,
          'transition: opacity 0.3s ease',
          props.placeholder && !loaded() ? 'opacity: 0' : 'opacity: 1',
        ].join('; ')
      }
    />
  )

  return (
    <div ref={containerRef} class={props.class} style={containerStyle}>
      {props.placeholder && (
        <img
          src={props.placeholder}
          alt=""
          aria-hidden="true"
          loading="eager"
          style={() =>
            [
              'position: absolute',
              'inset: 0',
              'width: 100%',
              'height: 100%',
              'object-fit: cover',
              'filter: blur(20px)',
              'transform: scale(1.1)',
              'transition: opacity 0.4s ease',
              loaded() ? 'opacity: 0; pointer-events: none' : 'opacity: 1',
            ].join('; ')
          }
        />
      )}
      {hasFormats ? (
        <picture>
          {props.formats?.map((fmt) => (
            <source
              type={fmt.type}
              srcSet={() => (inView() ? (fmt.srcset ?? '') : '')}
              sizes={sizes}
            />
          ))}
          {imgEl}
        </picture>
      ) : (
        imgEl
      )}
    </div>
  )
}
