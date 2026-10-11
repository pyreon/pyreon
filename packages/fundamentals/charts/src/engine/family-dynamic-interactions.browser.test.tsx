import { _rp, h, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Arc, Chart, PieChart, Toolbox, Tooltip } from '../engine'

interface Row { label: string; value: number }
const DATA: Row[] = [{ label: 'Direct', value: 60 }, { label: 'Search', value: 40 }]
const OPTIONS = { data: DATA, width: 300, height: 240, animate: false, updateAnimation: false }
const move = (canvas: HTMLCanvasElement): void => {
  const r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 160, clientY: r.top + 90 }))
}
const clickTool = (canvas: HTMLCanvasElement): void => {
  const r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + 292, clientY: r.top + 9 }))
}
const pickWithKeyboard = (canvas: HTMLCanvasElement): void => {
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }))
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
}

for (const grammar of [false, true]) {
  describe(`${grammar ? 'grammar' : 'direct'} family dynamic interactions`, () => {
    it('enables, disables and re-enables its tooltip without replacing the canvas', async () => {
      const enabled = signal(false)
      const view = mountInBrowser(grammar
        ? h(Chart<Row>, OPTIONS, h(Arc<Row>, { value: 'value', label: 'label', showLabels: false }), h(Show, { when: enabled }, h(Tooltip, {})))
        : h(PieChart<Row>, { ...OPTIONS, value: (row: Row) => row.value, label: (row: Row) => row.label, showLabels: false, tooltip: _rp(enabled) }))
      onTestFinished(view.unmount)
      await flush()
      const canvas = view.container.querySelector('canvas')!
      expect(view.container.querySelector('[data-pyreon-chart-tooltip]')).toBeNull()
      for (let i = 0; i < 2; i++) {
        enabled.set(true)
        await flush()
        expect(view.container.querySelector('canvas')).toBe(canvas)
        const tooltip = view.container.querySelector<HTMLElement>('[data-pyreon-chart-tooltip]')!
        expect(tooltip).not.toBeNull()
        move(canvas)
        await flush()
        expect(tooltip.style.display).toBe('block')
        expect(tooltip.textContent).toContain('Direct')
        enabled.set(false)
        await flush()
        expect(view.container.querySelector('[data-pyreon-chart-tooltip]')).toBeNull()
      }
    })

    it('updates toolbox drawing and hit targets in place', async () => {
      const enabled = signal(false)
      const saved: string[] = []
      const options = { ...OPTIONS, onSaveImage: (url: string) => saved.push(url) }
      const view = mountInBrowser(grammar
        ? h(Chart<Row>, options, h(Arc<Row>, { value: 'value', label: 'label' }), h(Show, { when: enabled }, h(Toolbox, { saveAsImage: true })))
        : h(PieChart<Row>, { ...options, value: (row: Row) => row.value, label: (row: Row) => row.label, toolbox: _rp(() => ({ saveAsImage: enabled() })) }))
      onTestFinished(view.unmount)
      await flush()
      const canvas = view.container.querySelector('canvas')!
      const before = canvas.toDataURL()
      clickTool(canvas)
      expect(saved).toHaveLength(0)
      enabled.set(true)
      await flush()
      expect(view.container.querySelector('canvas')).toBe(canvas)
      expect(canvas.toDataURL()).not.toBe(before)
      clickTool(canvas)
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatch(/^data:image\/png/)
      enabled.set(false)
      await flush()
      expect(canvas.toDataURL()).toBe(before)
      clickTool(canvas)
      expect(saved).toHaveLength(1)
    })

    it('updates keyboard focusability, selection and announcements in place', async () => {
      const enabled = signal(false)
      const selected: number[] = []
      const options = { ...OPTIONS, keyboard: _rp(enabled), onSelect: (index: number) => selected.push(index) }
      const view = mountInBrowser(grammar
        ? h(Chart<Row>, options, h(Arc<Row>, { value: 'value', label: 'label' }))
        : h(PieChart<Row>, { ...options, value: (row: Row) => row.value, label: (row: Row) => row.label }))
      onTestFinished(view.unmount)
      await flush()
      const canvas = view.container.querySelector('canvas')!
      expect(canvas.hasAttribute('tabindex')).toBe(false)
      pickWithKeyboard(canvas)
      expect(selected).toEqual([])
      enabled.set(true)
      await flush()
      expect(view.container.querySelector('canvas')).toBe(canvas)
      expect(canvas.tabIndex).toBe(0)
      pickWithKeyboard(canvas)
      await flush()
      expect(selected).toEqual([0])
      expect(view.container.querySelector('[role=status]')?.textContent).toContain('Direct')
      enabled.set(false)
      await flush()
      expect(canvas.hasAttribute('tabindex')).toBe(false)
      expect(view.container.querySelector('[role=status]')).toBeNull()
      pickWithKeyboard(canvas)
      expect(selected).toEqual([0])
    })

    it('updates accessible table presence and its canvas relationship in place', async () => {
      const enabled = signal(false)
      const options = { ...OPTIONS, accessibleTable: _rp(enabled) }
      const view = mountInBrowser(grammar
        ? h(Chart<Row>, options, h(Arc<Row>, { value: 'value', label: 'label' }))
        : h(PieChart<Row>, { ...options, value: (row: Row) => row.value, label: (row: Row) => row.label }))
      onTestFinished(view.unmount)
      await flush()
      const canvas = view.container.querySelector('canvas')!
      expect(canvas.hasAttribute('aria-describedby')).toBe(false)
      expect(view.container.querySelector('table')).toBeNull()
      enabled.set(true)
      await flush()
      expect(view.container.querySelector('canvas')).toBe(canvas)
      const table = view.container.querySelector('table')!
      expect(table).not.toBeNull()
      expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
      expect(canvas.getAttribute('aria-describedby')).toBe(table.id)
      enabled.set(false)
      await flush()
      expect(canvas.hasAttribute('aria-describedby')).toBe(false)
      expect(view.container.querySelector('table')).toBeNull()
    })
  })
}
