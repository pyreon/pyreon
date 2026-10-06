import { _rp, h, makeReactiveProps, mergeProps, splitProps } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { Arc, Axis, Bar, Chart, Dot, Histogram, Label, Legend, Line, Rule, Scale, Tooltip, Toolbox, Zoom, resolveGrammar } from './grammar'

// A mark is data, never mounted, so `makeReactiveProps` never runs on its props:
// the compiler's `_rp(() => props.x)` brand reaches the resolver raw. These
// specs build the exact shape the compiler emits (`_rp`) through real `h()`.
interface Row { label: string; value: number }
const ROWS: Row[] = [{ label: 'Example', value: 2 }]

describe('branded (_rp) props on mark vnodes', () => {
  it('stack / hidden flags (the issue repro) resolve through the brand', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'label' }, [
      h(Bar<Row>, { y: 'value', stack: _rp(() => true) }),
      h(Axis, { x: true, hidden: _rp(() => true) }),
    ])
    expect(g.marks[0]!.kind).toBe('stacked')
    expect(g.props.showXAxis).toBe(false)
  })

  it('Chart: the plot receives showXAxis=false and a stacked mark (issue executable repro shape)', () => {
    const root = h(Chart<Row>, { data: ROWS, x: 'label', children: [h(Bar<Row>, { y: 'value', stack: _rp(() => true) }), h(Axis, { x: true, hidden: _rp(() => true) })] })
    const plot = (Chart as unknown as (p: Record<string, unknown>) => () => VNode)(makeReactiveProps(root.props as Record<string, unknown>))()
    const props = makeReactiveProps(plot.props as Record<string, unknown>)
    expect(props.showXAxis).toBe(false)
    expect((props.marks as { kind: string }[])[0]!.kind).toBe('stacked')
  })

  it('a signal behind the brand re-resolves the marks and the axis', () => {
    const on = signal(false)
    const children = [h(Bar<Row>, { y: 'value', stack: _rp(() => on()) }), h(Axis, { x: true, hidden: _rp(() => on()) })]
    const root = h(Chart<Row>, { data: ROWS, x: 'label', children })
    const plot = (Chart as unknown as (p: Record<string, unknown>) => () => VNode)(makeReactiveProps(root.props as Record<string, unknown>))()
    const props = makeReactiveProps(plot.props as Record<string, unknown>)
    expect((props.marks as { kind: string }[])[0]!.kind).toBe('bars')
    expect(props.showXAxis).toBeUndefined()
    on.set(true)
    expect((props.marks as { kind: string }[])[0]!.kind).toBe('stacked')
    expect(props.showXAxis).toBe(false)
    on.set(false)
    expect((props.marks as { kind: string }[])[0]!.kind).toBe('bars')
  })

  it('every non-mark child kind resolves its branded props (Rule, Label, Axis y, Scale, Tooltip, Legend, Toolbox, Zoom)', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'label' }, [
      h(Rule, { y: _rp(() => 5), label: _rp(() => 'cap'), color: _rp(() => 'red') }),
      h(Label, { text: _rp(() => 'hi'), at: _rp(() => 0), radius: _rp(() => 4) }),
      h(Axis, { hidden: _rp(() => true), title: _rp(() => 'Y'), scale: _rp(() => 'log') }),
      h(Scale, { normalize: _rp(() => true), y: _rp(() => 'log') }),
      h(Tooltip, { crosshair: _rp(() => true) }),
      h(Legend, { toggle: _rp(() => false), position: _rp(() => 'bottom') }),
      h(Toolbox, { saveAsImage: _rp(() => true) }),
      h(Zoom, { navigator: _rp(() => true), inside: _rp(() => false) }),
    ])
    expect(g.props.annotations).toEqual([{ y: 5, label: 'cap', color: 'red' }])
    expect(g.props.markers).toEqual([{ label: 'hi', atIndex: 0, radius: 4 }])
    expect(g.props.showYAxis).toBe(false)
    expect(g.props.yTitle).toBe('Y')
    expect(g.props.yScale).toBe('log')
    expect(g.props.stackNormalize).toBe(true)
    expect(g.props.crosshair).toBe(true)
    expect(g.props.legendToggle).toBe(false)
    expect(g.props.legendPosition).toBe('bottom')
    expect(g.props.toolbox).toEqual({ saveAsImage: true })
    expect(g.props.navigator).toBe(true)
    expect(g.props.dataZoom).toBeUndefined()
  })

  it('long-format (color channel) pivot and bubble/histogram/family marks resolve the brand', () => {
    const long = [{ label: 'a', value: 1, s: 'x' }, { label: 'a', value: 2, s: 'y' }]
    const g = resolveGrammar<(typeof long)[number]>(long, { data: long, x: 'label', color: 's' }, [h(Bar<(typeof long)[number]>, { y: 'value', stack: _rp(() => true) })])
    expect(g.marks.every((m) => m.kind === 'stacked')).toBe(true)
    const d = resolveGrammar<Row>(ROWS, { data: ROWS }, [h(Dot<Row>, { y: 'value', r: 'value', minRadius: _rp(() => 3) })])
    expect(d.marks).toHaveLength(1)
    const hi = resolveGrammar<Row>(ROWS, { data: ROWS }, [h(Histogram<Row>, { x: 'value', bins: _rp(() => 3) })])
    expect(hi.marks).toHaveLength(1)
    const fam = resolveGrammar<Row>(ROWS, { data: ROWS }, [h(Arc<Row>, { value: 'value', inner: _rp(() => 0.5) } as never)])
    expect(fam.family!.props.inner).toBe(0.5)
  })

  it('channel accessors, format and handlers are NOT called (only branded thunks are)', () => {
    const y = vi.fn((d: Row) => d.value)
    const format = vi.fn((n: number) => String(n))
    const onX = vi.fn()
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'label' }, [
      h(Line<Row>, { y, label: 'L', onX } as never),
      h(Axis, { format }),
    ])
    expect(y).not.toHaveBeenCalled()
    expect(format).not.toHaveBeenCalled()
    expect(onX).not.toHaveBeenCalled()
    expect(g.props.format).toBe(format)
  })

  it('a branded thunk that RETURNS a channel accessor yields the accessor uncalled', () => {
    const fn = (d: Row) => d.value * 10
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'label' }, [h(Bar<Row>, { y: _rp(() => fn) })])
    expect(g.marks[0]!.kind).toBe('bars')
  })

  it('static props are unchanged, and a `let` snapshot (plain value) still works', () => {
    const g = resolveGrammar<Row>(ROWS, { data: ROWS, x: 'label' }, [h(Bar<Row>, { y: 'value', stack: true }), h(Axis, { x: true, hidden: true })])
    expect(g.marks[0]!.kind).toBe('stacked')
    expect(g.props.showXAxis).toBe(false)
  })

  it('getter-backed props (splitProps / mergeProps) stay live', () => {
    const on = signal(false)
    const src = {} as { stack: boolean }
    Object.defineProperty(src, 'stack', { get: () => on(), enumerable: true, configurable: true })
    const [own] = splitProps(src, ['stack'])
    const merged = mergeProps({ y: 'value' } as Record<string, unknown>, own)
    const root = h(Chart<Row>, { data: ROWS, x: 'label', children: [h(Bar<Row>, merged as never)] })
    const plot = (Chart as unknown as (p: Record<string, unknown>) => () => VNode)(makeReactiveProps(root.props as Record<string, unknown>))()
    const props = makeReactiveProps(plot.props as Record<string, unknown>)
    expect((props.marks as { kind: string }[])[0]!.kind).toBe('bars')
    on.set(true)
    expect((props.marks as { kind: string }[])[0]!.kind).toBe('stacked')
  })

  it('a branded `when` on a <Show> around a mark is resolved', async () => {
    const { Show } = await import('@pyreon/core')
    const on = signal(false)
    const root = h(Chart<Row>, { data: ROWS, x: 'label', children: [h(Show, { when: _rp(() => on()) }, h(Bar<Row>, { y: 'value' }))] })
    const plot = (Chart as unknown as (p: Record<string, unknown>) => () => VNode)(makeReactiveProps(root.props as Record<string, unknown>))()
    const props = makeReactiveProps(plot.props as Record<string, unknown>)
    expect(props.marks as unknown[]).toHaveLength(0)
    on.set(true)
    expect(props.marks as unknown[]).toHaveLength(1)
  })
})
