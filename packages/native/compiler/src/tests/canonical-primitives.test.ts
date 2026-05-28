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
    declare const router: unknown
    export function App() {
      const draft = signal<string>('')
      const done = signal<boolean>(false)
      const fn = () => {}
      return ${jsxBody}
    }
  `
  return transform(source, { target }).code
}

// Phase E2 variant — adds `todo` + `onToggle` props so non-signal-value
// `<Toggle>` tests can reference `props.todo.done` AND `props.onToggle`
// from inside the component scope. Function-typed props register in
// `_functionNames`, so `props.onToggle` in handler position emits as
// `onToggle()` (the call form, not a bare reference).
function txWithTodoProps(jsxBody: string, target: 'swift' | 'kotlin'): string {
  const source = `
    import { signal } from '@pyreon/reactivity'
    export function App(props: { todo: { done: boolean }; onToggle: () => void }) {
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

describe('Phase P2.1 — <Layer> emit (z-stack overlay)', () => {
  it('Swift: <Layer> → ZStack { ... }', () => {
    const out = tx(`<Layer><Text>base</Text><Text>top</Text></Layer>`, 'swift')
    expect(out).toMatch(/ZStack \{[\s\S]+Text\("base"\)[\s\S]+Text\("top"\)/)
  })

  it('Swift: <Layer align="center"> → ZStack(alignment: .center)', () => {
    const out = tx(`<Layer align="center"><Text>x</Text></Layer>`, 'swift')
    expect(out).toContain('ZStack(alignment: .center)')
  })

  it('Swift: <Layer align="start"> → ZStack(alignment: .topLeading)', () => {
    const out = tx(`<Layer align="start"><Text>x</Text></Layer>`, 'swift')
    expect(out).toContain('ZStack(alignment: .topLeading)')
  })

  it('Swift: <Layer align="end"> → ZStack(alignment: .bottomTrailing)', () => {
    const out = tx(`<Layer align="end"><Text>x</Text></Layer>`, 'swift')
    expect(out).toContain('ZStack(alignment: .bottomTrailing)')
  })

  it('Swift: <Layer padding={4} background="surface" radius="md"> → modifier chain', () => {
    const out = tx(`<Layer padding={4} background="surface" radius="md"><Text>x</Text></Layer>`, 'swift')
    expect(out).toContain('.padding(16)')
    expect(out).toMatch(/\.background\(Color\(red: 1, green: 1, blue: 1\)\)/)
    expect(out).toContain('.cornerRadius(8)')
  })

  it('Kotlin: <Layer> → Box { ... }', () => {
    const out = tx(`<Layer><Text>base</Text><Text>top</Text></Layer>`, 'kotlin')
    expect(out).toMatch(/Box \{[\s\S]+Text\(text = "base"\)[\s\S]+Text\(text = "top"\)/)
  })

  it('Kotlin: align maps to Box contentAlignment (2-D)', () => {
    expect(tx(`<Layer align="center"><Text>x</Text></Layer>`, 'kotlin')).toContain(
      'contentAlignment = Alignment.Center',
    )
    expect(tx(`<Layer align="start"><Text>x</Text></Layer>`, 'kotlin')).toContain(
      'contentAlignment = Alignment.TopStart',
    )
    expect(tx(`<Layer align="end"><Text>x</Text></Layer>`, 'kotlin')).toContain(
      'contentAlignment = Alignment.BottomEnd',
    )
  })

  it('Kotlin: <Layer padding={4} background="surface" radius="md"> → modifier chain', () => {
    const out = tx(`<Layer padding={4} background="surface" radius="md"><Text>x</Text></Layer>`, 'kotlin')
    expect(out).toContain('Modifier.padding(16.dp)')
    expect(out).toContain('.clip(RoundedCornerShape(8.dp))')
  })
})

describe('Phase P2.1 — <Scroll> emit (scrollable container)', () => {
  it('Swift: <Scroll> → ScrollView { ... } (vertical default, bare)', () => {
    const out = tx(`<Scroll><Text>row</Text></Scroll>`, 'swift')
    expect(out).toMatch(/ScrollView \{[\s\S]+Text\("row"\)/)
    expect(out).not.toContain('ScrollView(')
  })

  it('Swift: <Scroll axis="horizontal"> → ScrollView(.horizontal)', () => {
    const out = tx(`<Scroll axis="horizontal"><Text>row</Text></Scroll>`, 'swift')
    expect(out).toContain('ScrollView(.horizontal)')
  })

  it('Swift: <Scroll padding={2}> → trailing .padding(8)', () => {
    const out = tx(`<Scroll padding={2}><Text>x</Text></Scroll>`, 'swift')
    expect(out).toContain('.padding(8)')
  })

  it('Kotlin: <Scroll> → Column(Modifier.verticalScroll(rememberScrollState()))', () => {
    const out = tx(`<Scroll><Text>row</Text></Scroll>`, 'kotlin')
    expect(out).toContain('Column(modifier = Modifier.verticalScroll(rememberScrollState()))')
  })

  it('Kotlin: <Scroll axis="horizontal"> → Row(Modifier.horizontalScroll(rememberScrollState()))', () => {
    const out = tx(`<Scroll axis="horizontal"><Text>row</Text></Scroll>`, 'kotlin')
    expect(out).toContain('Row(modifier = Modifier.horizontalScroll(rememberScrollState()))')
  })

  it('Kotlin: <Scroll padding={2}> → scroll modifier + .padding(8.dp)', () => {
    const out = tx(`<Scroll padding={2}><Text>x</Text></Scroll>`, 'kotlin')
    expect(out).toContain('Modifier.verticalScroll(rememberScrollState()).padding(8.dp)')
  })
})

describe('Phase P2.1 — <Spacer> emit (flexible gap)', () => {
  it('Swift: <Spacer /> → Spacer()', () => {
    const out = tx(`<Inline><Text>L</Text><Spacer /><Text>R</Text></Inline>`, 'swift')
    expect(out).toContain('Spacer()')
  })

  it('Swift: <Spacer data-testid="gap" /> → Spacer().accessibilityIdentifier("gap")', () => {
    const out = tx(`<Spacer data-testid="gap" />`, 'swift')
    expect(out).toContain('Spacer().accessibilityIdentifier("gap")')
  })

  it('Kotlin: <Spacer /> → Spacer(modifier = Modifier.weight(1f))', () => {
    const out = tx(`<Inline><Text>L</Text><Spacer /><Text>R</Text></Inline>`, 'kotlin')
    expect(out).toContain('Spacer(modifier = Modifier.weight(1f))')
  })

  it('Kotlin: <Spacer data-testid="gap" /> → weight + .testTag("gap")', () => {
    const out = tx(`<Spacer data-testid="gap" />`, 'kotlin')
    expect(out).toContain('Spacer(modifier = Modifier.weight(1f).testTag("gap"))')
  })
})

describe('Phase P2.1 — <Heading> emit (semantic heading)', () => {
  it('Swift: <Heading>Title</Heading> → Text("Title").font(.largeTitle).bold() (default level 1)', () => {
    const out = tx(`<Heading>Title</Heading>`, 'swift')
    expect(out).toContain('Text("Title").font(.largeTitle).bold()')
  })

  it('Swift: level maps to the SwiftUI font role', () => {
    expect(tx(`<Heading level={2}>x</Heading>`, 'swift')).toContain('.font(.title).bold()')
    expect(tx(`<Heading level={3}>x</Heading>`, 'swift')).toContain('.font(.title2).bold()')
    expect(tx(`<Heading level={6}>x</Heading>`, 'swift')).toContain('.font(.subheadline).bold()')
  })

  it('Swift: <Heading color="primary"> → trailing .foregroundColor', () => {
    const out = tx(`<Heading color="primary">x</Heading>`, 'swift')
    expect(out).toMatch(/\.foregroundColor\(Color\(red: [\d.]+, green: [\d.]+, blue: [\d.]+\)\)/)
  })

  it('Kotlin: <Heading>Title</Heading> → Text(style = MaterialTheme.typography.headlineLarge) (default level 1)', () => {
    const out = tx(`<Heading>Title</Heading>`, 'kotlin')
    expect(out).toContain('Text(text = "Title", style = MaterialTheme.typography.headlineLarge)')
  })

  it('Kotlin: level maps to the Material3 typography role', () => {
    expect(tx(`<Heading level={2}>x</Heading>`, 'kotlin')).toContain('MaterialTheme.typography.headlineMedium')
    expect(tx(`<Heading level={3}>x</Heading>`, 'kotlin')).toContain('MaterialTheme.typography.headlineSmall')
    expect(tx(`<Heading level={6}>x</Heading>`, 'kotlin')).toContain('MaterialTheme.typography.titleSmall')
  })

  it('Kotlin: <Heading color="primary"> → color = arg', () => {
    const out = tx(`<Heading color="primary">x</Heading>`, 'kotlin')
    expect(out).toMatch(/color = Color\(0xFF[0-9A-F]{6}\)/)
  })
})

describe('Phase P2.1 — <Icon> emit (SF Symbols)', () => {
  it('Swift: <Icon name="star" /> → Image(systemName: "star")', () => {
    const out = tx(`<Icon name="star" />`, 'swift')
    expect(out).toContain('Image(systemName: "star")')
  })

  it('Swift: size maps to .imageScale', () => {
    expect(tx(`<Icon name="x" size="sm" />`, 'swift')).toContain('.imageScale(.small)')
    expect(tx(`<Icon name="x" size="lg" />`, 'swift')).toContain('.imageScale(.large)')
  })

  it('Swift: <Icon name="x" color="danger" /> → trailing .foregroundColor', () => {
    const out = tx(`<Icon name="x" color="danger" />`, 'swift')
    expect(out).toMatch(/\.foregroundColor\(Color\(red: [\d.]+, green: [\d.]+, blue: [\d.]+\)\)/)
  })

  it('Kotlin: <Icon name="star" /> → Icon(imageVector = pyreonIcon("star"), contentDescription = "star")', () => {
    const out = tx(`<Icon name="star" />`, 'kotlin')
    expect(out).toContain('Icon(imageVector = pyreonIcon("star"), contentDescription = "star")')
  })

  it('Kotlin: size → Modifier.size; color → tint', () => {
    expect(tx(`<Icon name="x" size="sm" />`, 'kotlin')).toContain('modifier = Modifier.size(16.dp)')
    expect(tx(`<Icon name="x" size="lg" />`, 'kotlin')).toContain('modifier = Modifier.size(24.dp)')
    expect(tx(`<Icon name="x" color="danger" />`, 'kotlin')).toMatch(/tint = Color\(0xFF[0-9A-F]{6}\)/)
  })
})

describe('Phase P2.1 — <Image> emit (AsyncImage)', () => {
  it('Swift: <Image src="/a.png" alt="a" /> → AsyncImage(url:) + accessibilityLabel', () => {
    const out = tx(`<Image src="/a.png" alt="a photo" />`, 'swift')
    expect(out).toContain('AsyncImage(url: URL(string: "/a.png"))')
    expect(out).toContain('.accessibilityLabel("a photo")')
  })

  it('Swift: numeric width/height → .frame(width:height:)', () => {
    const out = tx(`<Image src="/a.png" alt="" width={64} height={48} />`, 'swift')
    expect(out).toContain('.frame(width: 64, height: 48)')
  })

  it('Kotlin: <Image src="/a.png" alt="a" /> → AsyncImage(model=, contentDescription=)', () => {
    const out = tx(`<Image src="/a.png" alt="a photo" />`, 'kotlin')
    expect(out).toContain('AsyncImage(model = "/a.png", contentDescription = "a photo")')
  })

  it('Kotlin: numeric width/height → Modifier.width/height(dp)', () => {
    const out = tx(`<Image src="/a.png" alt="" width={64} height={48} />`, 'kotlin')
    expect(out).toContain('modifier = Modifier.width(64.dp).height(48.dp)')
  })
})

describe('Phase P2.1 — <Modal> emit (.sheet(isPresented:))', () => {
  it('Swift: <Modal open={signal}> → EmptyView().sheet(isPresented: $signal) { ... }', () => {
    const out = tx(`<Modal open={done}><Text>body</Text></Modal>`, 'swift')
    expect(out).toMatch(/EmptyView\(\)\.sheet\(isPresented: \$done\) \{[\s\S]+Text\("body"\)/)
  })

  it('Swift: signal shape drops the redundant onClose (binding writes back)', () => {
    const out = tx(`<Modal open={done} onClose={fn}><Text>x</Text></Modal>`, 'swift')
    expect(out).toContain('sheet(isPresented: $done)')
    // No custom Binding for the signal shape.
    expect(out).not.toContain('Binding(')
  })

  it('Swift: <Modal open={props.open} onClose={onToggle}> → custom Binding routing dismiss through onClose', () => {
    const out = txWithTodoProps(
      `<Modal open={props.todo.done} onClose={props.onToggle}><Text>x</Text></Modal>`,
      'swift',
    )
    expect(out).toContain('EmptyView().sheet(isPresented: Binding(')
    expect(out).toMatch(/get: \{ todo\.done \}/)
    expect(out).toMatch(/set: \{ if !\$0 \{ onToggle\(\) \} \}/)
  })

  it('Swift: non-signal open WITHOUT onClose → falls through (cant write dismiss)', () => {
    const out = txWithTodoProps(`<Modal open={props.todo.done}><Text>x</Text></Modal>`, 'swift')
    expect(out).not.toContain('.sheet(isPresented:')
  })

  it('Kotlin: <Modal open={signal} onClose={fn}> → if (signal) { Dialog(onDismissRequest = {...}) { ... } }', () => {
    const out = tx(`<Modal open={done} onClose={fn}><Text>body</Text></Modal>`, 'kotlin')
    expect(out).toMatch(/if \(done\) \{[\s\S]+Dialog\(onDismissRequest = \{ fn\(\) \}\) \{[\s\S]+Text\(text = "body"\)/)
  })

  it('Kotlin: <Modal open={props.open} onClose={onToggle}> → if (open) { Dialog(onDismissRequest = { onToggle() }) }', () => {
    const out = txWithTodoProps(
      `<Modal open={props.todo.done} onClose={props.onToggle}><Text>x</Text></Modal>`,
      'kotlin',
    )
    expect(out).toMatch(/if \(todo\.done\) \{/)
    expect(out).toContain('Dialog(onDismissRequest = { onToggle() })')
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

describe('Phase B — <Toggle> emit (canonical binary toggle; Compose Switch vs SwiftUI Toggle)', () => {
  it('Swift: <Toggle value={done}> → Toggle("", isOn: $done)', () => {
    const out = tx(`<Toggle value={done} onChange={(b) => done.set(b)} />`, 'swift')
    expect(out).toContain('Toggle("", isOn: $done)')
  })

  it('Swift: <Toggle disabled> → .disabled(true) modifier', () => {
    const out = tx(
      `<Toggle value={done} onChange={(b) => done.set(b)} disabled />`,
      'swift',
    )
    expect(out).toContain('Toggle("", isOn: $done)')
    expect(out).toContain('.disabled(true)')
  })

  it('Kotlin: <Toggle value={done} onChange={...}> → Switch(checked = done, onCheckedChange = ...)', () => {
    // Compose has no `Toggle` component — the canonical-primitives name
    // map routes Toggle → Switch (Compose Material's binary toggle).
    const out = tx(`<Toggle value={done} onChange={(b) => done.set(b)} />`, 'kotlin')
    expect(out).toContain('Switch(checked = done')
    expect(out).toContain('onCheckedChange = { b -> done = b }')
  })

  it('Kotlin: <Toggle disabled> → enabled = false', () => {
    const out = tx(
      `<Toggle value={done} onChange={(b) => done.set(b)} disabled />`,
      'kotlin',
    )
    expect(out).toContain('Switch(checked = done')
    expect(out).toContain('enabled = false')
  })

  it('Kotlin: <Toggle value={done}> with no onChange — emits fallback write-back', () => {
    // Compose requires onCheckedChange to be a function; canonical
    // <Toggle> normally pairs value + onChange, but defensive emit
    // auto-derives the write-back if onChange is missing.
    const out = tx(`<Toggle value={done} />`, 'kotlin')
    expect(out).toContain('Switch(checked = done, onCheckedChange = { done = it })')
  })

  // Phase E2 — non-signal value support for parent-owns-state pattern
  // (unblocks <Checkbox> → <Toggle> migration in TodoMVC TodoRow).
  //
  // Compiler's props-rewrite drops `props.X` to bare `X` in emit, so
  // SwiftUI/Compose see `todo.done` + `onToggle()` (props become struct
  // fields on the View / Composable function-param list).

  it('Swift: <Toggle value={props.todo.done} onChange={props.onToggle}> → custom Binding', () => {
    const out = txWithTodoProps(
      `<Toggle value={props.todo.done} onChange={props.onToggle} />`,
      'swift',
    )
    expect(out).toContain('Toggle("", isOn: Binding(')
    expect(out).toContain('get: { todo.done }')
    expect(out).toContain('set: { _ in')
    expect(out).toContain('onToggle()')
  })

  it('Kotlin: <Toggle value={props.todo.done} onChange={props.onToggle}> → Switch(checked = expr)', () => {
    const out = txWithTodoProps(
      `<Toggle value={props.todo.done} onChange={props.onToggle} />`,
      'kotlin',
    )
    expect(out).toContain('Switch(checked = todo.done')
    expect(out).toContain('onCheckedChange =')
    expect(out).toContain('onToggle()')
  })

  it('Swift: non-signal value WITHOUT onChange → falls through (cant write)', () => {
    // Without onChange there's no way to handle writes; the custom
    // Binding shape is invalid. Fall through to generic emit to
    // surface the problem clearly.
    const out = txWithTodoProps(`<Toggle value={props.todo.done} />`, 'swift')
    // Generic emit produces the literal tag name with attrs.
    expect(out).not.toContain('Toggle("", isOn: Binding')
  })
})

describe('Phase C3 — router primitive emit (<Link> + <RouterProvider> + <RouterView>)', () => {
  // Phase C1/C2 (#929, #930) shipped the runtime symbols
  // (PyreonLink/RouterProvider/RouterView on both Swift + Kotlin).
  // This phase wires the PMTC compiler to recognize the JSX tags +
  // emit the matching platform code.

  it('Swift: <Link to="/users">View</Link> → PyreonLink("/users") { Text("View") }', () => {
    const out = tx(`<Link to="/users">View</Link>`, 'swift')
    expect(out).toContain('PyreonLink("/users")')
    expect(out).toContain('Text("View")')
  })

  it('Kotlin: <Link to="/users">View</Link> → PyreonLink + clickable Box wrapper', () => {
    const out = tx(`<Link to="/users">View</Link>`, 'kotlin')
    expect(out).toContain('PyreonLink("/users")')
    expect(out).toContain('navigate ->')
    expect(out).toContain('Box(modifier = Modifier.clickable { navigate() })')
    expect(out).toContain('Text(text = "View")')
  })

  it('Swift: <RouterView /> → RouterView()', () => {
    const out = tx(`<RouterView />`, 'swift')
    expect(out).toContain('RouterView()')
  })

  it('Kotlin: <RouterView /> → RouterView()', () => {
    const out = tx(`<RouterView />`, 'kotlin')
    expect(out).toContain('RouterView()')
  })

  it('Swift: <RouterProvider router={r}><RouterView /></RouterProvider> → nested', () => {
    const out = tx(
      `<RouterProvider router={router}><RouterView /></RouterProvider>`,
      'swift',
    )
    expect(out).toContain('RouterProvider(router: router)')
    expect(out).toContain('RouterView()')
  })

  it('Kotlin: <RouterProvider router={r}><RouterView /></RouterProvider> → nested', () => {
    const out = tx(
      `<RouterProvider router={router}><RouterView /></RouterProvider>`,
      'kotlin',
    )
    expect(out).toContain('RouterProvider(router)')
    expect(out).toContain('RouterView()')
  })
})

// Phase C4 — call-site interception for `@pyreon/router` hooks
// (createRouter / useNavigate / useParams). Pre-C4 these were silently
// dropped at parse time → the body referenced undeclared identifiers.

// Test fixture for Phase C4 — imports the three router entry points so
// the parser's call-name match has the call sites to recognize.
// Phase C5 expands the ambient declarations to cover the route-config
// component references (HomePage / UserPage / etc.).
function txRouter(componentBody: string, target: 'swift' | 'kotlin'): string {
  const source = `
    import { createRouter, useNavigate, useParams } from '@pyreon/router'
    declare const HomePage: any
    declare const UserPage: any
    declare const AboutPage: any
    declare const SettingsPage: any
    export function App() {
      ${componentBody}
    }
  `
  return transform(source, { target }).code
}

describe('Phase C4 — createRouter / useNavigate / useParams call interception', () => {
  // createRouter: `const router = createRouter({...})` → @State / remember.

  it('Swift: const router = createRouter({...}) → @State private var router = PyreonRouter()', () => {
    const out = txRouter(
      `const router = createRouter({ routes: [] }); return <RouterView />`,
      'swift',
    )
    expect(out).toContain('@State private var router = PyreonRouter()')
    expect(out).not.toContain('createRouter(')
  })

  it('Kotlin: const router = createRouter({...}) → val router = remember { PyreonRouter() }', () => {
    const out = txRouter(
      `const router = createRouter({ routes: [] }); return <RouterView />`,
      'kotlin',
    )
    expect(out).toContain('val router = remember { PyreonRouter() }')
    expect(out).not.toContain('createRouter(')
  })

  // useNavigate: returns a (String) -> Void callable.

  it('Swift: const navigate = useNavigate() → computed property + @Environment injection', () => {
    const out = txRouter(
      `const navigate = useNavigate(); return <Button onPress={() => navigate('/x')}>Go</Button>`,
      'swift',
    )
    expect(out).toContain('@Environment(\\.pyreonRouter) private var pyreonRouter')
    expect(out).toContain('private var navigate: (String) -> Void { useNavigate(router: pyreonRouter) }')
    // Call site emits with parens (function-typed binding).
    expect(out).toContain('navigate("/x")')
  })

  it('Kotlin: const navigate = useNavigate() → val navigate = useNavigate() (no transform)', () => {
    const out = txRouter(
      `const navigate = useNavigate(); return <Button onPress={() => navigate('/x')}>Go</Button>`,
      'kotlin',
    )
    expect(out).toContain('val navigate = useNavigate()')
    expect(out).toContain('navigate("/x")')
    // Compose hook reads LocalPyreonRouter via CompositionLocal — no
    // explicit router arg.
    expect(out).not.toContain('useNavigate(router')
  })

  // useParams: returns a [String: String] map (Swift) / Map<String, String> (Kotlin).

  it('Swift: const params = useParams() → computed property returning [String: String]', () => {
    // Member access on `params` is deferred to a follow-up (member emit
    // for computed dict subscripts needs the parser to recognize
    // `params["id"]` as a subscript, not a field access). This test
    // covers the declaration emit + @Environment injection only.
    const out = txRouter(
      `const params = useParams(); return <Text>{params}</Text>`,
      'swift',
    )
    expect(out).toContain('@Environment(\\.pyreonRouter) private var pyreonRouter')
    expect(out).toContain('private var params: [String: String] { useParams(router: pyreonRouter) }')
  })

  it('Kotlin: const params = useParams() → val params = useParams()', () => {
    const out = txRouter(
      `const params = useParams(); return <Text>{params}</Text>`,
      'kotlin',
    )
    expect(out).toContain('val params = useParams()')
    expect(out).not.toContain('useParams(router')
  })

  // Combined shape — all three hooks in one component (the canonical
  // multi-route app pattern). Verifies decls compose correctly + the
  // shared @Environment injection doesn't fire twice.

  it('Swift: composed router app — createRouter + useNavigate + useParams', () => {
    const out = txRouter(
      `
      const router = createRouter({ routes: [] })
      const navigate = useNavigate()
      const params = useParams()
      return (
        <RouterProvider router={router}>
          <Button onPress={() => navigate('/dashboard')}>Go</Button>
        </RouterProvider>
      )
      `,
      'swift',
    )
    // Single @Environment injection regardless of hook count.
    expect(out.match(/@Environment\(\\\.pyreonRouter\)/g)?.length).toBe(1)
    expect(out).toContain('@State private var router = PyreonRouter()')
    expect(out).toContain('private var navigate: (String) -> Void')
    expect(out).toContain('private var params: [String: String]')
    expect(out).toContain('RouterProvider(router: router)')
    expect(out).toContain('navigate("/dashboard")')
  })

  it('Kotlin: composed router app — createRouter + useNavigate + useParams', () => {
    const out = txRouter(
      `
      const router = createRouter({ routes: [] })
      const navigate = useNavigate()
      const params = useParams()
      return (
        <RouterProvider router={router}>
          <Button onPress={() => navigate('/dashboard')}>Go</Button>
        </RouterProvider>
      )
      `,
      'kotlin',
    )
    expect(out).toContain('val router = remember { PyreonRouter() }')
    expect(out).toContain('val navigate = useNavigate()')
    expect(out).toContain('val params = useParams()')
    expect(out).toContain('RouterProvider(router)')
    expect(out).toContain('navigate("/dashboard")')
  })

  // No-router component — @Environment must NOT be injected.

  it('Swift: component without router hooks → no @Environment injection', () => {
    const out = txRouter(`return <Text>Hello</Text>`, 'swift')
    expect(out).not.toContain('@Environment(\\.pyreonRouter)')
    expect(out).not.toContain('pyreonRouter')
  })
})

// Phase C5.1 — parser extracts the routes config from createRouter()
// so downstream Swift/Kotlin emit (C5.2/C5.3) can produce real
// navigationDestination / NavHost blocks. Tests target the parser
// directly via parsePyreon to verify the captured IR shape; emit
// behavior is unchanged in C5.1 (still scaffold-only).

describe('Phase C5.1 — route extraction from createRouter({routes:[…]})', () => {
  // parsePyreon is the parser entry point; the test asserts the
  // captured DeclIR.routes for the `router` decl.
  async function parse(source: string) {
    const { parsePyreon } = await import('../parse')
    return parsePyreon(source)
  }

  const SOURCE_HEAD = `
    import { createRouter } from '@pyreon/router'
    declare const HomePage: any
    declare const UserPage: any
    declare const SettingsPage: any
  `

  it('extracts a single literal-path route', async () => {
    const result = await parse(`
      ${SOURCE_HEAD}
      export function App() {
        const router = createRouter({
          routes: [{ path: '/', component: HomePage }],
        })
        return <RouterView />
      }
    `)
    const decls = result.components[0]?.decls ?? []
    const routerDecl = decls.find((d) => d.kind === 'router')
    expect(routerDecl?.routes).toHaveLength(1)
    expect(routerDecl?.routes?.[0]?.path).toBe('/')
    expect(routerDecl?.routes?.[0]?.component).toEqual({
      kind: 'identifier',
      name: 'HomePage',
    })
  })

  it('extracts multiple routes including a :param pattern', async () => {
    const result = await parse(`
      ${SOURCE_HEAD}
      export function App() {
        const router = createRouter({
          routes: [
            { path: '/', component: HomePage },
            { path: '/users/:id', component: UserPage },
            { path: '/settings', component: SettingsPage },
          ],
        })
        return <RouterView />
      }
    `)
    const routerDecl = result.components[0]?.decls.find((d) => d.kind === 'router')
    expect(routerDecl?.routes).toHaveLength(3)
    expect(routerDecl?.routes?.map((r) => r.path)).toEqual([
      '/',
      '/users/:id',
      '/settings',
    ])
  })

  it('bails (routes undefined) when arg is missing — back-compat with C4 scaffold', async () => {
    const result = await parse(`
      import { createRouter } from '@pyreon/router'
      export function App() {
        const router = createRouter()
        return <RouterView />
      }
    `)
    const routerDecl = result.components[0]?.decls.find((d) => d.kind === 'router')
    // C4 scaffold shape preserved when routes can't be extracted.
    expect(routerDecl?.kind).toBe('router')
    expect(routerDecl?.routes).toBeUndefined()
  })

  it('bails when routes is non-literal (e.g. identifier reference)', async () => {
    const result = await parse(`
      import { createRouter } from '@pyreon/router'
      declare const myRoutes: any
      export function App() {
        const router = createRouter({ routes: myRoutes })
        return <RouterView />
      }
    `)
    const routerDecl = result.components[0]?.decls.find((d) => d.kind === 'router')
    expect(routerDecl?.routes).toBeUndefined()
  })

  it('bails when any route entry is malformed (missing path or component)', async () => {
    const result = await parse(`
      ${SOURCE_HEAD}
      export function App() {
        const router = createRouter({
          routes: [
            { path: '/', component: HomePage },
            { path: '/broken' },
          ],
        })
        return <RouterView />
      }
    `)
    const routerDecl = result.components[0]?.decls.find((d) => d.kind === 'router')
    // Whole-or-nothing — partial extraction would mislead the emit.
    expect(routerDecl?.routes).toBeUndefined()
  })

  it('captures member-expression component references (e.g. pages.Home)', async () => {
    const result = await parse(`
      import { createRouter } from '@pyreon/router'
      declare const pages: { Home: any; User: any }
      export function App() {
        const router = createRouter({
          routes: [
            { path: '/', component: pages.Home },
            { path: '/users/:id', component: pages.User },
          ],
        })
        return <RouterView />
      }
    `)
    const routerDecl = result.components[0]?.decls.find((d) => d.kind === 'router')
    expect(routerDecl?.routes).toHaveLength(2)
    expect(routerDecl?.routes?.[0]?.component?.kind).toBe('member')
    expect(routerDecl?.routes?.[1]?.component?.kind).toBe('member')
  })

  it('ignores unrecognised RouteRecord fields (name, meta, loader, etc.)', async () => {
    const result = await parse(`
      ${SOURCE_HEAD}
      export function App() {
        const router = createRouter({
          routes: [
            { path: '/', component: HomePage, name: 'home', meta: { auth: false } },
          ],
        })
        return <RouterView />
      }
    `)
    const routerDecl = result.components[0]?.decls.find((d) => d.kind === 'router')
    expect(routerDecl?.routes).toHaveLength(1)
    // Only path + component captured; name/meta dropped for v1.
    expect(routerDecl?.routes?.[0]).toEqual({
      path: '/',
      component: { kind: 'identifier', name: 'HomePage' },
    })
  })

  it('bails when first arg is not an object literal (e.g. a function call)', async () => {
    const result = await parse(`
      import { createRouter } from '@pyreon/router'
      declare const makeOpts: () => any
      export function App() {
        const router = createRouter(makeOpts())
        return <RouterView />
      }
    `)
    const routerDecl = result.components[0]?.decls.find((d) => d.kind === 'router')
    expect(routerDecl?.routes).toBeUndefined()
  })

  it('decl emit unchanged — @State + PyreonRouter() shape stays even with routes IR', async () => {
    // The C5.1 decl-emit shape (`@State private var router = PyreonRouter()`)
    // is unchanged — routes are EXTRA state on the IR, not a different
    // declaration shape. The navigationDestination block emitted by
    // C5.2 lives at the <RouterProvider> JSX site, not at the decl.
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('@State private var router = PyreonRouter()')
    expect(out).toContain('RouterProvider(router: router)')
  })
})

// Phase C5.2 — Swift emit wires the parsed routes into a real
// `.navigationDestination(for: String.self)` block inside the
// RouterProvider content closure.

describe('Phase C5.2 — Swift emit: .navigationDestination(for:)', () => {
  it('single literal-path route emits an `if path == "/"` branch', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('.navigationDestination(for: String.self) { path in')
    expect(out).toContain('if path == "/" {')
    expect(out).toContain('HomePage()')
  })

  it(':param route emits PyreonRouter.matchPath with params: arg', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/users/:id', component: UserPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('if path == "/" {')
    expect(out).toContain('HomePage()')
    expect(out).toContain('else if let params = PyreonRouter.matchPath(path, "/users/:id") {')
    expect(out).toContain('UserPage(params: params)')
  })

  it('multiple routes chain with `else if` after the first branch', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage },
          { path: '/settings', component: SettingsPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // First branch uses `if`; subsequent ones use `else if`.
    expect(out).toContain('if path == "/" {')
    expect(out).toContain('else if path == "/about" {')
    expect(out).toContain('else if path == "/settings" {')
  })

  it('falls back to scaffold-only when router-decl has no routes (C4 back-compat)', () => {
    const out = txRouter(
      `
      const router = createRouter()
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('@State private var router = PyreonRouter()')
    expect(out).toContain('RouterProvider(router: router)')
    expect(out).not.toContain('.navigationDestination')
  })

  it('falls back when router-attr is a non-identifier expression (foreign router)', () => {
    // When the router comes from outside the component scope (e.g. a
    // prop), the compiler can't resolve routes — emit stays scaffold.
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
      })
      const foreign: any = router
      return <RouterProvider router={foreign}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // The router attr value `foreign` is an identifier, but it's not
    // a router-decl, so no routes are looked up. (We're testing the
    // foreign-name path — the unmatched identifier gracefully falls
    // back rather than crashing.)
    expect(out).toContain('RouterProvider(router: foreign)')
    expect(out).not.toContain('.navigationDestination')
  })

  // Phase C5.4 — no-match fallback. SwiftUI's navigationDestination
  // closure returns `some View` and needs a default View when no
  // condition matches. Without an else branch the emit was a syntax
  // error AND apps silently rendered nothing for unmatched paths.

  it('C5.4 — single literal route emits else { Text("404") } fallback', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // Else branch after the literal-path if.
    expect(out).toContain('if path == "/" {')
    expect(out).toContain('else {')
    expect(out).toContain('Text("Pyreon Router: no route for \\(path)")')
  })

  it('C5.4 — :param route emits else fallback at end of if/else if chain', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/users/:id', component: UserPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('if path == "/" {')
    expect(out).toContain('else if let params = PyreonRouter.matchPath(path, "/users/:id")')
    expect(out).toContain('else {')
    expect(out).toContain('Text("Pyreon Router: no route for \\(path)")')
  })

  it('C5.4 — fallback does NOT fire when routes are absent (C4 scaffold)', () => {
    // The scaffold-only emit doesn't include a navigationDestination
    // at all, so the fallback Text must not appear either.
    const out = txRouter(
      `
      const router = createRouter()
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).not.toContain('.navigationDestination')
    expect(out).not.toContain('Pyreon Router: no route')
  })

  // R1.1 — iOS blank-startup bug fix. The current emit places
  // RouterView() (= EmptyView() in the native runtime) as the
  // NavigationStack body; navigationDestination only fires for
  // PUSHED paths. App launches blank. R1.1 replaces RouterView()
  // with the HOME route's component invocation when routes are
  // present, so the initial view IS the home page.

  it('R1.1 — RouterView inside routed RouterProvider emits home component', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // The NavigationStack content starts with HomePage() (NOT RouterView()).
    // Both literal-path routes still appear in the navigationDestination
    // chain (for pushed paths AND back-to-`/` via push).
    expect(out).toMatch(/RouterProvider\(router: router\) \{\s*\n\s*HomePage\(\)/)
    // navigationDestination still has the home + about branches.
    expect(out).toContain('if path == "/" {')
    expect(out).toContain('else if path == "/about" {')
  })

  it('R1.1 — picks first non-:param route when no literal `/` is present', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/users/:id', component: UserPage },
          { path: '/about', component: AboutPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // No literal `/`; first non-pattern is `/about` → AboutPage is home.
    expect(out).toMatch(/RouterProvider\(router: router\) \{\s*\n\s*AboutPage\(\)/)
  })

  it('R1.1 — falls back to RouterView() when no usable home route', () => {
    // Param-only routes can't be home routes (no source for params at
    // launch). Emit keeps the bare RouterView() — no worse than pre-R1.1.
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/users/:id', component: UserPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('RouterView()')
  })

  it('R1.1 — bare RouterView outside routed RouterProvider stays bare', () => {
    // R1.1 is scoped to routes-bearing RouterProviders; bare RouterView
    // calls (no surrounding RouterProvider with routes) emit unchanged.
    const out = txRouter(
      `return <RouterView />`,
      'swift',
    )
    expect(out).toContain('RouterView()')
    expect(out).not.toMatch(/RouterView\(\) [^\n]+ HomePage/)
  })
})

// Phase C5.3 — Kotlin emit wires the parsed routes into a real
// NavHost { composable(...) } block inside the RouterProvider.

describe('Phase R1.2 — Kotlin emit: when-dispatch on router.currentPath', () => {
  // R1.2 replaced the C5.3 NavHost-based emit with a simpler when-on-
  // currentPath dispatch. Three reasons documented in emit-kotlin.ts:
  //   1. NavHost's navController was disconnected from router.path —
  //      router.push() didn't drive nav updates
  //   2. NavHost.navigate("/unknown") throws at runtime
  //   3. NavHost requires androidx.navigation.compose (Android SDK dep)
  // The when-dispatch shape solves all three and is symmetric to Swift.

  it('emits when-dispatch on router.currentPath for a single literal route', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    expect(out).toContain('val currentPath = router.currentPath')
    expect(out).toContain('when {')
    expect(out).toContain('currentPath == "/" -> HomePage()')
    // No NavHost / composable() — clean break from the C5.3 shape.
    expect(out).not.toContain('NavHost')
    expect(out).not.toContain('composable(')
    expect(out).not.toContain('navController')
  })

  it(':param route routes through PyreonRouter.matchPath helper', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/users/:id', component: UserPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    // Literal preserved.
    expect(out).toContain('currentPath == "/" -> HomePage()')
    // Pattern routes through the runtime helper (same shape as Swift).
    expect(out).toContain('PyreonRouter.matchPath(currentPath, "/users/:id") != null ->')
    expect(out).toContain('val params = PyreonRouter.matchPath(currentPath, "/users/:id") ?: emptyMap()')
    expect(out).toContain('UserPage(params = params)')
  })

  it('no-match fallback renders Text with the unmatched path', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    // else branch handles unmatched paths gracefully (no IllegalArgumentException).
    expect(out).toContain('else -> Text(text = "Pyreon Router: no route for ${currentPath}")')
  })

  it('falls back to scaffold-only when router-decl has no routes (C4 back-compat)', () => {
    const out = txRouter(
      `
      const router = createRouter()
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    expect(out).toContain('val router = remember { PyreonRouter() }')
    expect(out).toContain('RouterProvider(router)')
    expect(out).not.toContain('when {')
    expect(out).not.toContain('currentPath')
  })

  it('multiple routes generate one when-branch per route', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/about', component: AboutPage },
          { path: '/settings', component: SettingsPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    expect(out).toContain('currentPath == "/" -> HomePage()')
    expect(out).toContain('currentPath == "/about" -> AboutPage()')
    expect(out).toContain('currentPath == "/settings" -> SettingsPage()')
  })
})

describe('Phase 3 — per-route redirects (compile-time alias)', () => {
  // A redirect-only route { path: '/old', redirect: '/new' } carries no
  // component; the native emit aliases the source path's dispatch branch
  // to the target route's component. No router-runtime push — fully
  // verifiable via swiftc/kotlinc. Chains resolve transitively; cyclic /
  // dangling redirects are dropped (degrade to the no-match fallback).

  it('Swift: redirect source branch renders the target component', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/old', redirect: '/about' },
          { path: '/about', component: AboutPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // The /old branch aliases to AboutPage (the /about target), as a
    // literal bare call — no redirect runtime, no params.
    expect(out).toContain('else if path == "/old" {')
    expect(out).toContain('else if path == "/about" {')
    // Both /old and /about render AboutPage().
    expect(out.match(/AboutPage\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('Kotlin: redirect source branch renders the target component', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/old', redirect: '/about' },
          { path: '/about', component: AboutPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    expect(out).toContain('currentPath == "/old" -> AboutPage()')
    expect(out).toContain('currentPath == "/about" -> AboutPage()')
  })

  it('Swift: a `/` redirect resolves the launch home route to the target', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', redirect: '/home' },
          { path: '/home', component: HomePage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // Launch body renders the resolved target (not EmptyView, not blank).
    expect(out).toContain('HomePage()')
    // navigationDestination aliases / → HomePage and keeps /home.
    expect(out).toContain('if path == "/" {')
    expect(out).toContain('else if path == "/home" {')
  })

  it('Swift: redirect chains (/a → /b → /c) resolve transitively', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/a', redirect: '/b' },
          { path: '/b', redirect: '/c' },
          { path: '/c', component: SettingsPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // /a and /b both alias to SettingsPage (the chain terminus).
    expect(out).toContain('if path == "/a" {')
    expect(out).toContain('else if path == "/b" {')
    expect(out).toContain('else if path == "/c" {')
    expect(out.match(/SettingsPage\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('Kotlin: redirect chains resolve transitively', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/a', redirect: '/b' },
          { path: '/b', redirect: '/c' },
          { path: '/c', component: SettingsPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    expect(out).toContain('currentPath == "/a" -> SettingsPage()')
    expect(out).toContain('currentPath == "/b" -> SettingsPage()')
    expect(out).toContain('currentPath == "/c" -> SettingsPage()')
  })

  it('Swift: a skipped leading redirect leaves the next branch as `if` (not `else if`)', () => {
    // Regression for the firstBranch refactor: when the FIRST route is a
    // dangling redirect (skipped), the next emitted branch must still open
    // the if/else-if chain with `if`, else the Swift is a syntax error.
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/dangling', redirect: '/nowhere' },
          { path: '/', component: HomePage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('if path == "/" {')
    expect(out).not.toContain('else if path == "/" {')
    // The dangling redirect produced no branch.
    expect(out).not.toContain('path == "/dangling"')
  })

  it('Swift: cyclic redirects are dropped — no branch, no crash, fallback persists', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/a', redirect: '/b' },
          { path: '/b', redirect: '/a' },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // Both cyclic routes skipped — neither emits a branch.
    expect(out).not.toContain('path == "/a"')
    expect(out).not.toContain('path == "/b"')
    // The closure still returns a View (bare fallback, no lone `else`).
    expect(out).toContain('Text("Pyreon Router: no route for')
    expect(out).not.toContain('else {')
  })

  it('Kotlin: dangling + cyclic redirects are dropped from the when-dispatch', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/dangling', redirect: '/nowhere' },
          { path: '/a', redirect: '/b' },
          { path: '/b', redirect: '/a' },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    // Valid literal route survives; unresolvable redirects do not.
    expect(out).toContain('currentPath == "/" -> HomePage()')
    expect(out).not.toContain('currentPath == "/dangling"')
    expect(out).not.toContain('currentPath == "/a"')
    expect(out).not.toContain('currentPath == "/b"')
    expect(out).toContain('else -> Text(text = "Pyreon Router: no route for ${currentPath}")')
  })
})

describe('Phase 3 — bare `*` / `(.*)` whole-route wildcard (404 catch-all)', () => {
  // `{ path: '*', component: NotFoundPage }` renders for ANY unmatched path.
  // The native emit puts its component in the dispatch ELSE-branch (not a
  // `path == "*"` equality branch, which would only match the literal "*").

  it('Swift: `*` route renders as the else-branch fallback (replaces the 404 Text)', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '*', component: AboutPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('if path == "/" {')
    // Wildcard component is the else-branch, NOT a path-equality branch.
    expect(out).toContain('else {')
    expect(out).toContain('AboutPage()')
    expect(out).not.toContain('path == "*"')
    // The dev-visible 404 Text is replaced by the wildcard component.
    expect(out).not.toContain('Pyreon Router: no route for')
  })

  it('Kotlin: `*` route renders as the `else ->` fallback', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '*', component: AboutPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    expect(out).toContain('currentPath == "/" -> HomePage()')
    expect(out).toContain('else -> AboutPage()')
    expect(out).not.toContain('currentPath == "*"')
    expect(out).not.toContain('Pyreon Router: no route for')
  })

  it('Swift: the `(.*)` form is also recognised as a whole-route wildcard', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '(.*)', component: AboutPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('else {')
    expect(out).toContain('AboutPage()')
    expect(out).not.toContain('path == "(.*)"')
  })

  it('Swift: a wildcard-only router emits the fallback bare (no lone `else`)', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '*', component: AboutPage }],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // No path branch was emitted → bare fallback, no `else {` (syntax error).
    expect(out).toContain('AboutPage()')
    expect(out).not.toContain('else {')
    expect(out).not.toContain('path == "*"')
  })
})

describe('Phase 4.1 — useFetch emit (PyreonFetch container + async harness)', () => {
  // `const x = useFetch<T>('/url')` → a PyreonFetch<T> container + a
  // mount-time async harness (.task{} / LaunchedEffect) driving the
  // begin/resolve/reject state machine. Field reads (`x.data`,
  // `x.isPending`) are @Observable properties on Swift, MutableState
  // (`.value`) on Kotlin.
  const FETCH_SRC = `
    type User = { name: string }
    export function Profile() {
      const user = useFetch<User>('/api/user')
      return <Text>{user.data}</Text>
    }
  `

  it('Swift: emits @State PyreonFetch<T> + a .task harness via begin/resolve/reject', () => {
    const out = transform(FETCH_SRC, { target: 'swift' }).code
    expect(out).toContain('@State private var user = PyreonFetch<User>()')
    expect(out).toContain('.task {')
    expect(out).toContain('user.begin()')
    expect(out).toContain('URLSession.shared.data(from: URL(string: "/api/user")!)')
    expect(out).toContain('user.resolve(try JSONDecoder().decode(User.self, from: bytes))')
    expect(out).toContain('catch { user.reject(error) }')
    // Swift field access is a plain @Observable property read.
    expect(out).toContain('user.data')
    expect(out).not.toContain('user.data.value')
  })

  it('Kotlin: emits remember { PyreonFetch<T>() } + a LaunchedEffect harness', () => {
    const out = transform(FETCH_SRC, { target: 'kotlin' }).code
    expect(out).toContain('val user = remember { PyreonFetch<User>() }')
    expect(out).toContain('LaunchedEffect(Unit) {')
    expect(out).toContain('user.begin()')
    expect(out).toContain('java.net.URL("/api/user").readText()')
    expect(out).toContain('user.resolve(Json.decodeFromString<User>(body))')
    expect(out).toContain('user.reject(e)')
    // Kotlin field access reads through Compose MutableState `.value`.
    expect(out).toContain('user.data.value')
  })

  it('Kotlin: every reactive field read appends .value (data / isPending / error)', () => {
    const out = transform(
      `
      type User = { name: string }
      export function Profile() {
        const user = useFetch<User>('/api/user')
        return <Show when={() => user.isPending}><Text>{user.error}</Text></Show>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('user.isPending.value')
    expect(out).toContain('user.error.value')
  })

  it('non-literal useFetch url bails (no PyreonFetch emit)', () => {
    const out = transform(
      `
      export function Profile(props: { path: string }) {
        const user = useFetch('/x' + props.path)
        return <Text>hi</Text>
      }
      `,
      { target: 'swift' },
    ).code
    // Concatenated URL isn't a literal → the decl falls through, no container.
    expect(out).not.toContain('PyreonFetch')
  })
})

describe('Phase 3 — per-route boolean guards (beforeEnter)', () => {
  // `{ path, component, beforeEnter: () => <boolExpr> }` wraps the matched
  // component in an inline conditional checked at navigation time. On
  // failure: the catch-all (wildcard) component if present, else a denial.

  it('Swift: a guarded route wraps its component in `if <guard> { … } else { … }`', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/admin', component: AboutPage, beforeEnter: () => isAuthed() },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('else if path == "/admin" {')
    expect(out).toContain('if isAuthed {')
    expect(out).toContain('AboutPage()')
    expect(out).toContain('} else {')
    // No wildcard route → guard-fail renders the denial placeholder.
    expect(out).toContain('Pyreon Router: access denied')
  })

  it('Kotlin: a guarded route emits `-> if (<guard>) Component() else <fallback>`', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/', component: HomePage },
          { path: '/admin', component: AboutPage, beforeEnter: () => isAuthed() },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'kotlin',
    )
    expect(out).toContain('currentPath == "/admin" -> if (isAuthed) AboutPage() else')
    expect(out).toContain('Pyreon Router: access denied')
    // Unguarded sibling stays a plain branch (no `if (` wrap).
    expect(out).toContain('currentPath == "/" -> HomePage()')
  })

  it('Swift: guard-fail falls back to the wildcard component when present', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [
          { path: '/admin', component: AboutPage, beforeEnter: () => isAuthed() },
          { path: '*', component: SettingsPage },
        ],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    // Guard-fail renders the wildcard catch-all, not the denial Text.
    expect(out).toContain('if isAuthed {')
    expect(out).toContain('AboutPage()')
    expect(out).toContain('SettingsPage()')
    expect(out).not.toContain('access denied')
  })

  it('an unguarded route emits no conditional wrap', () => {
    const out = txRouter(
      `
      const router = createRouter({
        routes: [{ path: '/', component: HomePage }],
      })
      return <RouterProvider router={router}><RouterView /></RouterProvider>
      `,
      'swift',
    )
    expect(out).toContain('if path == "/" {')
    expect(out).not.toContain('access denied')
    // Body is a bare HomePage() — no inner guard conditional.
    expect(out).not.toContain('if isAuthed')
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

// ============================================================================
// kotlinc validation — typecheck-clean against extended stubs.
//
// Phase B emit references symbols (Modifier, Arrangement, Alignment, Box,
// Color, RoundedCornerShape, PasswordVisualTransformation, .dp extension)
// that needed stub additions. This block validates the FULL canonical-
// primitive emit surface against `kotlinc + extended stubs` — proves
// the new emit is well-typed AND the new stubs cover everything the
// emit references.
//
// Skipped gracefully when kotlinc is absent (typical local macOS dev
// without the Kotlin toolchain). Runs in CI's Validate emitted Swift +
// Kotlin job.
// ============================================================================

import { isKotlincAvailable, validateKotlin } from '../validate'

const skipKotlincCondition =
  process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
  (!isKotlincAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

describe.skipIf(skipKotlincCondition)(
  'Phase B — canonical-primitive Kotlin emit typechecks via kotlinc + extended stubs',
  () => {
    it('exercises every wired primitive (Stack/Inline/Press/Field/Button) + every layout-modifier prop in one source', () => {
      // ONE component exercising every primitive + every Phase B
      // canonical prop. If kotlinc accepts this, the entire Phase B
      // emit surface is well-typed against the extended K4 stubs.
      const out = tx(
        `<Stack gap={2} padding={4} background="primary" radius="md" align="center">
          <Text size="lg" weight="bold" color="surface">Title</Text>
          <Inline gap={1} align="center" justify="between">
            <Text>Inline text</Text>
            <Button onPress={fn} variant="primary">Save</Button>
          </Inline>
          <Press onPress={fn} padding={2}>
            <Text>Custom-chromed area</Text>
          </Press>
          <Field
            value={draft}
            onChangeText={(t) => draft.set(t)}
            placeholder="Type"
            onSubmit={fn}
          />
          <Field
            value={draft}
            onChangeText={(t) => draft.set(t)}
            kind="password"
            placeholder="Password"
          />
        </Stack>`,
        'kotlin',
      )

      const result = validateKotlin(out)
      if (!result.ok) {
        throw new Error(
          `Phase B kotlinc validation FAILED:\n${result.error}\n\n--- emit ---\n${out}\n--- end ---`,
        )
      }
      expect(result.ok).toBe(true)
    })

    it('P2.2 layout primitives (Layer/Scroll/Spacer + align + scroll axis + modifiers) typecheck', () => {
      // Exercises the Phase P2.2 Kotlin emit (Box / verticalScroll /
      // horizontalScroll / rememberScrollState / Spacer.weight) against
      // the extended stubs. kotlinc accepting this proves the new emit is
      // well-typed AND the new stubs cover every referenced symbol.
      const out = tx(
        `<Scroll padding={2}>
          <Layer align="center" background="primary" radius="md">
            <Text>z-base</Text>
            <Text>z-top</Text>
          </Layer>
          <Layer align="start"><Text>tl</Text></Layer>
          <Layer align="end"><Text>br</Text></Layer>
          <Inline gap={2}>
            <Text>L</Text>
            <Spacer data-testid="gap" />
            <Text>R</Text>
          </Inline>
          <Scroll axis="horizontal"><Text>hscroll</Text></Scroll>
        </Scroll>`,
        'kotlin',
      )
      const result = validateKotlin(out)
      if (!result.ok) {
        throw new Error(
          `P2.2 layout kotlinc validation FAILED:\n${result.error}\n\n--- emit ---\n${out}\n--- end ---`,
        )
      }
      expect(result.ok).toBe(true)
    })

    it('P2.2 content primitives (Heading/Icon/Image + level/size/color/dims) typecheck', () => {
      // Exercises the Phase P2.2 Kotlin content emit (MaterialTheme.typography,
      // pyreonIcon → Icon, AsyncImage, Modifier.size/width/height) against the
      // extended stubs.
      const out = tx(
        `<Stack>
          <Heading>Default</Heading>
          <Heading level={2} color="primary">Section</Heading>
          <Heading level={6}>Small</Heading>
          <Icon name="star" />
          <Icon name="check" size="lg" color="danger" />
          <Image src="/hero.png" alt="hero" width={64} height={48} />
          <Image src="https://x/y.png" alt="" />
        </Stack>`,
        'kotlin',
      )
      const result = validateKotlin(out)
      if (!result.ok) {
        throw new Error(
          `P2.2 content kotlinc validation FAILED:\n${result.error}\n\n--- emit ---\n${out}\n--- end ---`,
        )
      }
      expect(result.ok).toBe(true)
    })

    it('P2.2 <Modal> → if (open) { Dialog(onDismissRequest) { ... } } typechecks', () => {
      const out = tx(
        `<Modal open={done} onClose={fn}>
          <Text>Dialog body</Text>
          <Button onPress={fn}>Close</Button>
        </Modal>`,
        'kotlin',
      )
      const result = validateKotlin(out)
      if (!result.ok) {
        throw new Error(
          `P2.2 Modal kotlinc validation FAILED:\n${result.error}\n\n--- emit ---\n${out}\n--- end ---`,
        )
      }
      expect(result.ok).toBe(true)
    })

    it('Stack with align="start" / "end" + Modifier chain (background + radius) typechecks', () => {
      const out = tx(
        `<Stack align="start" background="surface" radius="lg" padding={3}><Text>x</Text></Stack>`,
        'kotlin',
      )
      const result = validateKotlin(out)
      expect(result.ok).toBe(true)
    })

    it('Inline with align variants typechecks across the Alignment.Vertical enum', () => {
      // Consolidate all 3 align variants into ONE source -> ONE
      // kotlinc invocation. Previously this looped (3 kotlinc cold-
      // starts) and timed out at 20s under CI parallel-load contention.
      const out = tx(
        `<Stack>
          <Inline align="start" gap={2}><Text>start</Text></Inline>
          <Inline align="center" gap={2}><Text>center</Text></Inline>
          <Inline align="end" gap={2}><Text>end</Text></Inline>
        </Stack>`,
        'kotlin',
      )
      const result = validateKotlin(out)
      if (!result.ok) {
        throw new Error(`align variants failed kotlinc:\n${result.error}\n\n--- emit ---\n${out}\n--- end ---`)
      }
      expect(result.ok).toBe(true)
      // Confirm all 3 variants resolved to their Alignment enum branches.
      // Inline (Row) uses the Vertical axis for align: start->Top,
      // center->CenterVertically, end->Bottom (Compose convention).
      expect(out).toContain('Alignment.Top')
      expect(out).toContain('Alignment.CenterVertically')
      expect(out).toContain('Alignment.Bottom')
    })
  },
)
