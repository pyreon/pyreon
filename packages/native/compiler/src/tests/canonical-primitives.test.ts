// Phase B — emit-shape tests for the 6 wired canonical primitives.
//
// Validates that `<Stack>` / `<Inline>` / `<Text>` / `<Button>` /
// `<Press>` / `<Field>` produce the expected SwiftUI + Compose output
// shapes, with token resolution + canonical `onPress` event name
// applied correctly per target.
//
// Snapshot tests would be over-specific for 16 primitives; instead
// these tests use targeted `toContain` / `toMatch` assertions on the
// load-bearing emit fragments. Per-primitive, per-target.
//
// kotlinc validation of the canonical-primitive emit is deferred —
// the new emit references `Modifier`, `Arrangement.spacedBy`,
// `Alignment.X`, `RoundedCornerShape`, `Box`, `androidx.compose.ui.
// graphics.Color`, etc. — extending the K4 stubs to cover all of
// these is a separate, larger PR (deliberately scoped out of Phase B
// initial). The K-FINAL gate continues to pass because TodoMVC source
// uses LEGACY tags (<VStack>/<HStack>/<TextField>), not canonical
// primitives — migration happens in Phase E.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// Shared minimal-component wrapper so tests focus on the JSX-body emit.
function tx(jsxBody: string, target: 'swift' | 'kotlin'): string {
  const source = `
    import { signal } from '@pyreon/reactivity'
    export function App() {
      const draft = signal<string>('')
      const fn = () => {}
      return ${jsxBody}
    }
  `
  return transform(source, { target }).code
}

describe('Phase B — <Stack> emit', () => {
  it('Swift: <Stack> → VStack { ... }', () => {
    const out = tx(`<Stack><Text>hi</Text></Stack>`, 'swift')
    expect(out).toMatch(/VStack \{[\s\S]+Text\("hi"\)/)
  })

  it('Swift: <Stack direction="row"> → HStack', () => {
    const out = tx(`<Stack direction="row"><Text>hi</Text></Stack>`, 'swift')
    expect(out).toMatch(/HStack \{[\s\S]+Text\("hi"\)/)
    expect(out).not.toContain('VStack')
  })

  it('Swift: <Stack gap={2}> → VStack(spacing: 8) (token 2 → 8px)', () => {
    const out = tx(`<Stack gap={2}><Text>hi</Text></Stack>`, 'swift')
    expect(out).toContain('VStack(spacing: 8)')
  })

  it('Swift: <Stack padding={4}> → trailing .padding(16) modifier', () => {
    const out = tx(`<Stack padding={4}><Text>hi</Text></Stack>`, 'swift')
    expect(out).toContain('.padding(16)')
  })

  it('Swift: <Stack align="center" gap={3}> → VStack(alignment: .center, spacing: 12)', () => {
    const out = tx(`<Stack align="center" gap={3}><Text>x</Text></Stack>`, 'swift')
    expect(out).toContain('VStack(alignment: .center, spacing: 12)')
  })

  it('Swift: <Stack background="surface" radius="md"> → trailing .background + .cornerRadius', () => {
    const out = tx(`<Stack background="surface" radius="md"><Text>x</Text></Stack>`, 'swift')
    expect(out).toMatch(/\.background\(Color\(red: 1, green: 1, blue: 1\)\)/)
    expect(out).toContain('.cornerRadius(8)')
  })

  it('Kotlin: <Stack> → Column { ... }', () => {
    const out = tx(`<Stack><Text>hi</Text></Stack>`, 'kotlin')
    expect(out).toMatch(/Column \{[\s\S]+Text\(text = "hi"\)/)
  })

  it('Kotlin: <Stack direction="row"> → Row', () => {
    const out = tx(`<Stack direction="row"><Text>hi</Text></Stack>`, 'kotlin')
    expect(out).toMatch(/Row \{/)
    expect(out).not.toMatch(/Column \{/)
  })

  it('Kotlin: <Stack gap={2}> → verticalArrangement = Arrangement.spacedBy(8.dp)', () => {
    const out = tx(`<Stack gap={2}><Text>hi</Text></Stack>`, 'kotlin')
    expect(out).toContain('verticalArrangement = Arrangement.spacedBy(8.dp)')
  })

  it('Kotlin: <Stack direction="row" gap={2}> → horizontalArrangement = Arrangement.spacedBy(8.dp)', () => {
    const out = tx(`<Stack direction="row" gap={2}><Text>hi</Text></Stack>`, 'kotlin')
    expect(out).toContain('horizontalArrangement = Arrangement.spacedBy(8.dp)')
  })

  it('Kotlin: <Stack padding={4}> → modifier = Modifier.padding(16.dp)', () => {
    const out = tx(`<Stack padding={4}><Text>hi</Text></Stack>`, 'kotlin')
    expect(out).toContain('modifier = Modifier.padding(16.dp)')
  })

  it('Kotlin: <Stack align="center" gap={3}> → horizontalAlignment + verticalArrangement', () => {
    const out = tx(`<Stack align="center" gap={3}><Text>x</Text></Stack>`, 'kotlin')
    expect(out).toContain('verticalArrangement = Arrangement.spacedBy(12.dp)')
    expect(out).toContain('horizontalAlignment = Alignment.CenterHorizontally')
  })
})

describe('Phase B — <Inline> emit (sugar over Stack with direction="row")', () => {
  it('Swift: <Inline> → HStack', () => {
    const out = tx(`<Inline><Text>a</Text><Text>b</Text></Inline>`, 'swift')
    expect(out).toMatch(/HStack \{/)
    expect(out).not.toMatch(/VStack/)
  })

  it('Swift: <Inline gap={2}> → HStack(spacing: 8)', () => {
    const out = tx(`<Inline gap={2}><Text>a</Text></Inline>`, 'swift')
    expect(out).toContain('HStack(spacing: 8)')
  })

  it('Kotlin: <Inline> → Row', () => {
    const out = tx(`<Inline><Text>a</Text></Inline>`, 'kotlin')
    expect(out).toMatch(/Row \{/)
  })

  it('Kotlin: <Inline gap={2}> → Row(horizontalArrangement = Arrangement.spacedBy(8.dp))', () => {
    const out = tx(`<Inline gap={2}><Text>a</Text></Inline>`, 'kotlin')
    expect(out).toContain('horizontalArrangement = Arrangement.spacedBy(8.dp)')
  })
})

describe('Phase B — <Press> emit (un-styled clickable wrapper)', () => {
  it('Swift: <Press onPress={fn}> → Button { ... } action: { fn() }.buttonStyle(.plain)', () => {
    const out = tx(`<Press onPress={fn}><Text>tap</Text></Press>`, 'swift')
    expect(out).toMatch(/Button \{[\s\S]+Text\("tap"\)/)
    expect(out).toContain('action: { fn() }')
    expect(out).toContain('.buttonStyle(.plain)')
  })

  it('Swift: <Press onClick={fn}> (legacy event name) also works', () => {
    const out = tx(`<Press onClick={fn}><Text>tap</Text></Press>`, 'swift')
    expect(out).toContain('action: { fn() }')
  })

  it('Kotlin: <Press onPress={fn}> → Box(modifier = Modifier.clickable(onClick = ...))', () => {
    const out = tx(`<Press onPress={fn}><Text>tap</Text></Press>`, 'kotlin')
    expect(out).toContain('Box(modifier = Modifier.clickable(onClick = { fn() }))')
  })

  it('Kotlin: <Press padding={3}> combines layout modifier with .clickable()', () => {
    const out = tx(`<Press onPress={fn} padding={3}><Text>tap</Text></Press>`, 'kotlin')
    expect(out).toContain('Modifier.padding(12.dp).clickable(onClick = { fn() })')
  })
})

describe('Phase B — <Field> emit', () => {
  it('Swift: <Field value={draft} onChangeText={...} placeholder="hi"> → TextField("hi", text: $draft)', () => {
    const out = tx(
      `<Field value={draft} onChangeText={(t) => draft.set(t)} placeholder="hi" />`,
      'swift',
    )
    expect(out).toContain('TextField("hi", text: $draft)')
  })

  it('Swift: <Field kind="password"> → SecureField', () => {
    const out = tx(
      `<Field value={draft} onChangeText={(t) => draft.set(t)} kind="password" placeholder="pw" />`,
      'swift',
    )
    expect(out).toContain('SecureField("pw", text: $draft)')
  })

  it('Swift: <Field onSubmit={fn}> → trailing .onSubmit { fn() }', () => {
    const out = tx(
      `<Field value={draft} onChangeText={(t) => draft.set(t)} onSubmit={fn} placeholder="x" />`,
      'swift',
    )
    expect(out).toMatch(/\.onSubmit \{ fn\(\) \}/)
  })

  it('Kotlin: <Field value={draft} onChangeText={...}> → TextField(value = draft, onValueChange = ...)', () => {
    const out = tx(
      `<Field value={draft} onChangeText={(t) => draft.set(t)} placeholder="hi" />`,
      'kotlin',
    )
    expect(out).toContain('TextField(value = draft, onValueChange =')
    expect(out).toContain('placeholder = { Text("hi") }')
  })

  it('Kotlin: <Field kind="password"> → visualTransformation = PasswordVisualTransformation()', () => {
    const out = tx(
      `<Field value={draft} onChangeText={(t) => draft.set(t)} kind="password" />`,
      'kotlin',
    )
    expect(out).toContain('visualTransformation = PasswordVisualTransformation()')
  })

  it('Kotlin: <Field onSubmit={fn}> → keyboardOptions + keyboardActions (Phase G2 shape)', () => {
    const out = tx(
      `<Field value={draft} onChangeText={(t) => draft.set(t)} onSubmit={fn} />`,
      'kotlin',
    )
    expect(out).toContain('keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)')
    expect(out).toContain('keyboardActions = KeyboardActions(onDone =')
  })
})

describe('Phase B — <Button onPress> (canonical event name)', () => {
  it('Swift: <Button onPress={fn}>Save</Button> → Button("Save") { fn() }', () => {
    const out = tx(`<Button onPress={fn}>Save</Button>`, 'swift')
    expect(out).toContain('Button("Save") { fn() }')
  })

  it('Swift: <Button onClick={fn}> (legacy) also works', () => {
    const out = tx(`<Button onClick={fn}>Save</Button>`, 'swift')
    expect(out).toContain('Button("Save") { fn() }')
  })

  it('Kotlin: <Button onPress={fn}>Save</Button> → Button(onClick = { fn() }) { Text("Save") }', () => {
    const out = tx(`<Button onPress={fn}>Save</Button>`, 'kotlin')
    expect(out).toMatch(/Button\(onClick = \{ fn\(\) \}\) \{[\s\S]+Text\(JSON\.stringify\("Save"\)\)|Button\(onClick = \{ fn\(\) \}\) \{[\s\S]+Text\("Save"\)/)
  })

  it('Kotlin: <Button onClick={fn}> (legacy) also works', () => {
    const out = tx(`<Button onClick={fn}>Save</Button>`, 'kotlin')
    expect(out).toContain('Button(onClick = { fn() })')
  })
})

describe('Phase B — composition smoke', () => {
  it('Swift: Stack > Inline > Text + Button renders correctly', () => {
    const out = tx(
      `<Stack gap={3} padding={4}><Text>Title</Text><Inline gap={2}><Text>Click:</Text><Button onPress={fn}>OK</Button></Inline></Stack>`,
      'swift',
    )
    expect(out).toContain('VStack(spacing: 12)')
    expect(out).toContain('HStack(spacing: 8)')
    expect(out).toContain('.padding(16)')
    expect(out).toContain('Button("OK") { fn() }')
  })

  it('Kotlin: Stack > Inline > Text + Button renders correctly', () => {
    const out = tx(
      `<Stack gap={3} padding={4}><Text>Title</Text><Inline gap={2}><Text>Click:</Text><Button onPress={fn}>OK</Button></Inline></Stack>`,
      'kotlin',
    )
    expect(out).toContain('verticalArrangement = Arrangement.spacedBy(12.dp)')
    expect(out).toContain('horizontalArrangement = Arrangement.spacedBy(8.dp)')
    expect(out).toContain('modifier = Modifier.padding(16.dp)')
    expect(out).toContain('Button(onClick = { fn() })')
  })
})
