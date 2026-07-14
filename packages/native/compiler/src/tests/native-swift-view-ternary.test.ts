// M2.2b — a ternary whose branches are JSX VIEW elements must lower to a
// SwiftUI `if cond { A } else { B }`, NOT a `? :` expression.
//
// SwiftUI's `@ViewBuilder` accepts if/else (buildEither) but REJECTS the
// ternary operator between DIFFERENT view types:
//   `sc == "regular" ? HStack {…} : VStack {…}`
//   → swiftc: "result values in '? :' expression have mismatching types
//              'HStack<Text>' and 'VStack<Text>'"
// This is the natural adaptive-layout idiom (`useSizeClass()`-driven
// Stack↔Inline), so it must produce compilable Swift. The Kotlin backend
// already emits `if (cond) A else B` (Compose has no equivalent restriction),
// so this fix ALSO aligns the two backends.
//
// VALUE ternaries (`cond ? "a" : "b"` — not view-producing) MUST stay `? :`.
//
// swiftc-typecheck-verified locally (swiftc 6.3.3): the emitted if/else
// typechecks clean; the pre-fix `? :` form fails with the mismatching-types
// error above. This spec locks the EMIT SHAPE and is the bisect target.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const VIEW_TERNARY_RETURN = `import { useSizeClass } from '@pyreon/hooks'
export function Bar() {
  const sc = useSizeClass()
  return sc() === 'regular' ? <Inline><Text>A</Text></Inline> : <Stack><Text>B</Text></Stack>
}`

const VIEW_TERNARY_IN_WRAP = `import { useSizeClass } from '@pyreon/hooks'
export function Bar2() {
  const sc = useSizeClass()
  return <Stack>{sc() === 'regular' ? <Inline><Text>A</Text></Inline> : <Stack><Text>B</Text></Stack>}</Stack>
}`

describe('M2.2b — view-branch ternary lowers to Swift if/else', () => {
  it('Swift: view-ternary at the body root → if/else, NOT `? :`', () => {
    const out = transform(VIEW_TERNARY_RETURN, { target: 'swift' }).code
    expect(out).toContain('if sc == "regular" {')
    expect(out).toContain('HStack {')
    expect(out).toContain('} else {')
    expect(out).toContain('VStack {')
    // The invalid ViewBuilder ternary must NOT be emitted.
    expect(out).not.toContain('? HStack')
    expect(out).not.toContain(': VStack')
  })

  it('Swift: view-ternary inside a container → if/else', () => {
    const out = transform(VIEW_TERNARY_IN_WRAP, { target: 'swift' }).code
    expect(out).toContain('VStack {')
    expect(out).toContain('if sc == "regular" {')
    expect(out).toContain('} else {')
    expect(out).not.toContain('? HStack')
  })

  it('Swift: a VALUE ternary stays a `? :` expression (not rewritten)', () => {
    const out = transform(
      `export function V() { const done = true; return <Stack><Text>{done ? 'done' : 'todo'}</Text></Stack> }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('done ? "done" : "todo"')
    expect(out).not.toContain('if done {')
  })

  it('Kotlin: unchanged — already emits if/else for view branches', () => {
    const out = transform(VIEW_TERNARY_RETURN, { target: 'kotlin' }).code
    expect(out).toContain('if (sc == "regular") Row {')
    expect(out).toContain('} else Column {')
  })

  it('cross-platform: both backends structurally use if/else for the view ternary', () => {
    const swift = transform(VIEW_TERNARY_RETURN, { target: 'swift' }).code
    const kotlin = transform(VIEW_TERNARY_RETURN, { target: 'kotlin' }).code
    expect(swift).toContain('if sc == "regular" {')
    expect(kotlin).toContain('if (sc == "regular") Row {')
  })
})
