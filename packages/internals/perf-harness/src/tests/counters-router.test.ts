// @vitest-environment happy-dom
/**
 * Per-counter behavioural tests for @pyreon/router.
 */
import { h } from '@pyreon/core'
import { createRouter, prefetchLoaderData } from '@pyreon/router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

const dummy = () => h('div', null)
const makeRoutes = () => [
  { path: '/', component: dummy },
  { path: '/a', component: dummy },
  { path: '/b', component: dummy },
  {
    path: '/with-loader',
    component: dummy,
    loader: async () => ({ data: 42 }),
  },
]

describe('router.navigate', () => {
  it('fires once per router.push / replace', async () => {
    const router = createRouter({ routes: makeRoutes(), mode: 'history' })
    const outcome = await perfHarness.record('navigate-x3', async () => {
      await router.push('/a')
      await router.push('/b')
      await router.replace('/')
    })
    expect(outcome.after['router.navigate']).toBe(3)
  })
})

describe('router.loaderRun / router.loaderCache.hit', () => {
  it('loaderRun fires on first visit; loaderCache.hit fires on revisits', async () => {
    const router = createRouter({ routes: makeRoutes(), mode: 'history' })
    const outcome = await perfHarness.record('loader-cache', async () => {
      await router.push('/with-loader') // runs loader (fire 1)
      await router.push('/a') // no loader
      await router.push('/with-loader') // cache hit
      await router.push('/a') // no loader
      await router.push('/with-loader') // cache hit
    })
    expect(outcome.after['router.loaderRun']).toBe(1)
    expect(outcome.after['router.loaderCache.hit']).toBe(2)
  })
})

describe('router.prefetch', () => {
  it('fires once per prefetchLoaderData() call', async () => {
    const router = createRouter({ routes: makeRoutes(), mode: 'history' })
    const outcome = await perfHarness.record('prefetch-x2', async () => {
      await prefetchLoaderData(router as never, '/with-loader')
      await prefetchLoaderData(router as never, '/with-loader')
    })
    expect(outcome.after['router.prefetch']).toBe(2)
  })
})
