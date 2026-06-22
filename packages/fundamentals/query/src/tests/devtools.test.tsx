import { isNativeCompat } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { QueryClient } from '@tanstack/query-core'
import { QueryClientProvider } from '../index'
import { QueryDevtools } from '../devtools'

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
}

const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms))

describe('QueryDevtools', () => {
  it('is marked nativeCompat', () => {
    expect(isNativeCompat(QueryDevtools)).toBe(true)
  })

  it('renders a host element + mounts/unmounts without throwing (explicit client)', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let unmount: (() => void) | undefined
    expect(() => {
      unmount = mount(<QueryDevtools client={client} initialIsOpen={false} />, el)
    }).not.toThrow()

    await tick()
    // The shim renders a host <div data-pyreon-query-devtools> that the
    // TanstackQueryDevtools engine mounts its panel into.
    expect(el.querySelector('[data-pyreon-query-devtools]')).not.toBeNull()

    expect(() => unmount?.()).not.toThrow()
    el.remove()
  })

  it('mounts with all optional config props supplied', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let unmount: (() => void) | undefined
    expect(() => {
      unmount = mount(
        <QueryDevtools
          client={client}
          initialIsOpen={true}
          buttonPosition="top-left"
          position="right"
          errorTypes={[{ name: 'Boom', initializer: () => new Error('boom') }]}
        />,
        el,
      )
    }).not.toThrow()

    await tick()
    expect(el.querySelector('[data-pyreon-query-devtools]')).not.toBeNull()
    expect(() => unmount?.()).not.toThrow()
    el.remove()
  })

  it('mounts into a shadowDOMTarget when provided', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)
    const shadowHost = document.createElement('div')
    const shadowDOMTarget = shadowHost.attachShadow({ mode: 'open' })

    let unmount: (() => void) | undefined
    expect(() => {
      unmount = mount(<QueryDevtools client={client} shadowDOMTarget={shadowDOMTarget} />, el)
    }).not.toThrow()
    await tick()
    expect(el.querySelector('[data-pyreon-query-devtools]')).not.toBeNull()
    expect(() => unmount?.()).not.toThrow()
    el.remove()
  })

  it('resolves the client from QueryClientProvider context when no prop is given', async () => {
    const client = makeClient()
    const el = document.createElement('div')
    document.body.appendChild(el)

    let unmount: (() => void) | undefined
    expect(() => {
      unmount = mount(
        <QueryClientProvider client={client}>{() => <QueryDevtools />}</QueryClientProvider>,
        el,
      )
    }).not.toThrow()

    await tick()
    expect(el.querySelector('[data-pyreon-query-devtools]')).not.toBeNull()
    expect(() => unmount?.()).not.toThrow()
    el.remove()
  })
})
