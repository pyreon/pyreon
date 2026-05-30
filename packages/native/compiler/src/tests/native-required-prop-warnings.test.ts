// Round-1 audit fix — diagnostic warnings for canonical primitives
// used without their required prop.
//
// Pre-fix, omitting (e.g.) `<Icon>`'s `name` or `<Image>`'s `src`
// silently fell through to the generic emit, producing unbuildable
// native code (`Icon(size: "lg")` — no such SwiftUI type, no such
// Compose composable). Users got cryptic `swiftc` / `kotlinc` errors
// with no Pyreon-side signal.
//
// Post-fix, the parser pushes a clear warning into `result.warnings`
// naming the tag + the missing prop. The emit path is UNCHANGED —
// this is diagnostic-only. A proper safe-fallback emit is a larger
// follow-up tracked separately.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Round-1 audit — required-prop warnings (diagnostic-only)', () => {
  it('<Icon> without `name` emits a warning naming the tag + the prop', () => {
    const result = transform(
      `export function App() { return <Icon size="lg"/> }`,
      { target: 'swift' },
    )
    expect(result.warnings.some((w) => w.includes('<Icon>') && w.includes('name'))).toBe(true)
  })

  it('<Icon> WITH `name` emits NO warning (baseline)', () => {
    const result = transform(
      `export function App() { return <Icon name="star"/> }`,
      { target: 'swift' },
    )
    expect(result.warnings.some((w) => w.includes('<Icon>'))).toBe(false)
  })

  it('<Image> without `src` emits a warning naming the tag + the prop', () => {
    const result = transform(
      `export function App() { return <Image alt="x" width={100}/> }`,
      { target: 'swift' },
    )
    expect(result.warnings.some((w) => w.includes('<Image>') && w.includes('src'))).toBe(true)
  })

  it('<Image> WITH `src` emits NO warning (baseline)', () => {
    const result = transform(
      `export function App() { return <Image src="/a.png" alt="x"/> }`,
      { target: 'swift' },
    )
    expect(result.warnings.some((w) => w.includes('<Image>'))).toBe(false)
  })

  it('<Link> without `to` emits a warning naming the tag + the prop', () => {
    const result = transform(
      `export function App() { return <Link>Go</Link> }`,
      { target: 'swift' },
    )
    expect(result.warnings.some((w) => w.includes('<Link>') && w.includes('to'))).toBe(true)
  })

  it('<Link> WITH `to` emits NO warning (baseline)', () => {
    const result = transform(
      `export function App() { return <Link to="/x">Go</Link> }`,
      { target: 'swift' },
    )
    expect(result.warnings.some((w) => w.includes('<Link>'))).toBe(false)
  })

  it('warnings fire on Kotlin target too (target-independent, parser-level)', () => {
    const result = transform(
      `export function App() { return <Icon size="lg"/> }`,
      { target: 'kotlin' },
    )
    expect(result.warnings.some((w) => w.includes('<Icon>') && w.includes('name'))).toBe(true)
  })

  it('emit shape is UNCHANGED — warnings are diagnostic-only', () => {
    // Verification-belt: confirm we did NOT accidentally start
    // suppressing the fallthrough emit. Pre-fix and post-fix the
    // emit produces the same (broken) `Icon(...)` literal — fixing
    // the emit is a separate scope item.
    const out = transform(
      `export function App() { return <Icon size="lg"/> }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('Icon(') // generic fallthrough unchanged
  })

  it('correctly-used primitives emit ZERO warnings (sanity)', () => {
    const result = transform(
      `
      export function App() {
        return <Icon name="star" size="lg"/>
      }
      `,
      { target: 'swift' },
    )
    expect(result.warnings).toHaveLength(0)
  })
})
