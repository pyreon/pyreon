/**
 * @vitest-environment happy-dom
 *
 * Bi-modal `<Image>` integration tests against a real renderer:
 *   - Descriptor form: <Image src={desc} alt> → wraps in container, uses
 *     descriptor's width/height/srcset, no explicit dims required
 *   - String form: <Image src="url" width height alt> → same render path
 *   - optimize={false}: bypass, renders a bare <img> with intrinsic dims
 *
 * happy-dom + real `mount()` exercises the actual JSX wiring; the unit
 * test in `image.test.ts` covers the pure srcset/format logic separately.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { Image } from '../image'
import type { ProcessedImage } from '../image-plugin'

function descriptor(overrides: Partial<ProcessedImage> = {}): ProcessedImage {
  return {
    src: '/img/hero-1920.webp',
    srcset: '/img/hero-640.webp 640w, /img/hero-1920.webp 1920w',
    width: 1920,
    height: 1080,
    placeholder: 'data:image/svg+xml,...',
    formats: [],
    sources: [],
    ...overrides,
  }
}

let host: HTMLElement
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})

describe('<Image src={descriptor}>', () => {
  it('renders an <img> inside the optimization wrapper', () => {
    mount(<Image src={descriptor()} alt="Hero" />, host)
    const img = host.querySelector('img')!
    expect(img).not.toBeNull()
    // The container's aspect-ratio is the descriptor's intrinsic ratio.
    const container = host.querySelector('div')
    expect(container?.getAttribute('style') ?? '').toMatch(/aspect-ratio:\s*1920\s*\/\s*1080/)
  })

  it('wraps in the standard optimization container (div)', () => {
    mount(<Image src={descriptor()} alt="Hero" />, host)
    const wrapper = host.querySelector('div > div') ?? host.querySelector('div')
    expect(wrapper).not.toBeNull()
    expect(wrapper!.querySelector('img')).not.toBeNull()
  })

  it('explicit width / height override the descriptor (aspect-ratio reflects override)', () => {
    mount(<Image src={descriptor()} alt="Hero" width={640} height={360} />, host)
    const container = host.querySelector('div')
    // The container's aspect-ratio + max-width reflect the override,
    // not the descriptor's intrinsic 1920×1080.
    const style = container?.getAttribute('style') ?? ''
    expect(style).toMatch(/aspect-ratio:\s*640\s*\/\s*360/)
    expect(style).toMatch(/max-width:\s*640px/)
  })

  it('explicit placeholder overrides the descriptor placeholder', () => {
    mount(
      <Image src={descriptor()} alt="Hero" placeholder="data:image/png;base64,custom" />,
      host,
    )
    // Placeholder rendered as a sibling <img> in the wrapper.
    const imgs = host.querySelectorAll('img')
    const placeholders = [...imgs].filter((i) =>
      (i.getAttribute('src') ?? '').includes('base64,custom'),
    )
    expect(placeholders.length).toBeGreaterThanOrEqual(1)
  })
})

describe('<Image src="url" width height>', () => {
  it('renders the bare URL path with explicit dimensions', () => {
    mount(
      <Image src="https://cdn.example.com/avatar.png" alt="Avatar" width={64} height={64} />,
      host,
    )
    const img = host.querySelector('img')!
    expect(img.getAttribute('width') ?? (img.width > 0 ? String(img.width) : null)).toBe('64')
    expect(img.getAttribute('height') ?? (img.height > 0 ? String(img.height) : null)).toBe('64')
    expect(img.getAttribute('alt')).toBe('Avatar')
  })
})

describe('<Image optimize={false}>', () => {
  it('descriptor form: emits a bare <img> with no wrapper', () => {
    mount(<Image src={descriptor()} alt="Hero" optimize={false} />, host)
    const img = host.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/img/hero-1920.webp')
    expect(img.getAttribute('width') ?? (img.width > 0 ? String(img.width) : null)).toBe('1920')
    expect(img.getAttribute('height') ?? (img.height > 0 ? String(img.height) : null)).toBe('1080')
    // No outer optimization wrapper around the bare <img>.
    expect(host.children).toHaveLength(1)
    expect(host.children[0]!.tagName).toBe('IMG')
  })

  it('string form: emits a bare <img> with explicit dimensions', () => {
    mount(
      <Image
        src="https://cdn.example.com/avatar.png"
        alt="Avatar"
        width={64}
        height={64}
        optimize={false}
      />,
      host,
    )
    const img = host.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/avatar.png')
    expect(host.children).toHaveLength(1)
  })

  it('priority forwards to the bare <img> when optimization is bypassed', () => {
    mount(
      <Image src={descriptor()} alt="Hero" optimize={false} priority />,
      host,
    )
    const img = host.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('eager')
  })
})
