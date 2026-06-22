import { describe, expect, it } from 'vitest'
import { Document, Image, Page, render } from '..'

// `RenderOptions.baseUrl` resolves relative image `src` values against an
// absolute base, applied once in render() so every output format benefits.

function docWith(src: string) {
  return Document({ children: [Page({ children: [Image({ src })] })] })
}

describe('render() baseUrl — relative image resolution', () => {
  it('resolves a relative src against baseUrl (HTML)', async () => {
    const html = (await render(docWith('./logo.png'), 'html', {
      baseUrl: 'https://cdn.example.com/assets/',
    })) as string
    expect(html).toContain('src="https://cdn.example.com/assets/logo.png"')
  })

  it('resolves a root-relative src against the base origin', async () => {
    const html = (await render(docWith('/logo.png'), 'html', {
      baseUrl: 'https://cdn.example.com/assets/sub/',
    })) as string
    expect(html).toContain('src="https://cdn.example.com/logo.png"')
  })

  it('leaves an already-absolute https src unchanged', async () => {
    const html = (await render(docWith('https://other.com/x.png'), 'html', {
      baseUrl: 'https://cdn.example.com/assets/',
    })) as string
    expect(html).toContain('src="https://other.com/x.png"')
  })

  it('leaves a data: URI unchanged', async () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo='
    const html = (await render(docWith(dataUri), 'html', {
      baseUrl: 'https://cdn.example.com/assets/',
    })) as string
    expect(html).toContain(`src="${dataUri}"`)
  })

  it('is a no-op without baseUrl (relative src passes through verbatim)', async () => {
    const html = (await render(docWith('./logo.png'), 'html')) as string
    expect(html).toContain('src="./logo.png"')
  })

  it('applies at the render() layer — markdown output gets the resolved URL too', async () => {
    const md = (await render(docWith('./logo.png'), 'md', {
      baseUrl: 'https://cdn.example.com/assets/',
    })) as string
    expect(md).toContain('https://cdn.example.com/assets/logo.png')
    expect(md).not.toContain('./logo.png')
  })
})
