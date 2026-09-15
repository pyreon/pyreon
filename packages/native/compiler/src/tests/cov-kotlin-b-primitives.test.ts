// Kotlin emit — `<TextField>`, `<Text>` and `<Button>` prop plumbing.
//
// `<TextField>` is the LEGACY two-way-bound input (`<Field>` is the canonical
// one). Its Kotlin emit has a bound fast path plus a generic bail, and the
// Enter-submit recognizer behind it declines through eight separate shapes —
// each decline must leave the TextField itself intact, never half-wired.
//
// `<Text>` fills in `size` / `weight` / `font` when no `style` object says
// otherwise; an UNKNOWN token must resolve to the documented default rather
// than emit an unresolved Compose symbol.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const field = (attrs: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, TextField } from '@pyreon/primitives'
export function App() {
  const draft = signal('')
  const submit = () => { draft.set('') }
  const onKey = (e: { key: string }) => { submit() }
  return (<Stack><TextField ${attrs} /></Stack>)
}`

const textFieldLine = (attrs: string) =>
  kotlin(field(attrs)).code.split('\n').map((l) => l.trim()).find((l) => l.startsWith('TextField('))!

describe('<TextField> Kotlin binding', () => {
  it('a signal `value` binds two ways, a literal placeholder fills the slot, and Enter submits', () => {
    expect(
      textFieldLine(`value={draft} placeholder="What?" onKeyDown={(e) => e.key === 'Enter' && submit()}`),
    ).toBe(
      'TextField(value = draft, onValueChange = { draft = it }, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { submit() }), placeholder = { Text("What?") })',
    )
  })

  it('a NON-literal placeholder is dropped rather than emitted as a slot', () => {
    // A Compose `placeholder` slot wants a composable; splicing a runtime
    // expression into `Text(...)` here would be a different lowering, so the
    // prop is simply not emitted.
    const line = textFieldLine('value={draft} placeholder={draft()}')
    expect(line).toBe('TextField(value = draft, onValueChange = { draft = it })')
  })

  it.each([
    ['a handler that is a function REFERENCE, not an arrow', 'onKeyDown={onKey}'],
    ['an arrow with the wrong arity', 'onKeyDown={(e, x) => e.key === "Enter" && submit()}'],
    ['a body that is not a `&&`', 'onKeyDown={(e) => submit()}'],
    ['a comparison that is not `==`', 'onKeyDown={(e) => e.key !== "Enter" && submit()}'],
    ['a member that is not `.key`', 'onKeyDown={(e) => e.code === "Enter" && submit()}'],
    ['a key literal other than Enter', 'onKeyDown={(e) => e.key === "Escape" && submit()}'],
  ])('declines the Enter-submit recognizer for %s — and still binds the field', (_why, attr) => {
    const line = textFieldLine(`value={draft} ${attr}`)
    expect(line).toBe('TextField(value = draft, onValueChange = { draft = it })')
    expect(line).not.toContain('ImeAction')
  })

  it('a non-signal `value` falls through to the generic emit (no onValueChange invented)', () => {
    const line = textFieldLine('value="hi"')
    expect(line).toContain('TextField(value = "hi")')
    expect(line).not.toContain('onValueChange')
  })
})

const text = (body: string) => `import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  return (<Stack>
${body}
  </Stack>)
}`

const lineWith = (src: string, prefix: string) =>
  kotlin(src).code.split('\n').map((l) => l.trim()).find((l) => l.startsWith(prefix))!

describe('<Text> size / weight / font on Kotlin', () => {
  it('an UNRECOGNIZED size or weight token resolves to the documented default, not an unresolved symbol', () => {
    const line = lineWith(text('    <Text size="huge" weight="black">hi</Text>'), 'Text(')
    // `md` (16sp) and `FontWeight.Normal` are the fallbacks — an emit that
    // spliced the token through would not compile.
    expect(line).toBe('Text(text = "hi", fontSize = 16.sp, fontWeight = FontWeight.Normal)')
  })

  it('a childless <Text> still carries the resolved size and weight', () => {
    const line = lineWith(text('    <Text size="lg" weight="bold" />'), 'Text(')
    expect(line).toBe('Text(text = "", fontSize = 20.sp, fontWeight = FontWeight.Bold)')
  })

  it('a custom font becomes an Android resource name — a leading digit is prefixed, punctuation collapses', () => {
    // `res/font` names must be a valid Java identifier: `2Brand` would be
    // rejected by aapt2, so the emit prefixes it.
    const r = transform(
      `import { Stack, Text } from '@pyreon/primitives'
export function App() { return (<Stack><Text font="2Brand">hi</Text><Text font="Brand Sans">yo</Text></Stack>) }`,
      { target: 'kotlin', fonts: { '2Brand': 'X', 'Brand Sans': 'Y' } },
    )
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Text(text = "hi", fontFamily = pyreonFont("_2brand"))')
    expect(r.code).toContain('Text(text = "yo", fontFamily = pyreonFont("brand_sans"))')
  })
})

describe('<Button> with no handler', () => {
  it('emits an empty lambda rather than omitting the required onClick argument', () => {
    const line = lineWith(text('    <Button>Go</Button>'), 'Button(')
    expect(line).toContain('Button(onClick = {})')
  })
})
