import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { DateTime, Num } from '../components'
import { machineValue } from '../component-helpers'
import { _resetLocaleState } from '../locale'
import { provideLocale, setLocale } from '../index'

afterEach(() => _resetLocaleState())

function render(vnode: unknown) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const unmount = mount(vnode as never, root)

  return { root, done: () => { unmount(); root.remove() } }
}

describe('<Num> (compiled JSX)', () => {
  it('renders formatted text and updates with the value', () => {
    const n = signal(1234.5)
    // Component props are getters (what the compiler emits for `value={n()}`).
    const { root, done } = render(h('p', null, h(Num, { get value() { return n() }, locale: 'de' })))
    expect(root.textContent).toBe(new Intl.NumberFormat('de').format(1234.5))
    n.set(99999)
    expect(root.textContent).toBe(new Intl.NumberFormat('de').format(99999))
    done()
  })

  it('follows the active locale', () => {
    setLocale('en-US')
    const { root, done } = render(<p><Num value={1234567.5} /></p>)
    expect(root.textContent).toBe(new Intl.NumberFormat('en-US').format(1234567.5))
    setLocale('cs')
    expect(root.textContent).toBe(new Intl.NumberFormat('cs').format(1234567.5))
    done()
  })

  it('kinds', () => {
    const cases: Array<[JSX.Element, string]> = [
      [<Num value={9.99} kind="currency" currency="EUR" locale="en-US" />, new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(9.99)],
      [<Num value={0.42} kind="percent" locale="en-US" />, '42%'],
      [<Num value={1240000} kind="compact" locale="en-US" />, '1.2M'],
      [<Num value={72} kind="unit" unit="kilometer-per-hour" locale="en-US" />, '72 km/h'],
      [<Num value={1536} kind="bytes" locale="en-US" />, '1.5 kB'],
      [<Num value={3.14159} locale="en-US" options={{ maximumFractionDigits: 2 }} />, '3.14'],
    ]
    for (const [node, expected] of cases) {
      const { root, done } = render(<p>{node}</p>)
      expect(root.textContent).toBe(expected)
      done()
    }
  })

  it('nullish and invalid render the fallback', () => {
    const { root, done } = render(<p><Num value={null} fallback="n/a" /></p>)
    expect(root.textContent).toBe('n/a')
    done()
  })

  it('also works through the real h()', () => {
    const { root, done } = render(h('p', null, h(Num, { value: 1234.5, locale: 'en-US' })))
    expect(root.textContent).toBe('1,234.5')
    done()
  })

  it('provideLocale scopes it', () => {
    const Scoped = () => {
      provideLocale('de')
      return <p><Num value={1234.5} /></p>
    }
    const { root, done } = render(<Scoped />)
    expect(root.textContent).toBe(new Intl.NumberFormat('de').format(1234.5))
    done()
  })
})

describe('<DateTime> (compiled JSX)', () => {
  it('renders <time datetime> with a machine-readable value: a calendar date', () => {
    const { root, done } = render(<DateTime value="2026-11-18" kind="date" locale="en-US" />)
    const t = root.querySelector('time')!
    expect(t.getAttribute('datetime')).toBe('2026-11-18')
    expect(t.textContent).toBe('Nov 18, 2026')
    done()
  })

  it('an instant gets its UTC ISO form', () => {
    const at = Date.UTC(2026, 10, 18, 23, 30)
    const { root, done } = render(<DateTime value={at} locale="en-US" timeZone="Asia/Tokyo" />)
    const t = root.querySelector('time')!
    expect(t.getAttribute('datetime')).toBe('2026-11-18T23:30:00.000Z')
    expect(t.textContent).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo' }).format(at))
    done()
  })

  it('a wall-clock date-time keeps its string', () => {
    const { root, done } = render(<DateTime value="2026-11-18T14:30" locale="en-US" />)
    expect(root.querySelector('time')!.getAttribute('datetime')).toBe('2026-11-18T14:30')
    done()
  })

  it('kind and format', () => {
    const { root, done } = render(
      <p>
        <DateTime value="2026-11-18T14:30" kind="time" format="short" locale="en-US" />
        <DateTime value="2026-11-18" kind="date" format="full" locale="en-US" />
        <DateTime value="2026-11-18T14:30" format="long" locale="en-US" />
      </p>,
    )
    const texts = [...root.querySelectorAll('time')].map((t) => t.textContent)
    expect(texts[0]).toBe(new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18, 14, 30)))
    expect(texts[1]).toBe('Wednesday, November 18, 2026')
    expect(texts[2]).toBe(new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2026, 10, 18, 14, 30)))
    done()
  })

  it('updates with the value and the active locale; datetime follows the value', () => {
    const v = signal('2026-11-18')
    setLocale('en-US')
    const { root, done } = render(h(DateTime, { get value() { return v() }, kind: 'date' }))
    const t = root.querySelector('time')!
    expect(t.textContent).toBe('Nov 18, 2026')
    v.set('2027-01-02')
    expect(t.getAttribute('datetime')).toBe('2027-01-02')
    expect(t.textContent).toBe('Jan 2, 2027')
    setLocale('cs')
    expect(t.textContent).toBe(new Intl.DateTimeFormat('cs', { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.UTC(2027, 0, 2)))
    done()
  })

  it('missing or invalid values render the fallback and no datetime attribute', () => {
    const { root, done } = render(<p><DateTime value={null} fallback="unknown" /><DateTime value="garbage" fallback="bad" /></p>)
    const ts = [...root.querySelectorAll('time')]
    expect(ts.map((t) => t.textContent)).toEqual(['unknown', 'bad'])
    expect(ts.map((t) => t.hasAttribute('datetime'))).toEqual([false, false])
    done()
  })

  it('passes extra props through to <time>', () => {
    const { root, done } = render(<DateTime value="2026-11-18" class="when" id="x" locale="en-US" />)
    const t = root.querySelector('time')!
    expect(t.className).toBe('when')
    expect(t.id).toBe('x')
    done()
  })

  it('also works through the real h()', () => {
    const { root, done } = render(h(DateTime, { value: '2026-11-18', kind: 'date', locale: 'en-US' }))
    expect(root.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-18')
    done()
  })

  it('machineValue', () => {
    expect(machineValue(null)).toBeUndefined()
    expect(machineValue('nope')).toBeUndefined()
    expect(machineValue(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01T00:00:00.000Z')
    expect(machineValue('2026-11-18T14:30:00+02:00')).toBe('2026-11-18T12:30:00.000Z')
  })
})
