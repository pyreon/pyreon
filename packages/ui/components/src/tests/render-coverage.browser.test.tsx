/** @jsxImportSource @pyreon/core */
/**
 * Render coverage for the components the 2026-07-21 audit found with ZERO
 * render tests (roadmap B20) — previously only export-existence assertions.
 * Every case MOUNTS the real component inside PyreonUI + the real theme in
 * this file's environment (real Chromium via test:browser; the node config
 * re-runs it under happy-dom, which still exercises mount + attributes).
 *
 * Baseline per component: mounts without throwing + renders its expected
 * tag/content; semantic components get one structural assertion.
 */
import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { describe, expect, it } from 'vitest'
import {
  AspectRatio,
  Avatar,
  Badge,
  ButtonGroup,
  Chip,
  Code,
  ColorSwatch,
  DatePicker,
  DateRangePicker,
  DateTimePicker,
  Dialog,
  Divider,
  Drawer,
  FormField,
  Group,
  Highlight,
  Image,
  Indicator,
  Input,
  InputGroup,
  Kbd,
  Menu,
  MonthPicker,
  Paragraph,
  Popover,
  Progress,
  GridContainer,
  Skeleton,
  Stack,
  TimePicker,
  Title,
  VisuallyHidden,
} from '../index'

type Case = {
  name: string
  mount: () => VNodeChild
  /** testid to locate; assert receives the element. */
  assert?: (el: HTMLElement) => void
}

const tid = (n: string) => `rc-${n.toLowerCase()}`

// One case per previously-uncovered component. Dimension props are STRINGS
// (useBooleans: false); each mount carries a data-testid for location.
const CASES: Case[] = [
  { name: 'AspectRatio', mount: () => h(AspectRatio as never, { 'data-testid': tid('AspectRatio') }, h('img', { alt: '' })) },
  { name: 'Avatar', mount: () => h(Avatar as never, { 'data-testid': tid('Avatar') }, 'AB') },
  { name: 'Badge', mount: () => h(Badge as never, { 'data-testid': tid('Badge') }, 'New'),
    assert: (el) => expect(el.tagName).toBe('SPAN') },
  { name: 'ButtonGroup', mount: () => h(ButtonGroup as never, { 'data-testid': tid('ButtonGroup') }, h('button', {}, 'a')) },
  { name: 'Chip', mount: () => h(Chip as never, { 'data-testid': tid('Chip') }, 'tag') },
  { name: 'Code', mount: () => h(Code as never, { 'data-testid': tid('Code') }, 'x = 1'),
    assert: (el) => expect(el.tagName).toBe('CODE') },
  { name: 'ColorSwatch', mount: () => h(ColorSwatch as never, { 'data-testid': tid('ColorSwatch') }) },
  { name: 'DatePicker', mount: () => h(DatePicker as never, { 'data-testid': tid('DatePicker') }) },
  { name: 'DateRangePicker', mount: () => h(DateRangePicker as never, { 'data-testid': tid('DateRangePicker') }) },
  { name: 'DateTimePicker', mount: () => h(DateTimePicker as never, { 'data-testid': tid('DateTimePicker') }) },
  { name: 'Divider', mount: () => h(Divider as never, { 'data-testid': tid('Divider') }),
    assert: (el) => expect(el.tagName).toBe('HR') },
  { name: 'FormField', mount: () => h(FormField as never, { 'data-testid': tid('FormField') }, h('input', {})) },
  { name: 'Group', mount: () => h(Group as never, { 'data-testid': tid('Group') }, 'g') },
  { name: 'Highlight', mount: () => h(Highlight as never, { 'data-testid': tid('Highlight') }, 'hit') },
  { name: 'Image', mount: () => h(Image as never, { 'data-testid': tid('Image'), src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: 'dot' }),
    assert: (el) => { expect(el.tagName).toBe('IMG'); expect(el.getAttribute('alt')).toBe('dot') } },
  { name: 'Indicator', mount: () => h(Indicator as never, { 'data-testid': tid('Indicator') }, '3') },
  { name: 'Input', mount: () => h(Input as never, { 'data-testid': tid('Input'), placeholder: 'p' }),
    assert: (el) => expect(el.tagName).toBe('INPUT') },
  { name: 'InputGroup', mount: () => h(InputGroup as never, { 'data-testid': tid('InputGroup') }, h('input', {})) },
  { name: 'Kbd', mount: () => h(Kbd as never, { 'data-testid': tid('Kbd') }, '⌘K'),
    assert: (el) => expect(el.tagName).toBe('KBD') },
  { name: 'Menu', mount: () => h(Menu as never, { 'data-testid': tid('Menu') }, 'items') },
  { name: 'MonthPicker', mount: () => h(MonthPicker as never, { 'data-testid': tid('MonthPicker') }) },
  { name: 'Paragraph', mount: () => h(Paragraph as never, { 'data-testid': tid('Paragraph') }, 'text'),
    assert: (el) => expect(el.tagName).toBe('P') },
  { name: 'Popover', mount: () => h(Popover as never, { 'data-testid': tid('Popover') }, 'pop') },
  { name: 'Progress', mount: () => h(Progress as never, { 'data-testid': tid('Progress') }) },
  { name: 'SimpleGrid', mount: () => h(GridContainer as never, { 'data-testid': tid('SimpleGrid') }, h('div', {}, 'cell')) },
  { name: 'Skeleton', mount: () => h(Skeleton as never, { 'data-testid': tid('Skeleton') }) },
  { name: 'Stack', mount: () => h(Stack as never, { 'data-testid': tid('Stack') }, 'a') },
  { name: 'TimePicker', mount: () => h(TimePicker as never, { 'data-testid': tid('TimePicker') }) },
  { name: 'Title', mount: () => h(Title as never, { 'data-testid': tid('Title') }, 'Heading'),
    assert: (el) => expect(el.tagName).toMatch(/^H[1-6]$/) },
  { name: 'VisuallyHidden', mount: () => h(VisuallyHidden as never, { 'data-testid': tid('VisuallyHidden') }, 'sr only'),
    assert: (el) => {
      // Visually hidden but present for AT: the clip/1px pattern.
      expect(el.textContent).toBe('sr only')
    } },
]

describe('render coverage — previously-untested components', () => {
  for (const c of CASES) {
    it(`${c.name} mounts and renders`, async () => {
      const { container, unmount } = mountInBrowser(h(PyreonUI, { theme }, c.mount()))
      await flush()
      const el = container.querySelector(`[data-testid="${tid(c.name)}"]`) as HTMLElement | null
      expect(el, `${c.name} must render its root element`).not.toBeNull()
      c.assert?.(el!)
      unmount()
    })
  }

  it('Drawer/Dialog render their dialog when open (ModalBase contract)', async () => {
    const { unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Dialog as never, { open: true, 'aria-label': 'Confirm', 'data-testid': tid('Dialog') }, 'body'),
      ),
    )
    await flush()
    // ModalBase portals to document.body.
    const dlg = document.querySelector(`[data-testid="${tid('Dialog')}"]`)
    expect(dlg, 'open Dialog renders (portaled)').not.toBeNull()
    unmount()

    const b = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Drawer as never, { open: true, 'aria-label': 'Nav', 'data-testid': tid('Drawer') }, 'menu'),
      ),
    )
    await flush()
    expect(document.querySelector(`[data-testid="${tid('Drawer')}"]`)).not.toBeNull()
    b.unmount()
  })
})
