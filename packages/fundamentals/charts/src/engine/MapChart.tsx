// `<MapChart>` — GeoJSON regions filled by value, on a canvas.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import { canvasMeasure, paint, prepareCanvas } from './canvas-web'
import { geoDomain, getMap, hitGeo, layoutGeo, renderGeo } from './geo'
import type { GeoJson, GeoLayout, GeoOptions, GeoRegion } from './geo'
import { chartTable, describeChart } from './a11y'
import type { Double } from './types'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const EMPTY: GeoJson = { type: 'FeatureCollection', features: [] }

export interface MapChartProps {
  /** A GeoJSON collection, or the name of a map registered with `registerMap`. */
  map: GeoJson | string
  values: Record<string, Double> | (() => Record<string, Double>)
  width?: Double
  height?: Double
  options?: GeoOptions
  title?: string
  onSelect?: (region: GeoRegion | null) => void
  accessibleTable?: boolean
  class?: string
}

function drawWidth(el: HTMLCanvasElement, explicit: Double | undefined): Double {
  if (explicit !== undefined) return explicit
  const box = el.parentElement
  const w = box === null ? 0 : box.clientWidth
  return w > 0 ? w : 300
}

export function MapChart(props: MapChartProps): VNode {
  let canvas: HTMLCanvasElement | null = null
  let sizeObserver: ResizeObserver | null = null
  const geo = (): GeoJson => (typeof props.map === 'string' ? getMap(props.map) ?? EMPTY : props.map)
  const readValues = (): Record<string, Double> => (typeof props.values === 'function' ? props.values() : props.values)
  const layoutFor = (w: Double, hgt: Double): GeoLayout => layoutGeo(geo(), { x: 0.0, y: 0.0, w, h: hgt }, props.options)

  const draw = (): void => {
    const el = canvas
    if (el === null) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const ctx = prepareCanvas(el, w, hgt)
    if (ctx === null) return
    paint(ctx, renderGeo(layoutFor(w, hgt), readValues(), props.options, canvasMeasure(ctx, FONT)), w, hgt, FONT)
  }

  effect(() => {
    readValues()
    draw()
  })

  const handleClick = (ev: MouseEvent): void => {
    const el = canvas
    const cb = props.onSelect
    if (el === null || cb === undefined) return
    const w = drawWidth(el, props.width)
    const hgt = props.height ?? 300
    const r = el.getBoundingClientRect()
    cb(hitGeo(layoutFor(w, hgt), ev.clientX - r.left, ev.clientY - r.top))
  }

  const a11y = () => {
    const values = readValues()
    const layout = layoutFor(300, 300)
    const [lo, hi] = geoDomain(layout, values)
    return {
      title: props.title,
      categories: layout.regions.map((r) => r.name),
      series: [{ label: props.title ?? `Values from ${lo} to ${hi}`, values: layout.regions.map((r) => values[r.name] ?? NaN), kind: 'bars' }],
    }
  }

  const canvasNode = h('canvas', {
    class: props.class,
    role: 'img',
    'aria-label': () => describeChart(a11y()),
    ref: (el: HTMLCanvasElement | null) => {
      canvas = el
      sizeObserver?.disconnect()
      sizeObserver = null
      if (el === null) return
      draw()
      const box = el.parentElement
      if (box === null || typeof ResizeObserver === 'undefined') return
      sizeObserver = new ResizeObserver(() => {
        if (canvas === null) return
        const next = drawWidth(canvas, props.width)
        const dpr = typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : 1
        if (Math.round(next * dpr) === canvas.width) return
        draw()
      })
      sizeObserver.observe(box)
    },
    onClick: handleClick,
  })
  if (props.accessibleTable === false) return canvasNode
  const table = (): VNode => {
    const t = chartTable(a11y())
    return h(
      'div',
      { style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;margin:-1px;padding:0' },
      h('table', null,
        h('caption', null, props.title ?? 'Map data'),
        h('thead', null, h('tr', null, ...t.headers.map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, ...t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0] ?? ''), ...r.slice(1).map((c) => h('td', null, c))))),
      ),
    )
  }
  return h('div', { style: 'position:relative' }, canvasNode, () => table())
}
