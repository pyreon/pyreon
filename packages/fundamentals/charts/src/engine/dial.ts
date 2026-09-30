// The gauge dial's builder and its theming. Kept out of gauge-dial.ts, which
// is generated into the native runtimes; both are web-side steps that produce
// the plain `DialSpec` the renderer draws.

import type { DialDatum, DialLen, DialSpec } from './gauge-dial'
import type { Double } from './types'
import { defaultTheme } from './render'
import type { ChartTheme } from './render'

/** The light-theme tokens the dial defaults are drawn in. */
const TOKEN = {
  band: '#e8ebf0', // neutral10
  splitLine: '#54555a', // axisTick
  tick: '#6d6e73', // axisTickMinor
  label: '#54555a', // axisLabel
  title: '#54555a', // secondary
  detail: '#3c3c41', // primary
  anchor: '#fff', // neutral00
  anchorBorder: '#5070dd', // theme[0]
}

/**
 * The dial under a THEME. The dial's defaults are light-theme tokens (dark
 * grey text, a near-white track); under the default theme they stay as they
 * are, and under any other a colour still equal to its default
 * takes the theme's own token instead — the detail value is the theme's text,
 * the labels and title its label colour, the track its muted colour. A colour
 * set differently is left alone. Without this a gauge under a dark
 * theme drew its value in #3c3c41 on a #141821 ground.
 */
export function themedDial(dial: DialSpec, t: ChartTheme): DialSpec {
  if (t.text === defaultTheme.text && t.label === defaultTheme.label) return dial
  const swap = (c: string, from: string, to: string): string => (c === from ? to : c)
  return {
    ...dial,
    stops: dial.stops.map((st) => ({ at: st.at, color: swap(st.color, TOKEN.band, t.muted) })),
    splitColor: swap(dial.splitColor, TOKEN.splitLine, t.axis),
    tickColor: swap(dial.tickColor, TOKEN.tick, t.axis),
    labelColor: swap(dial.labelColor, TOKEN.label, t.label),
    titleColor: swap(dial.titleColor, TOKEN.title, t.label),
    detailColor: swap(dial.detailColor, TOKEN.detail, t.text),
    anchorColor: swap(dial.anchorColor, TOKEN.anchor, t.surface),
  }
}

const RADIAN = Math.PI / 180.0
const px = (v: Double): DialLen => ({ v, pct: false })
const pc = (v: Double): DialLen => ({ v, pct: true })

/** The sweep from `start` to `end`, going the given way round, within one turn. */
function arcSweep(start: Double, end: Double, clockwise: boolean): Double {
  const TAU = Math.PI * 2.0
  let s0 = start % TAU
  if (s0 < 0) s0 += TAU
  let e = end + (s0 - start)
  if (clockwise && e - s0 >= TAU) e = s0 + TAU
  else if (!clockwise && s0 - e >= TAU) e = s0 - TAU
  else if (clockwise && s0 > e) e = s0 + (TAU - ((s0 - e) % TAU))
  else if (!clockwise && s0 < e) e = s0 - (TAU - ((e - s0) % TAU))
  return Math.abs(e - s0)
}

/** One value on a `gaugeDial()`; only `value` is required. */
export type GaugeDialValue = Double | (Partial<DialDatum> & { value: Double })

/** What `gaugeDial()` takes. Every field is optional except `data`. */
export type GaugeDialOptions = Partial<Omit<DialSpec, 'data' | 'labels' | 'start' | 'sweep'>> & {
  /** The values the dial points at — one pointer (and progress arc) each. */
  data: GaugeDialValue[]
  /** Where the dial starts and ends, in degrees counter-clockwise from 3 o'clock. Default 225 and -45. */
  startAngle?: Double
  endAngle?: Double
  /** Formats the axis labels and each value's detail. Default the number as written. */
  format?: (value: Double) => string
}

/**
 * A full gauge dial — colour bands, split lines, ticks, labels, a pointer and
 * progress arc per value, titles and details — for `<GaugeChart dial>`. Every
 * part is defaulted; pass only what you change.
 *
 * @example
 * <GaugeChart value={72} dial={gaugeDial({ data: [{ value: 72, name: 'CPU' }], progressShow: true, stops: [{ at: 0.7, color: '#16a34a' }, { at: 1, color: '#dc2626' }] })} />
 */
export function gaugeDial(o: GaugeDialOptions): DialSpec {
  const { data: rawData, startAngle, endAngle, format, ...rest } = o
  const fmt = format ?? ((v: Double): string => String(v))
  const start = -(startAngle ?? 225.0) * RADIAN
  const clockwise = rest.clockwise ?? true
  const sweep = arcSweep(start, -(endAngle ?? -45.0) * RADIAN, clockwise)
  const min = rest.min ?? 0.0
  const max = rest.max ?? 100.0
  const splitNumber = Math.max(1, Math.round(rest.splitNumber ?? 10))
  const labels: string[] = []
  for (let i = 0; i <= splitNumber; i++) labels.push(fmt(Number(((i * (max - min)) / splitNumber + min).toFixed(10))))
  const data: DialDatum[] = rawData.map((d) => {
    const own = typeof d === 'number' ? { value: d } : d
    return {
      name: '',
      detail: fmt(own.value),
      color: '',
      pointerColor: '',
      progressColor: '',
      titleX: px(0),
      titleY: pc(0.2),
      detailX: px(0),
      detailY: pc(0.4),
      ...own,
    }
  })
  return {
    clockwise,
    min,
    max,
    splitNumber,
    lineShow: true,
    lineWidth: 10.0,
    stops: [{ at: 1.0, color: TOKEN.band }],
    lineRound: false,
    progressShow: false,
    progressRound: false,
    progressOverlap: true,
    progressWidth: 10.0,
    progressClip: true,
    splitShow: true,
    splitLength: px(10),
    splitDistance: 10.0,
    splitColor: TOKEN.splitLine,
    splitWidth: 3.0,
    tickShow: true,
    tickSplit: 5,
    tickLength: px(6),
    tickDistance: 10.0,
    tickColor: TOKEN.tick,
    tickWidth: 1.0,
    labelShow: true,
    labelDistance: 15.0,
    labelColor: TOKEN.label,
    labelSize: 12.0,
    labelRotate: '',
    labelDegrees: 0.0,
    pointerShow: true,
    pointerIcon: '',
    pointerAbove: true,
    pointerLength: pc(0.6),
    pointerWidth: px(6),
    pointerX: px(0),
    pointerY: px(0),
    anchorShow: false,
    anchorIcon: 'circle',
    anchorAbove: false,
    anchorSize: 6.0,
    anchorColor: TOKEN.anchor,
    anchorBorder: TOKEN.anchorBorder,
    anchorBorderWidth: 0.0,
    anchorX: px(0),
    anchorY: px(0),
    titleShow: true,
    titleColor: TOKEN.title,
    titleSize: 16.0,
    detailShow: true,
    detailColor: TOKEN.detail,
    detailSize: 30.0,
    detailBold: true,
    detailBg: '',
    detailBorder: '#9ea0a5',
    detailBorderWidth: 0.0,
    detailWidth: 100.0,
    detailHeight: -1.0,
    detailPadding: [5.0, 10.0, 5.0, 10.0],
    ...rest,
    start,
    sweep,
    labels,
    data,
  }
}
