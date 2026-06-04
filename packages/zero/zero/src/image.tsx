import type { Ref, VNodeChild } from '@pyreon/core'
import { createRef, mergeProps, splitProps } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import { signal } from '@pyreon/reactivity'
import type { FormatSource, ProcessedImage } from './image-plugin'
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

  // Priority images get a `<link rel="preload" as="image">` injected
  // into the document head so the browser starts the fetch alongside
  // the HTML parse — the LCP discovery optimization Next.js's `priority`
  // prop does and that most apps otherwise miss. The preload scanner
  // can't find the LCP image until it parses to the `<img>` tag
  // (~100-200ms later); a head-side hint cuts that latency. See #1351.
  //
  // Three subtleties enforced here:
  //   1. `<picture>` correctness: when formats are set, the runtime
  //      <img> only carries the FALLBACK srcset (best-format goes on
  //      <source>). Preload via the fallback `imagesrcset` so the
  //      browser picks the SAME candidate the rendered <picture> will.
  //      Emitting a bare-`href` preload for a responsive image would
  //      preload the wrong size; emitting the AVIF/WebP srcset would
  //      preload a format the fallback chain doesn't pick.
  //   2. Cross-origin srcs need `crossorigin="anonymous"` or the
  //      preload double-fetches (preload without CORS, real fetch with
  //      CORS — preload wasted). Same-origin omits it.
  //   3. Dedup is handled by `@pyreon/head`'s LinkTag keying on `href` —
  //      two priority images sharing a src emit ONE preload.
  if (props.priority && (resolvedSrcset || hasFormats)) {
    const isExternal =
      typeof props.src === 'string' && /^[a-z][a-z0-9+.-]*:\/\//i.test(props.src)
    useHead({
      link: [
        {
          rel: 'preload',
          as: 'image',
          href: props.src,
          ...(resolvedSrcset ? { imagesrcset: resolvedSrcset, imagesizes: sizes } : {}),
          fetchpriority: 'high',
          ...(isExternal ? { crossorigin: 'anonymous' } : {}),
        },
      ],
    })
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

/** Display-side props common to both `<Image>` call shapes. */
type ImageDisplayProps = Omit<
  ImageProps,
  'src' | 'width' | 'height' | 'srcset' | 'formats' | 'placeholder'
>

/**
 * Shape A — pass a `?optimize` descriptor as `src`. The descriptor carries
 * width / height / srcset / formats / placeholder, so the user supplies
 * only display props.
 */
export type ImageDescriptorProps = ImageDisplayProps & {
  src: ProcessedImage
  /**
   * Bypass the optimization pipeline — renders a bare `<img>` with the
   * descriptor's `src` + intrinsic dimensions. Use when a parent layout
   * needs full control (an `inset: 0` fill, a custom container, etc).
   */
  optimize?: false
  /** Override descriptor width — almost always unnecessary. */
  width?: number
  /** Override descriptor height — almost always unnecessary. */
  height?: number
  /** Override descriptor placeholder. */
  placeholder?: string
}

/**
 * Shape B — pass a runtime string URL. Width + height are REQUIRED at the
 * type level to prevent CLS; you'd hit it the moment you tried to use a
 * remote / signal-driven URL without intrinsic dimensions.
 */
export type ImageUrlProps = ImageDisplayProps & {
  src: string
  width: number
  height: number
  /** Bypass optimization — renders a bare `<img>` without the wrapper. */
  optimize?: false
  /** Manual srcset (rarely needed; the descriptor form is preferred). */
  srcset?: string | ImageSource[]
  formats?: FormatSource[]
  placeholder?: string
}

/**
 * Default optimized image component — **bi-modal**.
 *
 * Accepts EITHER a `ProcessedImage` descriptor (from a `?optimize` import,
 * `createImageRegistry` lookup, etc.) OR a runtime string URL with explicit
 * `width` / `height`. The descriptor form carries all optimization fields
 * automatically; the URL form requires explicit dimensions to keep CLS at zero.
 *
 * @example
 * // Descriptor form — best case, free aspect-ratio + srcset + placeholder
 * import hero from "./hero.jpg?optimize"
 * <Image src={hero} alt="Hero" priority />
 *
 * @example
 * // String form — runtime / external / dynamic case
 * <Image src={user.avatarUrl} alt="…" width={64} height={64} />
 *
 * @example
 * // Bypass — drop to a bare <img>
 * <Image src={hero} alt="…" optimize={false} />
 *
 * Both shapes end up at the same DOM: `<img>` with correct `width` /
 * `height` / `srcset` / `loading` / `fetchpriority`, wrapped in the
 * standard container (unless `optimize={false}` or `raw`).
 */
export function Image(props: ImageDescriptorProps | ImageUrlProps): any {
  // splitProps is reactivity-preserving — direct spread of `props` would
  // fire getters at copy time and freeze any signal-driven values.
  // Splitting on the bi-modal discriminator (`src`, `optimize`) keeps the
  // rest of the prop bag live so `<Image src={hero} class={() => …}>`
  // re-evaluates correctly under reactive context.
  const [local, rest] = splitProps(props, ['src', 'optimize'])

  const src = local.src
  const isDescriptor = typeof src === 'object' && src !== null
  const isBypass = local.optimize === false

  if (isBypass) {
    // Bare <img>, no optimization wrapper, no lazy load — the documented
    // element-level escape hatch. Width/height come from the descriptor
    // (when src is one) OR the explicit url-form props (when src is a URL).
    const desc = isDescriptor ? (src as ProcessedImage) : null
    const p = rest as ImageDisplayProps & {
      width?: number
      height?: number
    }
    return (
      <img
        src={desc ? desc.src : (src as string)}
        alt={p.alt}
        width={p.width ?? (desc?.width as number | undefined)}
        height={p.height ?? (desc?.height as number | undefined)}
        class={p.class}
        style={p.style}
        loading={p.priority ? 'eager' : (p.loading ?? 'lazy')}
        decoding={p.decoding ?? 'async'}
        fetchPriority={p.priority ? 'high' : undefined}
      />
    )
  }

  if (isDescriptor) {
    const desc = src as ProcessedImage
    // Dispatch to `<ImageInner>` with descriptor fields AS DEFAULTS and any
    // explicit user-supplied props (`rest`) winning on the same key. We
    // merge through `mergeProps` (not plain spread) so reactive descriptors
    // on `rest` — produced by `splitProps` and by the compiler's `_rp`
    // wrappers — survive copying as descriptors, preserving reactivity.
    const descDefaults: Partial<ImageProps> = {
      src: desc.src,
      srcset: desc.srcset,
      width: desc.width,
      height: desc.height,
      placeholder: desc.placeholder,
      formats: desc.formats,
    }
    const merged = mergeProps(descDefaults, rest as Partial<ImageProps>) as ImageProps
    return <ImageInner {...merged} />
  }

  // Shape B — string URL. Forward as-is; width/height are required at
  // the type level on the public surface, so they're already in `rest`.
  return <ImageInner src={src as string} {...(rest as Omit<ImageProps, 'src'>)} />
}

/**
 * The underlying optimized image — kept as a separate entry so the bi-modal
 * `<Image>` above can normalize props before dispatching here. Direct
 * consumers (custom HOCs, advanced layouts) can still call it with the
 * full `ImageProps` shape.
 */
const ImageInner: (props: ImageProps) => any = createImage((props) => (
  <div ref={props.containerRef} class={props.class} style={props.containerStyle}>
    {props.placeholder}
    {props.image}
  </div>
))

/** Props for {@link OptimizedImage}. */
export interface OptimizedImageProps
  extends Omit<ImageProps, 'src' | 'width' | 'height' | 'srcset' | 'formats' | 'placeholder'> {
  /**
   * A `?optimize` import descriptor — `import hero from './hero.jpg?optimize'`.
   * Carries `src` / `srcset` / `width` / `height` / `placeholder` / `formats`;
   * `<OptimizedImage>` spreads ALL of them onto `<Image>` so none are dropped.
   */
  source: ProcessedImage
}

/**
 * One-prop form of {@link Image} for `?optimize` imports.
 *
 * `<Image {...hero} alt="…" />` already works, but spreading by hand makes it
 * easy to drop a field — the #1 real-world CLS cause is pulling just `hero.src`
 * onto a raw `<img>` and losing `width` / `height` / `srcset` / `placeholder`.
 * `<OptimizedImage source={hero} alt="…" />` takes the whole descriptor as a
 * single prop, so every optimization field reaches `<Image>` by construction —
 * there is no "did I remember every field?" step.
 *
 * Display props (`alt`, `sizes`, `priority`, `loading`, `class`, `style`,
 * `fit`, `decoding`, `raw`) are passed alongside `source` and win over the
 * descriptor on the (currently non-overlapping) keys.
 *
 * @example
 * import hero from './hero.jpg?optimize'
 * <OptimizedImage source={hero} alt="Hero" priority />
 */
export function OptimizedImage(props: OptimizedImageProps): any {
  // splitProps (not destructuring) so the display props keep their reactive
  // getters; `source` is a static build-time descriptor with no reactivity.
  const [local, rest] = splitProps(props, ['source'])
  return <Image {...local.source} {...rest} />
}
