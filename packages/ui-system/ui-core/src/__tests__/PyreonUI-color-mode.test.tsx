// <PyreonUI mode> provides the framework-wide mode (`useColorMode` from
// @pyreon/core), so charts, flow and the code editor below it follow the UI
// system's mode with no wiring of their own.
import { useColorMode } from '@pyreon/core'
import { effectScope, setContextOwner, signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { PyreonUI } from '../PyreonUI'

function under(render: () => void): () => 'light' | 'dark' {
  const outer = effectScope()
  const prev = setContextOwner(outer)
  try {
    render()
    const child = effectScope()
    child._parent = outer
    setContextOwner(child)
    return useColorMode()
  } finally {
    setContextOwner(prev)
  }
}

describe('PyreonUI provides the shared color mode', () => {
  it('a fixed mode', () => {
    expect(under(() => PyreonUI({ mode: 'dark', children: null }))()).toBe('dark')
    expect(under(() => PyreonUI({ mode: 'light', children: null }))()).toBe('light')
  })

  it('follows a reactive mode', () => {
    const m = signal<'light' | 'dark'>('light')
    const mode = under(() => PyreonUI({ mode: () => m(), children: null }))
    expect(mode()).toBe('light')
    m.set('dark')
    expect(mode()).toBe('dark')
  })

  it('an inversed PyreonUI provides the flipped mode', () => {
    const mode = under(() => PyreonUI({ mode: 'dark', inversed: true, children: null }))
    expect(mode()).toBe('light')
  })
})
