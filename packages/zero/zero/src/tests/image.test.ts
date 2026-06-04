/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'

// Image module depends on @pyreon/reactivity signals + IntersectionObserver +
// JSX construction. Mirror link.test.ts's approach: test the PURE LOGIC
// extracted from the hook (srcset resolution, style assembly, sentinel /
// state derivations, format-selection branching) as local re-implementations.
// The hook's reactive plumbing (containerRef signal, IntersectionObserver
// wiring) is exercised by the e2e suite + verify-modes against real
// consumers — happy-dom can't drive IntersectionObserver realistically.

describe('image srcset resolution', () => {
  type ImageSource = { src: string; width: number }
  function resolveSrcset(srcset: string | ImageSource[] | undefined): string | undefined {
    if (typeof srcset === 'string') return srcset
    return srcset?.map((s) => `${s.src} ${s.width}w`).join(', ')
  }

  it('passes through a string srcset unchanged', () => {
    expect(resolveSrcset('/a.jpg 1x, /b.jpg 2x')).toBe('/a.jpg 1x, /b.jpg 2x')
  })

  it('builds a width-descriptor srcset from an array', () => {
    expect(
      resolveSrcset([
        { src: '/hero-400.jpg', width: 400 },
        { src: '/hero-800.jpg', width: 800 },
      ]),
    ).toBe('/hero-400.jpg 400w, /hero-800.jpg 800w')
  })

  it('returns undefined for undefined input', () => {
    expect(resolveSrcset(undefined)).toBeUndefined()
  })

  it('returns empty string for empty array (and lets the caller treat as no-srcset)', () => {
    expect(resolveSrcset([])).toBe('')
  })
})

describe('image eager / lazy resolution', () => {
  function isEager(priority: boolean | undefined, loading: 'lazy' | 'eager' | undefined): boolean {
    return !!(priority || loading === 'eager')
  }

  it('priority forces eager regardless of loading', () => {
    expect(isEager(true, undefined)).toBe(true)
    expect(isEager(true, 'lazy')).toBe(true)
    expect(isEager(true, 'eager')).toBe(true)
  })

  it('loading="eager" forces eager when priority is unset', () => {
    expect(isEager(undefined, 'eager')).toBe(true)
  })

  it('defaults to lazy when neither priority nor loading is set', () => {
    expect(isEager(undefined, undefined)).toBe(false)
    expect(isEager(false, undefined)).toBe(false)
    expect(isEager(undefined, 'lazy')).toBe(false)
  })
})

describe('image format selection (hasFormats branch)', () => {
  type FormatSource = { type: string; srcset: string }
  function hasFormats(formats: FormatSource[] | undefined): boolean {
    return !!(formats && formats.length > 0)
  }

  it('falsy for undefined / empty array', () => {
    expect(hasFormats(undefined)).toBe(false)
    expect(hasFormats([])).toBe(false)
  })

  it('truthy for non-empty array', () => {
    expect(hasFormats([{ type: 'image/webp', srcset: '/a.webp 1x' }])).toBe(true)
  })
})

describe('image container style assembly', () => {
  function buildContainerStyle(
    width: number,
    height: number,
    callerStyle: string | undefined,
  ): string {
    return [
      'position: relative',
      'overflow: hidden',
      `aspect-ratio: ${width} / ${height}`,
      `max-width: ${width}px`,
      'width: 100%',
      callerStyle,
    ]
      .filter(Boolean)
      .join('; ')
  }

  it('includes aspect-ratio and max-width', () => {
    const style = buildContainerStyle(1200, 630, undefined)
    expect(style).toContain('aspect-ratio: 1200 / 630')
    expect(style).toContain('max-width: 1200px')
    expect(style).toContain('width: 100%')
  })

  it('appends caller-provided style verbatim', () => {
    const style = buildContainerStyle(400, 300, 'border-radius: 8px')
    expect(style.endsWith('border-radius: 8px')).toBe(true)
  })

  it('skips empty / undefined callerStyle (no trailing semicolon-only fragment)', () => {
    const style = buildContainerStyle(400, 300, undefined)
    expect(style.endsWith(';')).toBe(false)
    expect(style.endsWith('width: 100%')).toBe(true)
  })
})

// CLS-prevention contract asserted against the REAL `useImage`, not the
// `buildContainerStyle` copy above. The Lighthouse audit (bokisch.com
// 0.27.1) flagged CLS from images with no reserved box; the default
// <Image> prevents it by putting `aspect-ratio` + `max-width` on the
// container. The copy-based test can't catch a regression in the actual
// hook — this one can. `priority: true` forces eager, which skips the
// IntersectionObserver wiring (the only part happy-dom can't drive), so
// the hook builds `containerStyle` synchronously with no observer.
describe('image CLS contract — real useImage().containerStyle', () => {
  it('reserves layout space via aspect-ratio + max-width (default path)', async () => {
    const { useImage } = await import('../image')
    const img = useImage({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 460,
      height: 460,
      priority: true,
    })
    expect(img.aspectRatio).toBe('460 / 460')
    expect(img.containerStyle).toContain('aspect-ratio: 460 / 460')
    expect(img.containerStyle).toContain('max-width: 460px')
    expect(img.containerStyle).toContain('width: 100%')
    expect(img.containerStyle).toContain('position: relative')
    expect(img.containerStyle).toContain('overflow: hidden')
  })

  it('appends caller style after the reserved-box declarations', async () => {
    const { useImage } = await import('../image')
    const img = useImage({
      src: '/h.jpg',
      alt: '',
      width: 1200,
      height: 630,
      priority: true,
      style: 'border-radius: 8px',
    })
    expect(img.containerStyle).toContain('aspect-ratio: 1200 / 630')
    expect(img.containerStyle.endsWith('border-radius: 8px')).toBe(true)
  })
})

describe('image src/srcSet inView gating', () => {
  function resolveSrc(inView: boolean, src: string): string {
    return inView ? src : ''
  }

  function resolveSrcSet(
    hasFormats: boolean,
    inView: boolean,
    resolvedSrcset: string | undefined,
  ): string {
    return !hasFormats && inView && resolvedSrcset ? resolvedSrcset : ''
  }

  it('src is empty until inView', () => {
    expect(resolveSrc(false, '/hero.jpg')).toBe('')
    expect(resolveSrc(true, '/hero.jpg')).toBe('/hero.jpg')
  })

  it('srcSet stays empty when formats are set (<source> takes over)', () => {
    expect(resolveSrcSet(true, true, '/a.jpg 1x')).toBe('')
  })

  it('srcSet stays empty until inView', () => {
    expect(resolveSrcSet(false, false, '/a.jpg 1x')).toBe('')
    expect(resolveSrcSet(false, true, '/a.jpg 1x')).toBe('/a.jpg 1x')
  })

  it('srcSet stays empty when no srcset string is resolved', () => {
    expect(resolveSrcSet(false, true, undefined)).toBe('')
  })
})

describe('image three-layer API surface', () => {
  it('exports useImage as a function', async () => {
    const mod = await import('../image')
    expect(typeof mod.useImage).toBe('function')
  })

  it('exports createImage as a function', async () => {
    const mod = await import('../image')
    expect(typeof mod.createImage).toBe('function')
  })

  it('exports the default Image component', async () => {
    const mod = await import('../image')
    expect(typeof mod.Image).toBe('function')
  })

  it('createImage returns a wrapped component', async () => {
    const { createImage } = await import('../image')
    const Custom = createImage(() => null)
    expect(typeof Custom).toBe('function')
  })

  it('exports OptimizedImage as a function', async () => {
    const mod = await import('../image')
    expect(typeof mod.OptimizedImage).toBe('function')
  })
})

// OptimizedImage's whole reason to exist: spread the ENTIRE `?optimize`
// descriptor onto <Image> so no field is silently dropped (the #1 CLS
// cause is pulling just `.src`). This test inspects the returned VNode to
// prove every descriptor field reaches <Image> — a future "cleanup" that
// drops a field from the spread fails here.
describe('OptimizedImage — spreads the full ?optimize descriptor onto <Image>', () => {
  it('forwards src / srcset / width / height / placeholder / formats (drops nothing)', async () => {
    const { OptimizedImage, Image } = await import('../image')
    const descriptor = {
      src: '/hero-1920.jpg',
      srcset: '/hero-640.jpg 640w, /hero-1920.jpg 1920w',
      width: 1920,
      height: 1080,
      placeholder: 'data:image/png;base64,AAAA',
      formats: [{ type: 'image/webp', srcset: '/hero.webp 1920w' }],
      sources: [{ src: '/hero-640.jpg', width: 640, format: 'jpeg' }],
    }
    const vnode = OptimizedImage({
      source: descriptor as never,
      alt: 'Hero',
      priority: true,
    }) as { type: unknown; props: Record<string, unknown> }

    // Renders an <Image> (not a bare <img>).
    expect(vnode.type).toBe(Image)
    // Every descriptor field is present on the forwarded props (these are
    // static values from the descriptor object, so they read plainly
    // regardless of the JSX-spread transform).
    expect(vnode.props.src).toBe('/hero-1920.jpg')
    expect(vnode.props.srcset).toBe(descriptor.srcset)
    expect(vnode.props.width).toBe(1920)
    expect(vnode.props.height).toBe(1080)
    expect(vnode.props.placeholder).toBe(descriptor.placeholder)
    expect(vnode.props.formats).toBe(descriptor.formats)
  })
})

describe('useImage — real hook (bisect-verifies the inView gating contract)', () => {
  // These tests exercise the actual `useImage` export, not a local
  // re-implementation. They lock down the load-bearing contract: lazy
  // images return empty `src` until inView, eager/priority images
  // return the resolved src immediately. Reverting either branch in
  // the hook fails one of these tests with the right error message.

  it('lazy image — src accessor returns "" before inView triggers', async () => {
    const { useImage } = await import('../image')
    const result = useImage({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 1200,
      height: 630,
    })
    // Pre-IntersectionObserver, inView is false → src() returns "".
    expect(result.src()).toBe('')
    expect(result.inView()).toBe(false)
    expect(result.loaded()).toBe(false)
  })

  it('eager image — src accessor returns props.src immediately', async () => {
    const { useImage } = await import('../image')
    const result = useImage({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 1200,
      height: 630,
      loading: 'eager',
    })
    // Eager → both inView and loaded start true; src is resolved immediately.
    expect(result.inView()).toBe(true)
    expect(result.loaded()).toBe(true)
    expect(result.src()).toBe('/hero.jpg')
  })

  it('priority image — src accessor returns props.src, fetchPriority is "high"', async () => {
    const { useImage } = await import('../image')
    const result = useImage({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 1200,
      height: 630,
      priority: true,
    })
    expect(result.src()).toBe('/hero.jpg')
    expect(result.fetchPriority).toBe('high')
    expect(result.loading).toBe('eager')
  })

  it('handleLoad sets loaded signal to true', async () => {
    const { useImage } = await import('../image')
    const result = useImage({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 1200,
      height: 630,
    })
    expect(result.loaded()).toBe(false)
    result.handleLoad()
    expect(result.loaded()).toBe(true)
  })

  it('hasFormats branch — srcSet stays empty when formats are present', async () => {
    const { useImage } = await import('../image')
    const result = useImage({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 1200,
      height: 630,
      loading: 'eager', // force inView=true so we isolate the formats branch
      formats: [{ type: 'image/webp', srcset: '/hero.webp 1200w' }],
    })
    expect(result.hasFormats).toBe(true)
    expect(result.srcSet()).toBe('')
  })
})

describe('createImage — HOC composition (bisect-verifies render-props contract)', () => {
  // These tests prove the HOC correctly passes ImageRenderProps to the
  // wrapped component. The HOC returns a VNode `{ type: WrappedComponent,
  // props: ImageRenderProps, ... }` — JSX is lazy; the wrapped component
  // is NOT called eagerly. We inspect the VNode's `.props` directly to
  // verify what the wrapped component WOULD receive when the renderer
  // mounts it. Bisect target: revert any slot assignment in createImage
  // (e.g. drop `placeholder` from the spread) and the matching slot in
  // the VNode props goes missing → test fails.

  it('returned VNode props carry containerRef, class, containerStyle, placeholder, image', async () => {
    const { createImage } = await import('../image')
    const Custom = createImage(() => null)
    const vnode = Custom({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 1200,
      height: 630,
      class: 'my-image',
    }) as { type: unknown; props: Record<string, unknown> }
    expect(vnode.props.containerRef).toBeDefined()
    expect(vnode.props.class).toBe('my-image')
    expect(typeof vnode.props.containerStyle).toBe('string')
    expect((vnode.props.containerStyle as string).includes('aspect-ratio: 1200 / 630')).toBe(true)
    expect(vnode.props.image).toBeDefined()
    expect(vnode.props.image).not.toBeNull()
  })

  it('placeholder slot is null when props.placeholder is unset', async () => {
    const { createImage } = await import('../image')
    const Custom = createImage(() => null)
    const vnode = Custom({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 400,
      height: 300,
    }) as { props: { placeholder: unknown } }
    expect(vnode.props.placeholder).toBeNull()
  })

  it('placeholder slot is a non-null <img> VNode when props.placeholder is set', async () => {
    const { createImage } = await import('../image')
    const Custom = createImage(() => null)
    const vnode = Custom({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 400,
      height: 300,
      placeholder: '/blur.jpg',
    }) as { props: { placeholder: { type: string } | null } }
    expect(vnode.props.placeholder).not.toBeNull()
    expect((vnode.props.placeholder as { type: string }).type).toBe('img')
  })

  it('image slot is a <picture> VNode when formats are present', async () => {
    const { createImage } = await import('../image')
    const Custom = createImage(() => null)
    const vnode = Custom({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 400,
      height: 300,
      loading: 'eager',
      formats: [{ type: 'image/webp', srcset: '/hero.webp 1x' }],
    }) as { props: { image: { type: string } } }
    expect(vnode.props.image.type).toBe('picture')
  })

  it('image slot is a bare <img> VNode when formats are absent', async () => {
    const { createImage } = await import('../image')
    const Custom = createImage(() => null)
    const vnode = Custom({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 400,
      height: 300,
    }) as { props: { image: { type: string } } }
    expect(vnode.props.image.type).toBe('img')
  })

  it('raw mode short-circuits — returns a bare <img> VNode, not the wrapper', async () => {
    const { createImage } = await import('../image')
    const Custom = createImage(() => null)
    const vnode = Custom({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 400,
      height: 300,
      raw: true,
    }) as { type: string; props: { src: string } }
    // The VNode type IS the string 'img' (raw mode returns <img/> directly),
    // not the wrapper function reference.
    expect(vnode.type).toBe('img')
    expect(vnode.props.src).toBe('/hero.jpg')
  })

  it('default Image (bi-modal dispatcher) returns a VNode whose type is the inner component function', async () => {
    const { Image } = await import('../image')
    // The bi-modal `Image` dispatches to a private `ImageInner` (which is the
    // real createImage-wrapped component carrying the render-props contract).
    // From the outside, `Image({...})` returns `h(ImageInner, props)` — so we
    // can assert (a) the type is a function (ImageInner, not a string tag),
    // and (b) the user-supplied props are forwarded verbatim. The
    // render-props slots (`containerRef` / `image`) only materialize when
    // ImageInner's body runs — covered by the real-mount tests below and the
    // `createImage` contract tests above.
    const vnode = Image({
      src: '/hero.jpg',
      alt: 'Hero',
      width: 400,
      height: 300,
    }) as { type: unknown; props: Record<string, unknown> }
    expect(typeof vnode.type).toBe('function')
    expect(vnode.props.src).toBe('/hero.jpg')
    expect(vnode.props.alt).toBe('Hero')
    expect(vnode.props.width).toBe(400)
    expect(vnode.props.height).toBe(300)
  })
})

describe('Image — real mount (covers default <div><img/></div> rendering path)', () => {
  // Mount the default <Image> via @pyreon/runtime-dom into happy-dom and
  // inspect the produced DOM. This exercises the default `createImage`
  // template (line 312-318 of image.tsx: the `<div ref={...}><placeholder/><image/></div>`
  // wrapper). Without real mount, those lines stay uncovered.

  async function setup() {
    const { mount } = await import('@pyreon/runtime-dom')
    const { h } = await import('@pyreon/core')
    const { Image } = await import('../image')
    const container = document.createElement('div')
    document.body.appendChild(container)
    return {
      mount,
      h,
      Image,
      container,
      cleanup: () => container.remove(),
    }
  }

  it('eager image — produces container <div> with an <img> inside carrying the src', async () => {
    const { mount, h, Image, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Image, { src: '/hero.jpg', alt: 'Hero', width: 400, height: 300, loading: 'eager' }),
        container,
      )
      const div = container.querySelector('div')
      expect(div).not.toBeNull()
      expect(div?.getAttribute('style')).toMatch(/aspect-ratio: 400 \/ 300/)
      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      // Eager → inView=true → src attribute is the resolved URL
      expect(img?.getAttribute('src')).toBe('/hero.jpg')
      expect(img?.getAttribute('alt')).toBe('Hero')
      unmount()
    } finally {
      cleanup()
    }
  })

  it('lazy image — initial render has empty src (waiting for IntersectionObserver)', async () => {
    const { mount, h, Image, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Image, { src: '/lazy.jpg', alt: 'Lazy', width: 400, height: 300 }),
        container,
      )
      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      // Lazy → inView=false initially → src is empty (browsers won't fetch).
      // The IntersectionObserver fires in real browsers; happy-dom won't trigger it,
      // which is the contract — lazy means "no network until viewport-near."
      expect(img?.getAttribute('src')).toBe('')
      unmount()
    } finally {
      cleanup()
    }
  })

  it('priority image — fetchPriority="high" attribute is set', async () => {
    const { mount, h, Image, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Image, { src: '/lcp.jpg', alt: 'LCP', width: 1200, height: 630, priority: true }),
        container,
      )
      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      // fetchPriority attribute (lowercase in DOM)
      expect(img?.getAttribute('fetchpriority')).toBe('high')
      unmount()
    } finally {
      cleanup()
    }
  })

  it('with placeholder — TWO <img> elements render (placeholder + main)', async () => {
    const { mount, h, Image, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Image, {
          src: '/main.jpg',
          alt: 'Photo',
          width: 400,
          height: 300,
          loading: 'eager',
          placeholder: '/blur.jpg',
        }),
        container,
      )
      const imgs = container.querySelectorAll('img')
      expect(imgs.length).toBe(2)
      // Placeholder is rendered first (DOM order); main img after.
      // Find them by src to be order-independent.
      const placeholderImg = Array.from(imgs).find((i) => i.getAttribute('src') === '/blur.jpg')
      const mainImg = Array.from(imgs).find((i) => i.getAttribute('src') === '/main.jpg')
      expect(placeholderImg).toBeDefined()
      expect(mainImg).toBeDefined()
      // Placeholder is aria-hidden
      expect(placeholderImg?.getAttribute('aria-hidden')).toBe('true')
      unmount()
    } finally {
      cleanup()
    }
  })

  it('with formats — renders a <picture> with <source> elements', async () => {
    const { mount, h, Image, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Image, {
          src: '/hero.jpg',
          alt: 'Hero',
          width: 400,
          height: 300,
          loading: 'eager',
          formats: [
            { type: 'image/avif', srcset: '/hero.avif 400w' },
            { type: 'image/webp', srcset: '/hero.webp 400w' },
          ],
        }),
        container,
      )
      const picture = container.querySelector('picture')
      expect(picture).not.toBeNull()
      const sources = picture?.querySelectorAll('source')
      expect(sources?.length).toBe(2)
      expect(sources?.[0]?.getAttribute('type')).toBe('image/avif')
      expect(sources?.[1]?.getAttribute('type')).toBe('image/webp')
      unmount()
    } finally {
      cleanup()
    }
  })

  it('raw mode — produces a bare <img> without container <div>', async () => {
    const { mount, h, Image, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Image, {
          src: '/raw.jpg',
          alt: 'Raw',
          width: 400,
          height: 300,
          raw: true,
        }),
        container,
      )
      // No container div with aspect-ratio styles.
      const styledDiv = container.querySelector('div[style*="aspect-ratio"]')
      expect(styledDiv).toBeNull()
      // Direct <img> child of the container.
      const img = container.querySelector('img')
      expect(img).not.toBeNull()
      expect(img?.getAttribute('src')).toBe('/raw.jpg')
      unmount()
    } finally {
      cleanup()
    }
  })

  it('array srcset — width-descriptor join produces the right srcSet attribute', async () => {
    // Covers the array-mapping branch of `resolvedSrcset = srcset?.map(...).join(', ')`.
    const { mount, h, Image, container, cleanup } = await setup()
    try {
      const unmount = mount(
        h(Image, {
          src: '/hero-800.jpg',
          alt: 'Hero',
          width: 800,
          height: 600,
          loading: 'eager',
          srcset: [
            { src: '/hero-400.jpg', width: 400 },
            { src: '/hero-800.jpg', width: 800 },
            { src: '/hero-1600.jpg', width: 1600 },
          ],
        }),
        container,
      )
      const img = container.querySelector('img')
      expect(img?.getAttribute('srcset')).toBe(
        '/hero-400.jpg 400w, /hero-800.jpg 800w, /hero-1600.jpg 1600w',
      )
      expect(img?.getAttribute('sizes')).toBe('100vw')
      unmount()
    } finally {
      cleanup()
    }
  })
})
