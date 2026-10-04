import { h } from '@pyreon/core'
import { useLoaderData } from '@pyreon/router'
import { startClient } from '../client'

it('loads the requested route instead of adopting static 404 markup and loader data', async () => {
  const marker = document.createElement('meta')
  marker.name = 'pyreon-ssg-fallback'
  marker.content = '404'
  document.head.appendChild(marker)
  const container = document.createElement('div')
  container.id = 'app'
  container.innerHTML = '<section><h1>Static fallback</h1><p>unclaimed server nodes</p></section>'
  document.body.appendChild(container)
  const path = window.location.pathname
  const globals = window as unknown as { __PYREON_LOADER_DATA__?: Record<string, unknown> }
  const saved = globals.__PYREON_LOADER_DATA__
  globals.__PYREON_LOADER_DATA__ = { [path]: { title: 'wrong fallback loader data' } }
  let loads = 0
  let clicks = 0
  const cleanup = startClient({ routes: [{
    path,
    loader: async () => {
      loads++
      return { title: 'Requested route' }
    },
    component: () => {
      return h('div', null,
        h('h1', null, () => useLoaderData<{ title: string }>()?.title ?? 'Loading'),
        h('button', { onClick: () => { clicks++ } }, 'Click'),
      )
    },
  }] })
  try {
    await expect.poll(() => container.querySelector('h1')?.textContent).toBe('Requested route')
    expect(loads).toBe(1)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.textContent).not.toContain('unclaimed server nodes')
    expect(container.textContent).not.toContain('wrong fallback loader data')
    expect(container.hasAttribute('data-pyreon-hydrated')).toBe(true)
    container.querySelector('button')!.click()
    expect(clicks).toBe(1)
  } finally {
    cleanup()
    container.remove()
    marker.remove()
    if (saved === undefined) delete globals.__PYREON_LOADER_DATA__
    else globals.__PYREON_LOADER_DATA__ = saved
  }
})
