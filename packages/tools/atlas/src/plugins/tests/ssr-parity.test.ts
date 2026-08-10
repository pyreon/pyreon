/**
 * The SSR-parity check, against the REAL framework.
 *
 * Deliberately not a mocked runtime. The whole value of this check is that it
 * sees what the runtime sees — a stubbed `renderToString` would let the test
 * pass while the real pipeline silently reported a serene zero, which is the
 * exact failure shape the check exists to prevent.
 */
import { h } from '@pyreon/core'
import { hydrateRoot, mount, onHydrationMismatch } from '@pyreon/runtime-dom'
import { renderToString } from '@pyreon/runtime-server'
import { checkSsrParity, describeMismatch, normalizeHtml } from '../ssr-parity'
import { ensureDom } from '../../verify/dom'
import type { MountRuntime } from '../../verify/harness'

// The same DOM acquisition the plugin performs. Not `@vitest-environment
// happy-dom`: that would give the TEST a document while the plugin installs
// its own, so a bug in `ensureDom` would stay invisible here.
beforeAll(async () => {
  const dom = await ensureDom()
  if (!dom.ok) throw new Error(`no DOM for the parity test: ${dom.reason}`)
})

const runtime: MountRuntime = {
  h: h as MountRuntime['h'],
  mount: mount as unknown as MountRuntime['mount'],
  registerErrorHandler: (() => () => {}) as MountRuntime['registerErrorHandler'],
  renderToString: renderToString as unknown as NonNullable<MountRuntime['renderToString']>,
  hydrateRoot: hydrateRoot as unknown as NonNullable<MountRuntime['hydrateRoot']>,
  onHydrationMismatch: onHydrationMismatch as unknown as NonNullable<MountRuntime['onHydrationMismatch']>,
}

const containers = (): [Element, Element] => [
  document.createElement('div'),
  document.createElement('div'),
]

describe('normalizeHtml', () => {
  it('strips framework markers, which differ legitimately between the two paths', () => {
    // Hydration leaves anchors a fresh client mount has no reason to emit in
    // the same places. Comparing them raw would report a difference on every
    // scenario carrying a `<For>` or an accessor — i.e. most of them.
    expect(normalizeHtml('<div><!--pyreon--><span>a</span><!--$--></div>')).toBe(
      '<div><span>a</span></div>',
    )
  })

  it('keeps whitespace INSIDE text, which a mismatch really does corrupt', () => {
    expect(normalizeHtml('<p>a  b</p>')).toBe('<p>a  b</p>')
    expect(normalizeHtml('<p>a</p>\n  <p>b</p>')).toBe('<p>a</p><p>b</p>')
  })
})

describe('describeMismatch', () => {
  it('names the type, the path and both sides', () => {
    expect(describeMismatch({ type: 'text', path: 'root > p', expected: 'a', actual: 'b' })).toBe(
      'text at root > p: expected a, DOM had b',
    )
  })

  it('survives a context missing every field', () => {
    // Runs on a verdict path; a malformed context must not throw and lose the
    // whole scenario's verdict.
    expect(() => describeMismatch(undefined)).not.toThrow()
    expect(describeMismatch({})).toContain('mismatch')
  })
})

describe('checkSsrParity', () => {
  it('PASSES a component that renders identically on both sides', async () => {
    const Good = (props: { label: string }) => h('button', {}, props.label)
    const [a, b] = containers()
    const verdict = await checkSsrParity(runtime, Good as never, { label: 'Save' }, a, b)

    expect(verdict.status).toBe('pass')
    expect(verdict.findings ?? []).toEqual([])
  })

  it('FAILS a component whose render is not deterministic', async () => {
    // A component that renders something different each time it runs cannot
    // hydrate: the server's HTML and the client's expectation disagree by
    // construction. `Math.random()`, `Date.now()` and per-render ids are the
    // real-world shapes; a counter is the same bug, made deterministic so the
    // test cannot flake.
    //
    // NOT a `typeof window` component, which is the other classic SSR bug:
    // see the caveat in ../ssr-parity.ts — this check runs in one process with
    // DOM globals installed, so both sides see a browser and agree.
    let renders = 0
    const Divergent = () => h('span', {}, `render-${(renders += 1)}`)
    const [a, b] = containers()
    const verdict = await checkSsrParity(runtime, Divergent as never, {}, a, b)

    expect(verdict.status).toBe('fail')
    // Oracle 1's shape specifically — the runtime's own channel, with a path.
    expect((verdict.findings ?? []).join('\n')).toContain('expected render-2, DOM had render-1')
  })

  it('FAILS on an SSR/client divergence the mismatch channel never reports', async () => {
    // ORACLE 2, isolated. The runtime's channel is stubbed SILENT, so oracle 1
    // cannot fire — exactly the "agreement on broken" shape the fuzz work
    // named, where SSR and hydrate reach the same wrong DOM and report zero
    // mismatches. Without this oracle the check would pass loudest on the bugs
    // it exists to find.
    const silent: MountRuntime = {
      ...runtime,
      onHydrationMismatch: (() => () => {}) as NonNullable<MountRuntime['onHydrationMismatch']>,
      // Hydrates something structurally different from what a client mount
      // builds, without saying so.
      hydrateRoot: ((container: Element) => {
        container.innerHTML = '<span>server-only</span>'
        return () => {}
      }) as NonNullable<MountRuntime['hydrateRoot']>,
    }
    const Good = () => h('span', {}, 'client-only')
    const [a, b] = containers()
    const verdict = await checkSsrParity(silent, Good as never, {}, a, b)

    expect(verdict.status).toBe('fail')
    expect((verdict.findings ?? []).join()).toContain('differs from a fresh client mount')
  })

  it('FAILS, rather than throws, when the renderer throws', async () => {
    const Boom = () => {
      throw new Error('render exploded')
    }
    const [a, b] = containers()
    const verdict = await checkSsrParity(runtime, Boom as never, {}, a, b)

    expect(verdict.status).toBe('fail')
    expect((verdict.findings ?? []).join()).toContain('render exploded')
  })

  it('SKIPS with a reason when the project has no SSR renderer', async () => {
    // A component library with no SSR story is legitimate. Skipping with the
    // reason keeps it distinguishable from a component that FAILS to hydrate —
    // the distinction the whole verdict model is built on.
    const noSsr: MountRuntime = { ...runtime }
    delete (noSsr as { renderToString?: unknown }).renderToString
    const [a, b] = containers()
    const verdict = await checkSsrParity(noSsr, ((): unknown => h('i', {}, 'x')) as never, {}, a, b)

    expect(verdict.status).toBe('skip')
    expect((verdict.findings ?? []).join()).toContain('@pyreon/runtime-server')
  })

  it('unregisters its mismatch collector, on the pass AND the throw path', async () => {
    // Asserted on the REGISTRATION, not on a later verdict. A leaked collector
    // writes into the array of a call that already returned, so it is a
    // RETENTION leak and produces no wrong verdict — a bisect proved the
    // obvious "does a later check see stale findings?" test passes with
    // `stop()` deleted. Counting subscribe/unsubscribe is the level at which
    // the contract is actually observable.
    let open = 0
    const counting = (): MountRuntime => ({
      ...runtime,
      onHydrationMismatch: ((handler: (c: unknown) => void) => {
        void handler
        open += 1
        return () => {
          open -= 1
        }
      }) as NonNullable<MountRuntime['onHydrationMismatch']>,
    })

    const Good = () => h('em', {}, 'stable')
    const [a1, b1] = containers()
    await checkSsrParity(counting(), Good as never, {}, a1, b1)
    expect(open).toBe(0)

    // And when hydration itself throws — the path where an early return could
    // skip the cleanup.
    const throwing: MountRuntime = {
      ...counting(),
      hydrateRoot: (() => {
        throw new Error('hydrate exploded')
      }) as NonNullable<MountRuntime['hydrateRoot']>,
    }
    const [a2, b2] = containers()
    const verdict = await checkSsrParity(throwing, Good as never, {}, a2, b2)

    expect(verdict.status).toBe('fail')
    expect(open).toBe(0)
  })
})
