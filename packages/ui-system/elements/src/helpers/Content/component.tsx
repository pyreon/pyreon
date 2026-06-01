/**
 * Content area used inside Element to render one of the three
 * layout slots (before, content, after). Passes alignment, direction,
 * gap, and equalCols styling props to the underlying styled component.
 * Adds a `data-pyr-element` attribute in development for debugging.
 *
 * Children are rendered via core `render()`, with function-valued
 * children unwrapped inside a reactive accessor so the compound-layout
 * paths in `Element` keep `content={() => <X />}` reactivity intact
 * (mirrors the `resolveSlot` helper in `Element/component.tsx`).
 */
import { h, mergeProps, splitProps } from '@pyreon/core'
import type { ComponentFn, VNodeChildAtom } from '@pyreon/core'
import { render } from '@pyreon/ui-core'
import { IS_DEVELOPMENT } from '../../utils'
import { internElementBundle } from '../internElementBundle'
import { isPyreonComponent } from '../isPyreonComponent'
import Styled from './styled'
import type { Props } from './types'

// Return type is the RESOLVED atom — see the matching helper in
// Element/component.tsx for the rationale (keeps `() => resolveSlot(...)`
// a valid VNodeChildAccessor at the JSX child position).
//
// Component vs accessor discriminator — see `isPyreonComponent` JSDoc.
// Without this, `beforeContent={Component}` shorthand crashes downstream
// in rocketstyle's `removeUndefinedProps(undefined)`.
const resolveSlot = (value: unknown): VNodeChildAtom | VNodeChildAtom[] => {
  if (typeof value === 'function') {
    if (isPyreonComponent(value)) {
      return h(value as ComponentFn, null) as VNodeChildAtom
    }
    return (value as () => VNodeChildAtom | VNodeChildAtom[])()
  }
  return render(value as Parameters<typeof render>[0]) as VNodeChildAtom | VNodeChildAtom[]
}

const Component = (props: Partial<Props>) => {
  const [own, rest] = splitProps(props, [
    'contentType',
    'tag',
    'parentDirection',
    'direction',
    'alignX',
    'alignY',
    'equalCols',
    'gap',
    'extendCss',
    'children',
  ])

  const debugProps = IS_DEVELOPMENT
    ? {
        'data-pyr-element': own.contentType,
      }
    : {}

  // Route the bundle through `internElementBundle` so identical primitive
  // tuples share one object identity and the styler's `elClassCache` HITS —
  // exactly what the Element fast path + Wrapper's 4 paths already do. Without
  // it, every Content slot (the compound before/after-content path) allocated
  // a fresh `$element` per mount → guaranteed `elClassCache` miss → full
  // `styler.resolve` per slot per mount. `internElementBundle` bails (returns
  // the input unchanged) when any value is a function/object — so the
  // `extraStyles` (CSSResult/callback) case keeps today's behavior exactly.
  const stylingProps = internElementBundle({
    contentType: own.contentType,
    parentDirection: own.parentDirection,
    direction: own.direction,
    alignX: own.alignX,
    alignY: own.alignY,
    equalCols: own.equalCols,
    gap: own.gap,
    extraStyles: own.extendCss,
  })

  // Use `h(Styled, mergeProps(rest, {..., children}))` instead of JSX
  // spread `<Styled ... {...rest}>` so compiler-emitted reactive props
  // survive end-to-end. `mergeProps` from `@pyreon/core` preserves
  // getter-shaped descriptors via `Object.defineProperty`.
  //
  // Children go into the override (not h's third arg) so mount's
  // children-merge step skips this vnode — one descriptor-copy hop
  // instead of two.
  return h(
    Styled,
    mergeProps(rest as Record<string, unknown>, {
      as: own.tag,
      $contentType: own.contentType,
      $element: stylingProps,
      ...debugProps,
      children: () => resolveSlot(own.children),
    }),
  )
}

export default Component
