// `<Select>` (#3980) — the canonical single-choice picker on every target.
//
// Web `<select>` (`@pyreon/primitives` web/Select.tsx) is the oracle; iOS lowers
// to the runtime's `PyreonSelect` (a menu-style `Picker`), Android to its
// `PyreonSelect` (a Material 3 `ExposedDropdownMenuBox`). These pin the emit for
// the option-list shapes an app writes, the named warnings for the ones that
// cannot lower, and the compile — against the stubs, and on a Mac against the
// real iOS SDK and the real `PyreonSelect.swift`.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const app = (jsx: string, extra = '') => `
  import { signal } from '@pyreon/reactivity'
  import { Stack, Select, Text } from '@pyreon/primitives'
  import type { SelectOption } from '@pyreon/primitives'
  type Fruit = { value: string; label: string; disabled?: boolean }
  type Plain = { value: string; label: string }
  type Locked = { value: string; label: string; disabled: boolean }
  type Person = { id: string; name: string }
  ${extra}
  export function FruitPicker(props: { people: Person[] }) {
    const fruit = signal('')
    const fruits = signal<Fruit[]>([{ value: 'a', label: 'Apple' }])
    const plain = signal<Plain[]>([{ value: 'a', label: 'Apple' }])
    const locked = signal<Locked[]>([{ value: 'a', label: 'Apple', disabled: false }])
    const typed = signal<SelectOption[]>([{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana', disabled: true }])
    return (<Stack>${jsx}<Text>{fruit()}</Text></Stack>)
  }
`
const both = (jsx: string, extra = '') => ({
  swift: transform(app(jsx, extra), { target: 'swift' }),
  kotlin: transform(app(jsx, extra), { target: 'kotlin' }),
})

describe('<Select> — the option-list shapes', () => {
  it('an inline literal list, with a disabled option and a placeholder', () => {
    const { swift, kotlin } = both(
      `<Select value={fruit()} options={[{ value: 'a', label: 'Apple' }, { value: 'p', label: 'Pear', disabled: true }]} onChange={(v) => fruit.set(v)} placeholder="Pick a fruit" />`,
    )
    expect(swift.code).toContain('PyreonSelectOption(value: "a", label: "Apple")')
    expect(swift.code).toContain('PyreonSelectOption(value: "p", label: "Pear", disabled: true)')
    expect(swift.code).toContain('placeholder: "Pick a fruit"')
    expect(swift.code).toContain('selection: Binding(get: { fruit }, set: { v in fruit = v })')
    expect(kotlin.code).toContain(
      'PyreonSelect(value = fruit, options = listOf(PyreonSelectOption(value = "a", label = "Apple"), PyreonSelectOption(value = "p", label = "Pear", disabled = true)), onChange = { v -> fruit = v }, placeholder = "Pick a fruit")',
    )
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('a list already typed `SelectOption[]` passes straight through — the runtime type IS SelectOption', () => {
    const { swift, kotlin } = both(`<Select value={fruit()} options={typed()} onChange={(v) => fruit.set(v)} />`)
    // The literal constructs the runtime type rather than a synthesized twin.
    expect(swift.code).toContain('[SelectOption(value: "a", label: "Apple"), SelectOption(value: "b", label: "Banana", disabled: true)]')
    expect(swift.code).toContain('options: typed\n')
    expect(swift.code).not.toMatch(/struct SelectOption\b/)
    expect(kotlin.code).toContain('options = typed,')
    expect(kotlin.code).not.toMatch(/class SelectOption\b/)
    expect(swift.warnings).toEqual([])
  })

  it('an app-declared element type is mapped, reading `disabled` only when it is declared', () => {
    const opt = both(`<Select value={fruit()} options={fruits()} onChange={(v) => fruit.set(v)} />`)
    expect(opt.swift.code).toContain('(fruits).map { PyreonSelectOption(value: $0.value, label: $0.label, disabled: $0.disabled ?? false) }')
    expect(opt.kotlin.code).toContain('(fruits).map { PyreonSelectOption(value = it.value, label = it.label, disabled = it.disabled ?: false) }')
    const req = both(`<Select value={fruit()} options={locked()} onChange={(v) => fruit.set(v)} />`)
    expect(req.swift.code).toContain('disabled: $0.disabled)')
    expect(req.kotlin.code).toContain('disabled = it.disabled)')
    const none = both(`<Select value={fruit()} options={plain()} onChange={(v) => fruit.set(v)} />`)
    expect(none.swift.code).toContain('(plain).map { PyreonSelectOption(value: $0.value, label: $0.label) }')
    expect(none.swift.warnings).toEqual([])
  })

  it('`disabled` on the control, and every write goes through onChange', () => {
    const { swift, kotlin } = both(
      `<Select value={fruit()} options={typed()} onChange={(v) => { fruit.set(v); fruits.set([]) }} disabled data-testid="sel" />`,
    )
    expect(swift.code).toContain('.disabled(true)')
    expect(swift.code).toContain('.accessibilityIdentifier("sel")')
    expect(swift.code).toMatch(/set: \{ v in[\s\S]*fruit = v[\s\S]*fruits = \[\]/)
    expect(kotlin.code).toContain('enabled = false')
    expect(kotlin.code).toContain('modifier = Modifier.testTag("sel")')
  })
})

describe('<Select> — every shape that cannot lower is NAMED', () => {
  const warns = (jsx: string, needle: RegExp, extra = '') => {
    const { swift, kotlin } = both(jsx, extra)
    expect(swift.warnings.some((w) => needle.test(w)), swift.warnings.join('\n')).toBe(true)
    expect(kotlin.warnings.some((w) => needle.test(w)), kotlin.warnings.join('\n')).toBe(true)
  }

  it('no onChange (or no value)', () => {
    warns(`<Select value={fruit()} options={typed()} />`, /needs both `value` and `onChange`/)
  })

  it('a non-literal element, a missing label, an unread field', () => {
    warns(`<Select value={fruit()} options={[{ value: 'a', label: 'A' }, typed()[0]]} onChange={(v) => fruit.set(v)} />`, /must be an object literal/)
    warns(`<Select value={fruit()} options={[{ value: 'a' }]} onChange={(v) => fruit.set(v)} />`, /without both `value` and `label`/)
    warns(`<Select value={fruit()} options={[{ value: 'a', label: 'A', icon: 'x' }]} onChange={(v) => fruit.set(v)} />`, /`icon` is not read/)
  })

  it('an element type with no value/label', () => {
    warns(`<Select value={fruit()} options={props.people} onChange={(v) => fruit.set(v)} />`, /have no `value` and `label` fields/)
  })

  it('a renamed SelectOption import', () => {
    const src = `
      import { signal } from '@pyreon/reactivity'
      import { Select } from '@pyreon/primitives'
      import type { SelectOption as Opt } from '@pyreon/primitives'
      export function P() { const o = signal<Opt[]>([]); const v = signal(''); return <Select value={v()} options={o()} onChange={(x) => v.set(x)} /> }`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n')).toMatch(/RENAMED import/)
    }
  })
})

describe('<Select> — the emit compiles', () => {
  const jsx = `
    <Select value={fruit()} options={[{ value: 'a', label: 'Apple' }, { value: 'p', label: 'Pear', disabled: true }]} onChange={(v) => fruit.set(v)} placeholder="Pick" />
    <Select value={fruit()} options={typed()} onChange={(v) => fruit.set(v)} disabled />
    <Select value={fruit()} options={fruits()} onChange={(v) => fruit.set(v)} />
    <Select value={fruit()} options={locked()} onChange={(v) => fruit.set(v)} />
    <Select value={fruit()} options={plain()} onChange={(v) => fruit.set(v)} />`
  const source = app(jsx)

  it('with no warnings', () => {
    expect(transform(source, { target: 'swift' }).warnings).toEqual([])
    expect(transform(source, { target: 'kotlin' }).warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stubs', () => {
    const res = validateSwiftWithStubs(transform(source, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin type-checks against the stubs', () => {
    const res = validateKotlin(transform(source, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  }, 180_000)

  it.skipIf(!isSwiftUIAvailable())('Swift type-checks against the REAL iOS SDK and the REAL PyreonSelect.swift', () => {
    realCompile(source)
  }, 180_000)

  it.skipIf(!isSwiftUIAvailable())('…even beside an app component named `Picker` or `Text`', () => {
    // The runtime spells SwiftUI's names module-qualified, so an app type of
    // the same name in the same module does not shadow them.
    const shadowing = source.replace('export function FruitPicker', 'export function Picker(props: { people: Person[] }) { return <Text>p</Text> }\n  export function FruitPicker')
    expect(shadowing).toContain('function Picker(')
    realCompile(shadowing)
  }, 180_000)
})

function realCompile(source: string): void {
  {
    const runtime = resolve(import.meta.dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonSelect.swift')
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-select-real-'))
    try {
      const appPath = join(dir, 'SelectApp.swift')
      writeFileSync(appPath, `import SwiftUI\nimport Foundation\n${transform(source, { target: 'swift' }).code}`, 'utf8')
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      execFileSync(
        'xcrun',
        ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, appPath, runtime],
        { stdio: 'pipe' },
      )
    } catch (err) {
      const e = err as { stderr?: Buffer }
      expect.fail(String(e.stderr ?? err))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
