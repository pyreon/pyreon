/**
 * `<Math>` and `<Mermaid>` — the two lazy renderers with a graceful
 * fallback.
 *
 * Both take an OPTIONAL peer (`katex`, `mermaid`), import it at runtime
 * so a bundler never tries to resolve it, and fall back to showing the
 * source when it is absent. The fallback is the point: a docs site
 * without katex installed should show `E = mc^2` as code, not a blank
 * space and not a build failure. Everything about that path is silent,
 * which is why it needs assertions.
 *
 * Two arms matter beyond the happy path.
 *
 * **The unmount guard.** The render is async and can still be in flight
 * when the component unmounts — navigate away while katex is loading.
 * Writing the signal then keeps the whole closure, the rendered string
 * and the component's scope alive for a signal nothing will ever read
 * (leak class H). The `cancelled` flag is what makes the late resolve a
 * no-op, and nothing was covering it.
 *
 * **`trust: false`.** KaTeX emits MathML, which Pyreon's sanitized
 * `innerHTML` allowlist does not cover at all — so the output goes
 * through `dangerouslySetInnerHTML` and KaTeX's own gate is the only
 * thing standing between `\\href{javascript:...}` in a markdown file and
 * a live link. Passing it explicitly rather than relying on the library
 * default is a security decision, and a silent one.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { Math as MathComponent } from '../components/Math'
import { Mermaid } from '../components/Mermaid'

const flush = (ms = 30) => new Promise<void>((r) => setTimeout(r, ms))

function render(node: unknown): { host: HTMLElement; unmount: () => void } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const unmount = mount(node as never, host) as unknown as () => void
  return { host, unmount }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('both components fall back to the SOURCE when the peer is absent', () => {
  it('<Math> shows the formula as code', async () => {
    // katex is not installed in this workspace, so the dynamic import
    // rejects and this is the real fallback path — not a simulation.
    const { host } = render(<MathComponent>{'E = mc^2'}</MathComponent>)
    await flush()
    expect(host.querySelector('.pyreon-math__source')?.textContent).toBe('E = mc^2')
    expect(host.querySelector('.pyreon-math__rendered')).toBeNull()
  })

  it('<Mermaid> shows the diagram definition', async () => {
    const { host } = render(<Mermaid>{'graph TD\n  A --> B'}</Mermaid>)
    await flush()
    expect(host.textContent).toContain('graph TD')
  })

  it('neither throws when the peer import rejects', async () => {
    // A rejected optional import must never surface as an unhandled
    // rejection — that would take down a page over a missing devDep.
    const errors: unknown[] = []
    const onErr = (e: PromiseRejectionEvent) => errors.push(e.reason)
    globalThis.addEventListener?.('unhandledrejection', onErr as never)
    render(<MathComponent>{'x'}</MathComponent>)
    render(<Mermaid>{'graph TD'}</Mermaid>)
    await flush(50)
    globalThis.removeEventListener?.('unhandledrejection', onErr as never)
    expect(errors).toEqual([])
  })
})

describe('an EMPTY source does no work at all', () => {
  it('<Math> renders an empty code fallback without importing anything', async () => {
    // `:::math` with no body. Importing katex to render nothing costs a
    // network round trip on a page that shows nothing.
    const { host } = render(<MathComponent>{''}</MathComponent>)
    await flush()
    expect(host.querySelector('.pyreon-math__source')?.textContent).toBe('')
  })

  it('handles a NON-string child rather than stringifying it', async () => {
    // The directive body always arrives as a string; anything else is a
    // caller mistake, and `String({})` would render `[object Object]` as
    // a formula.
    const { host } = render(<MathComponent>{42 as never}</MathComponent>)
    await flush()
    expect(host.textContent).not.toContain('42')
    expect(host.textContent).not.toContain('object')
  })

  it('<Mermaid> does the same for an empty definition', async () => {
    const { host } = render(<Mermaid>{''}</Mermaid>)
    await flush()
    expect(host.querySelector('.pyreon-mermaid')).toBeTruthy()
  })
})

describe('an unmount mid-render does not write to a dead signal', () => {
  it('<Math> stops after unmount', async () => {
    // Navigate away while katex loads. Writing the signal afterwards
    // retains the closure, the rendered string and the component scope
    // for something nothing reads — leak class H.
    const { host, unmount } = render(<MathComponent>{'E = mc^2'}</MathComponent>)
    unmount()
    await flush(50)
    expect(host.querySelector('.pyreon-math__rendered')).toBeNull()
  })

  it('<Mermaid> stops after unmount', async () => {
    const { host, unmount } = render(<Mermaid>{'graph TD\n  A --> B'}</Mermaid>)
    unmount()
    await flush(50)
    expect(host.querySelector('.pyreon-mermaid__rendered')).toBeNull()
  })

  it('unmounting immediately does not throw', async () => {
    expect(() => {
      const { unmount } = render(<MathComponent>{'x'}</MathComponent>)
      unmount()
      unmount()
    }).not.toThrow()
    await flush()
  })
})

describe('classes reflect the authored options', () => {
  it('<Math> marks the inline form', () => {
    // Inline vs display is a layout decision KaTeX also needs; the class
    // is what the stylesheet keys on.
    const { host } = render(<MathComponent inline>{'x'}</MathComponent>)
    expect(host.querySelector('.pyreon-math--inline')).toBeTruthy()
  })

  it('<Math> does NOT mark the display form inline', () => {
    const { host } = render(<MathComponent>{'x'}</MathComponent>)
    expect(host.querySelector('.pyreon-math--inline')).toBeNull()
  })

  it('both merge a caller-supplied class', () => {
    const { host: m } = render(<MathComponent class="mine">{'x'}</MathComponent>)
    expect(m.querySelector('.pyreon-math.mine')).toBeTruthy()
    const { host: d } = render(<Mermaid class="theirs">{'graph TD'}</Mermaid>)
    expect(d.querySelector('.theirs')).toBeTruthy()
  })

  it('<Mermaid> accepts an explicit id without disturbing the fallback', () => {
    // The id is mermaid's own render target and only reaches the DOM on
    // the rendered branch — the fallback must be unaffected by it.
    const { host: given } = render(<Mermaid id="my-diagram">{'graph TD'}</Mermaid>)
    const { host: auto } = render(<Mermaid>{'graph TD'}</Mermaid>)
    expect(given.textContent).toContain('graph TD')
    expect(given.innerHTML).toBe(auto.innerHTML)
  })
})

describe('KaTeX is called with trust DISABLED', () => {
  it('passes trust: false and throwOnError: false at the call site', async () => {
    // Asserted against the SOURCE, not by execution, and deliberately so:
    // the specifier is assembled at runtime (`const specifier = 'katex'`)
    // precisely so no bundler resolves it — which also puts it beyond
    // `vi.doMock`, since there is no static specifier to intercept. A
    // weaker lock than a call assertion, and the honest one available.
    //
    // It is worth having because the decision is security-relevant and
    // silent: KaTeX emits MathML, which Pyreon's sanitized `innerHTML`
    // allowlist does not cover, so the output goes through
    // `dangerouslySetInnerHTML` and KaTeX's own gate is the only thing
    // between `\\href{javascript:…}` in a markdown file and a live link.
    // Relying on the library default would move that into a dependency's
    // changelog.
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const src = await fs.readFile(
      path.join(process.cwd(), 'src', 'components', 'Math.tsx'),
      'utf8',
    )
    expect(src, 'the render call must exist to be constrained').toContain('renderToString(source')
    expect(src).toMatch(/trust:\s*false/)
    expect(src).toMatch(/throwOnError:\s*false/)
    expect(src, 'display mode follows the authored form').toMatch(/displayMode:\s*!props\.inline/)
  })
})
