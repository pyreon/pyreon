import { h } from '@pyreon/core'
import { Element } from '@pyreon/elements'
import { signal } from '@pyreon/reactivity'
import rocketstyle from '@pyreon/rocketstyle'

const rs = rocketstyle({ useBooleans: false })

// The factory's `component` is typed as a real ComponentFn (rs({name,
// component: 'hr'}) directly is NOT valid — only `.config({component:
// 'hr'})`, LATER in the chain, accepts a bare tag string). To START from
// a plain HTML tag, base on Element and set it via `.attrs({ tag })`.
//
// One dimension per axis — resolved + merged at render time, so this is
// 3 states × 3 sizes × 2 variants = 18 combinations from 8 declared
// slices, not 18 hand-written cases.
const Button = rs({ name: 'Button', component: Element })
  .attrs({ tag: 'button' })
  .theme(() => ({ border: 'none', cursor: 'pointer', fontWeight: 600 }))
  .states({
    primary: { backgroundColor: '#2196f3', color: '#ffffff' },
    danger: { backgroundColor: '#dc3545', color: '#ffffff' },
    ghost: { backgroundColor: 'transparent', color: 'inherit', border: '1px solid var(--border)' },
  })
  .sizes({
    sm: { fontSize: '12px', paddingVertical: 4, paddingHorizontal: 8 },
    md: { fontSize: '14px', paddingVertical: 8, paddingHorizontal: 14 },
    lg: { fontSize: '16px', paddingVertical: 10, paddingHorizontal: 18 },
  })
  .variants({
    solid: {},
    outline: { backgroundColor: 'transparent', border: '2px solid currentColor' },
  })

type State = 'primary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'
type Variant = 'solid' | 'outline'

const select = <T extends string>(value: T, options: T[], onChange: (v: T) => void) =>
  h('select', { onChange: (e: Event) => onChange((e.target as HTMLSelectElement).value as T) },
    ...options.map((o) => h('option', { value: o, selected: o === value }, o)),
  )

/**
 * The live counterpart to the "Why Rocketstyle?" snippet above — pick a
 * state/size/variant and rocketstyle resolves + merges the matching
 * slices into one class, live. Same `Button` instance the whole time —
 * only its PROPS change.
 */
export default function MultiDimensionalButton() {
  const state = signal<State>('primary')
  const size = signal<Size>('md')
  const variant = signal<Variant>('solid')

  return h('div', { class: 'col' },
    h('div', { class: 'row', style: { gap: '8px', marginBottom: '10px' } },
      select(state(), ['primary', 'danger', 'ghost'], (v) => state.set(v)),
      select(size(), ['sm', 'md', 'lg'], (v) => size.set(v)),
      select(variant(), ['solid', 'outline'], (v) => variant.set(v)),
    ),
    h(Button, { state: () => state(), size: () => size(), variant: () => variant() }, 'Submit'),
  )
}
