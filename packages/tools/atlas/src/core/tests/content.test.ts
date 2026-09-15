/**
 * The content seed — what a derived scenario renders WITH.
 *
 * The bug class this locks: every derived scenario used to mount a component
 * with its dimension props and nothing else, so the deployed workbench showed
 * 108 empty shells while the scan reported them all verified. The seed is
 * pure JSON, so the shape tests are plain; `materializeContent` is the one
 * place the JSON becomes vnodes, so it is tested through a real `h`.
 */
import { h as coreH } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import {
  deriveContent,
  isContainer,
  isContentBlocks,
  materializeContent,
  PLACEHOLDER_IMAGE,
  seedArgs,
} from '../content'

// The harness contract is the loosest possible `h` — the runtime's own, untyped.
const h = coreH as unknown as (type: unknown, props?: unknown, ...children: unknown[]) => ReturnType<typeof coreH>

describe('deriveContent', () => {
  it('gives a text component its own name as children, with a text control', () => {
    const seed = deriveContent({ name: 'Button', tag: 'button' })
    expect(seed.args).toEqual({ children: 'Button' })
    expect(seed.controls).toEqual([
      { name: 'children', kind: 'text', defaultValue: 'Button', reactive: false, required: false },
    ])
  })

  it('treats an unknown tag as text — visible beats empty', () => {
    expect(deriveContent({ name: 'Badge' }).args).toEqual({ children: 'Badge' })
    expect(deriveContent({ name: 'Alert', tag: 'div' }).args).toEqual({ children: 'Alert' })
  })

  it('gives an <img> a real, network-free source and an alt', () => {
    const seed = deriveContent({ name: 'Image', tag: 'img' })
    expect(seed.args).toEqual({ src: PLACEHOLDER_IMAGE, alt: 'Image placeholder' })
    expect(PLACEHOLDER_IMAGE.startsWith('data:image/svg+xml')).toBe(true)
    expect(seed.controls.map((c) => c.name)).toEqual(['src', 'alt'])
  })

  it('gives a field a placeholder, never children', () => {
    expect(deriveContent({ name: 'Input', tag: 'input' }).args).toEqual({ placeholder: 'Type here…' })
    expect(deriveContent({ name: 'Textarea', tag: 'textarea' }).args).toEqual({ placeholder: 'Type here…' })
  })

  it('seeds NOTHING for a tag that cannot carry content', () => {
    for (const tag of ['hr', 'br', 'video', 'canvas', 'select']) {
      expect(deriveContent({ name: 'X', tag })).toEqual({ args: {}, controls: [] })
    }
  })

  it('seeds NOTHING for a container no generic block can legally fill', () => {
    // A `<div>` inside `<table>` is foster-parented out by the HTML parser,
    // so SSR and the client mount disagree and the parity check blames the
    // component. Measured: every Table scenario of ui-components failed SSR
    // parity the moment the seed landed.
    for (const tag of ['table', 'tbody', 'tr', 'dl']) {
      expect(deriveContent({ name: 'Table', tag }), tag).toEqual({ args: {}, controls: [] })
    }
  })

  it('fills a list with <li> blocks, never <div>', async () => {
    const seed = deriveContent({ name: 'Breadcrumb', tag: 'ul' })
    expect(seed.args.children).toEqual({ __atlasContent: 'blocks', count: 3, tag: 'li' })
    const { children } = materializeContent(seed.args, h)
    const html = await renderToString(h('ul', {}, ...children) as never)
    expect(html.match(/<li data-atlas-content="block"/g)).toHaveLength(3)
  })

  it('gives a layout container placeholder blocks and NO control', () => {
    const seed = deriveContent({ name: 'Stack', tag: 'div' })
    expect(isContentBlocks(seed.args.children)).toBe(true)
    expect(seed.controls).toEqual([])
  })
})

describe('isContainer', () => {
  it('matches layout NAMES by suffix', () => {
    for (const name of ['Stack', 'VStack', 'ButtonGroup', 'SimpleGrid', 'Box', 'Center', 'AspectRatio', 'ScrollArea'])
      expect(isContainer({ name, tag: 'div' }), name).toBe(true)
  })
  it('matches list/table/landmark TAGS regardless of name', () => {
    expect(isContainer({ name: 'Breadcrumb', tag: 'ul' })).toBe(true)
    expect(isContainer({ name: 'Nav', tag: 'nav' })).toBe(true)
  })
  it('leaves text components alone', () => {
    for (const name of ['Button', 'Badge', 'Title', 'Alert', 'Chip'])
      expect(isContainer({ name, tag: 'div' }), name).toBe(false)
  })
})

describe('materializeContent', () => {
  it('passes a string child through as ONE rest child, off the props', () => {
    const { props, children } = materializeContent({ children: 'Hi', size: 'sm' }, h)
    expect(props).toEqual({ size: 'sm' })
    expect(children).toEqual(['Hi'])
  })

  it('leaves args without children untouched', () => {
    const args = { size: 'sm' }
    expect(materializeContent(args, h)).toEqual({ props: args, children: [] })
  })

  it('turns the blocks marker into real elements through the GIVEN h', async () => {
    const marker = { __atlasContent: 'blocks', count: 3 }
    const { props, children } = materializeContent({ children: marker, gap: 'sm' }, h)
    expect(props).toEqual({ gap: 'sm' })
    expect(children).toHaveLength(3)
    // Rendered through the real pipeline, not read off a vnode shape.
    const html = await renderToString(h('section', {}, ...children) as never)
    expect(html.match(/<div data-atlas-content="block"/g)).toHaveLength(3)
    expect(html).toContain('>1</div>')
  })

  it('survives a marker whose count round-tripped badly', () => {
    expect(materializeContent({ children: { __atlasContent: 'blocks', count: 0 } }, h).children).toHaveLength(3)
    expect(materializeContent({ children: { __atlasContent: 'blocks', count: 999 } }, h).children).toHaveLength(12)
  })
})

describe('seedArgs', () => {
  it('merges UNDER the scenario — an authored value wins key by key', () => {
    expect(seedArgs({ children: 'Button', src: 'x' }, { children: '' })).toEqual({ children: '', src: 'x' })
  })
  it('is the identity without a seed', () => {
    const args = { a: 1 }
    expect(seedArgs(undefined, args)).toBe(args)
  })
})
