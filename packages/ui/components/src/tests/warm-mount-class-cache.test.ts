/**
 * Warm mounts of a shipped component must not re-resolve its CSS.
 *
 * The styler caches a dynamic component's class per key pair and per value of
 * every other prop its styles read; styles that ENUMERATE the props (a
 * `{ theme, ...rest }` rest spread, `Object.keys`, `{ ...props }`) may depend on
 * any of them, so their class is never cached. One such spread in a shared
 * helper (`makeItResponsive`) silently turned the cache off for every
 * component built on the `el` / `txt` bases: each mount re-ran the whole
 * resolve. This guard mounts a spread of real components warm and counts
 * `styler.resolve` (the dev counter), so the class cannot come back unnoticed.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { Badge, Box, Button, Card, Center, Chip, Code, Group, Kbd, Paragraph, Stack, Title } from '../index'

type AnyComp = (props: Record<string, unknown>) => unknown

const sink = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }

const countResolves = (fn: () => void): number => {
  let n = 0
  const prev = sink.__pyreon_count__
  sink.__pyreon_count__ = (name) => {
    if (name === 'styler.resolve') n++
  }
  try {
    fn()
  } finally {
    sink.__pyreon_count__ = prev
  }

  return n
}

let cleanups: (() => void)[] = []

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

const render = (Comp: AnyComp, props: Record<string, unknown> = {}): void => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(h(PyreonUI as never, { theme }, h(Comp as never, props, 'x')), root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })
}

const components: [string, unknown][] = [
  ['Box', Box],
  ['Stack', Stack],
  ['Group', Group],
  ['Center', Center],
  ['Title', Title],
  ['Paragraph', Paragraph],
  ['Button', Button],
  ['Badge', Badge],
  ['Chip', Chip],
  ['Card', Card],
  ['Kbd', Kbd],
  ['Code', Code],
]

describe('warm mounts hit the styler class cache', () => {
  for (const [name, Comp] of components) {
    it(`${name}: 10 warm mounts resolve nothing`, () => {
      render(Comp as AnyComp) // cold
      expect(countResolves(() => {
        for (let i = 0; i < 10; i++) render(Comp as AnyComp)
      })).toBe(0)
    })
  }

  it('Button with a fresh onClick per instance still hits (handlers are keyed by presence)', () => {
    render(Button as AnyComp, { onClick: () => {} })
    expect(countResolves(() => {
      for (let i = 0; i < 10; i++) render(Button as AnyComp, { onClick: () => {} })
    })).toBe(0)
  })
})
