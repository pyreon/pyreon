import type { Ref, VNodeChild } from '@pyreon/core'
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
//
// Three levels of API (mirrors @pyreon/zero/link):
//
// 1. useImage(props)   — composable returning resolved attributes + signals
// 2. createImage(Comp) — HOC wrapping any component with image optimization
// 3. Image             — default <div><img/></div> wrapper (built on createImage)

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
   *
   * Note: `raw` skips the three-layer API entirely. `useImage` / `createImage`
   * do not apply when `raw: true` — the component returns a bare `<img>`.
   *
   * **CLS is still prevented in raw mode.** The `width` + `height` attributes
   * are always emitted, and modern browsers derive `aspect-ratio` from them
   * (the UA stylesheet's `aspect-ratio: attr(width) / attr(height)`), so the
   * box is reserved before the image decodes — even under a `img { height:
   * auto }` reset. Raw mode deliberately omits an *explicit* `aspect-ratio`
   * CSS declaration so it can't fight a custom layout (an `inset: 0` fill,
   * an explicitly-sized absolute box, etc.). The default (non-`raw`)
   * `<Image>` reserves space via the container's `aspect-ratio` instead.
   */
  raw?: boolean
}

export interface ImageSource {
  src: string
  width: number
}

/** Return type of {@link useImage}. */
export interface UseImageReturn {
  /** Ref — attach to the container element for IntersectionObserver. */
  containerRef: Ref<HTMLElement>
  /** Whether the image has entered the viewport (and started loading). */
  inView: () => boolean
  /** Whether the `<img>` onLoad has fired. */
  loaded: () => boolean
  /** Resolved `src` accessor — empty string until inView, then `props.src`. */
  src: () => string
  /** Resolved srcSet accessor — empty until inView; empty when `formats` is set (srcset moves to `<source>` elements). */
  srcSet: () => string
  /** `sizes` attribute or undefined when no srcset. */
  sizes: string | undefined
  /** `aspect-ratio` CSS value (`"${width} / ${height}"`). */
  aspectRatio: string
  /** Resolved CSS for the container — position + overflow + aspect-ratio + max-width + caller's `style`. */
  containerStyle: string
  /** Resolved CSS accessor for the `<img>` — fit + transition + opacity (placeholder fade). */
  imageStyle: () => string
  /** Resolved CSS accessor for the placeholder `<img>` (only meaningful when `placeholder` is set). */
  placeholderStyle: () => string
  /** `loading` attribute — eager when priority/eager, else lazy. */
  loading: 'lazy' | 'eager'
  /** `fetchPriority` — 'high' when priority, else undefined. */
  fetchPriority: 'high' | undefined
  /** onLoad handler — sets the loaded signal. Wire into the rendered `<img>`. */
  handleLoad: () => void
  /** Resolved per-format <source> descriptors (or undefined when no formats). */
  formats: FormatSource[] | undefined
  /** Whether `formats` is non-empty (i.e. consumer should render a `<picture>` wrapper). */
  hasFormats: boolean
}

/** Props passed to a custom component via {@link createImage}. */
export interface ImageRenderProps {
  /** Container ref. */
  containerRef: Ref<HTMLElement>
  /** CSS class for the container. */
  class: string | undefined
  /** Resolved container `style` string. */
  containerStyle: string
  /** Pre-rendered placeholder `<img>` (or `null` when `placeholder` is unset). */
  placeholder: VNodeChild
  /** Pre-rendered image — either a bare `<img>` or a `<picture>` tree when `formats` is set. */
  image: VNodeChild
}

/**
 * Composable that provides all image optimization behavior — lazy loading,
 * srcset/sizes resolution, format selection, blur-placeholder state,
 * load tracking.
 *
 * Use this for full control when `createImage` is too opinionated about
 * the surrounding markup (e.g. custom container layouts, non-`<div>`
 * wrappers, additional overlay elements).
 *
 * @example
 * function MyImage(props: ImageProps) {
 *   const img = useImage(props)
 *   return (
 *     <figure ref={img.containerRef} style={img.containerStyle}>
 *       <img
 *         src={img.src}
 *         srcSet={img.srcSet}
 *         sizes={img.sizes}
 *         alt={props.alt}
 *         loading={img.loading}
 *         onLoad={img.handleLoad}
 *         style={img.imageStyle}
 *       />
 *       <figcaption>{props.alt}</figcaption>
 *     </figure>
 *   )
 * }
 */
export function useImage(props: ImageProps): UseImageReturn {
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
  const hasFormats = !!(props.formats && props.formats.length > 0)
  const aspectRatio = `${props.width} / ${props.height}`

  if (!isEager) {
    useIntersectionObserver(
      () => containerRef.current ?? undefined,
      () => inView.set(true),
    )
  }

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

  const imageStyle = () =>
    [
      'display: block',
      'width: 100%',
      'height: 100%',
      `object-fit: ${fit}`,
      'transition: opacity 0.3s ease',
      props.placeholder && !loaded() ? 'opacity: 0' : 'opacity: 1',
    ].join('; ')

  const placeholderStyle = () =>
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

  return {
    containerRef,
    inView,
    loaded,
    src: () => (inView() ? props.src : ''),
    srcSet: () => (!hasFormats && inView() && resolvedSrcset ? resolvedSrcset : ''),
    sizes: resolvedSrcset ? sizes : undefined,
    aspectRatio,
    containerStyle,
    imageStyle,
    placeholderStyle,
    loading: isEager ? 'eager' : 'lazy',
    fetchPriority: props.priority ? 'high' : undefined,
    handleLoad: () => loaded.set(true),
    formats: props.formats,
    hasFormats,
  }
}

/**
 * Higher-order component that wraps any component with image optimization.
 *
 * The wrapped component receives {@link ImageRenderProps} with the pre-rendered
 * `image` JSX (bare `<img>` OR `<picture>` tree depending on formats), the
 * pre-rendered `placeholder` JSX, and the container ref + styles. Consumers
 * compose those pieces with whatever wrapper element / layout they want.
 *
 * @example
 * // Custom figure-based image with caption
 * const FigureImage = createImage((props) => (
 *   <figure ref={props.containerRef} class={props.class} style={props.containerStyle}>
 *     {props.placeholder}
 *     {props.image}
 *     <figcaption>Caption goes here</figcaption>
 *   </figure>
 * ))
 *
 * // Usage — identical to default <Image>
 * <FigureImage src="/hero.jpg" alt="Hero" width={1200} height={630} />
 */
export function createImage(
  Component: (p: ImageRenderProps) => any,
): (props: ImageProps) => any {
  return function WrappedImage(props: ImageProps) {
    // `raw` mode short-circuits — returns a bare <img> with no optimization
    // wrapper, no container, no createImage composition. Documented as the
    // no-optimization escape hatch.
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
      )
    }

    const img = useImage(props)

    const imgEl = (
      <img
        src={img.src}
        srcSet={img.srcSet}
        sizes={img.sizes}
        alt={props.alt}
        width={props.width}
        height={props.height}
        loading={img.loading}
        decoding={props.decoding ?? 'async'}
        fetchPriority={img.fetchPriority}
        onLoad={img.handleLoad}
        style={img.imageStyle}
      />
    )

    const placeholderEl = props.placeholder
      ? (
          <img
            src={props.placeholder}
            alt=""
            aria-hidden="true"
            loading="eager"
            style={img.placeholderStyle}
          />
        )
      : null

    const imageEl = img.hasFormats
      ? (
          <picture>
            {img.formats?.map((fmt) => (
              <source
                type={fmt.type}
                srcSet={() => (img.inView() ? (fmt.srcset ?? '') : '')}
                sizes={img.sizes}
              />
            ))}
            {imgEl}
          </picture>
        )
      : imgEl

    return (
      <Component
        containerRef={img.containerRef}
        class={props.class}
        containerStyle={img.containerStyle}
        placeholder={placeholderEl}
        image={imageEl}
      />
    )
  }
}

/**
 * Default optimized image component with lazy loading, responsive srcset,
 * `<picture>` multi-format support, and blur-up placeholders.
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
export const Image: (props: ImageProps) => any = createImage((props) => (
  <div ref={props.containerRef} class={props.class} style={props.containerStyle}>
    {props.placeholder}
    {props.image}
  </div>
))
