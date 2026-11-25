// An app type named like a name the Swift runtime sources spell bare no longer
// breaks the iOS build (#4765).
//
// An iOS app compiles every dependency's `native/swift/*.swift` into the app
// target beside the generated code, and Swift resolves a bare name to the
// current module's type first. `examples/native-tasks` declares `type Task`,
// which turned `Task { … }` in `PyreonWebView.swift` into the model's
// `init(from: Decoder)`; #4772 qualified that one use. Every other bare name in
// ~100 runtime files had the same exposure, and `View` / `Text` / `Date` break
// the generated file itself. The compiler now emits such a user type as
// `Name_` (`swift-reserved-rename.ts`), from a reserved list GENERATED from the
// runtime sources.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bareCapitalised,
  renderReservedSwiftNames,
  scanReservedSwiftNames,
  shippedRuntimeSwift,
  swiftCode,
} from '../../scripts/gen-swift-reserved-names'
import { renameSwiftReservedNames, sourceSpelling } from '../swift-reserved-rename'
import { SWIFT_RESERVED_NAMES } from '../swift-reserved-names'
import { isSwiftUIAvailable } from '../validate'
// The real app compile loads the first-party plugins, as the CLI does.
import { transform } from '../../../../../scripts/native-first-party-plugins'
import { swiftErrorLines, typecheckAgainstRealRuntime } from './real-runtime-swift'

const renamed = (src: string): string => renameSwiftReservedNames(src)?.code ?? src

describe('the reserved list is generated from the runtime sources', () => {
  it('is current: regenerate with `bun packages/native/compiler/scripts/gen-swift-reserved-names.ts`', () => {
    const committed = readFileSync(join(import.meta.dirname, '../swift-reserved-names.ts'), 'utf8')
    expect(committed).toBe(renderReservedSwiftNames(scanReservedSwiftNames()))
  })

  it('scans the shipped runtime, and holds the names that broke a real build', () => {
    const files = shippedRuntimeSwift()
    expect(files.length).toBeGreaterThan(60)
    expect(files.some((f) => f.endsWith('/hooks/native/swift/PyreonWebView.swift'))).toBe(true)
    expect(files.some((f) => /Tests?\.swift$/.test(f) || f.includes('/tests/'))).toBe(false)
    for (const n of ['Task', 'Error', 'Data', 'Color', 'State', 'Group', 'Binding', 'Button', 'Identifiable', 'URL', 'View', 'Text', 'Date']) {
      expect(SWIFT_RESERVED_NAMES.has(n), n).toBe(true)
    }
  })

  // The emit's own vocabulary enters the list through the stub gate's surface. Check it against the fixture that
  // exercises every primitive: every name its Swift spells bare that it neither declares nor took from the user's
  // own code must be reserved, or a user type of that name would break the generated file.
  it('covers every name the every-primitive emit spells', () => {
    const fixture = readFileSync(join(import.meta.dirname, '../fixtures/every-primitive.tsx'), 'utf8')
    const { code } = transform(fixture, { target: 'swift' })
    const swift = swiftCode(code)
    const own = new Set<string>()
    for (const m of swift.matchAll(/\b(?:struct|enum|class|protocol|typealias|func|let|var|case)\s+([A-Z]\w*)/g)) own.add(m[1]!)
    for (const m of swift.matchAll(/[<,]\s*([A-Z]\w*)\s*:/g)) own.add(m[1]!)
    // Names the fixture spells that are not a package import are the user's (its components, its models).
    const fromPackages = new Set<string>()
    for (const m of fixture.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'@pyreon\/[^']+'/g)) {
      for (const n of m[1]!.split(',')) fromPackages.add(n.trim())
    }
    for (const n of fixture.match(/\b[A-Z]\w*/g) ?? []) if (!fromPackages.has(n)) own.add(n)
    const missing = [...bareCapitalised(swift)].filter((n) => !own.has(n) && !SWIFT_RESERVED_NAMES.has(n))
    expect(missing).toEqual([])
  })
})

describe('the rename', () => {
  it('renames a declared type and every type position naming it, and nothing else', () => {
    const out = renamed(`interface Error { code: number }
const e: Error = { code: 1 }
function fail(): never { throw new Error('x') }
const label = { Error: 1 }.Error
`)
    expect(out).toContain('interface Error_ {')
    expect(out).toContain('const e: Error_ =')
    // A type-only declaration leaves the value namespace alone: this is still the global Error.
    expect(out).toContain("throw new Error('x')")
    // Property keys and member names are not bindings.
    expect(out).toContain('{ Error: 1 }.Error')
  })

  it('keeps the type annotation of a renamed binding (oxc spans a binding with its annotation)', () => {
    expect(renamed('type Grad = { n: number }\nconst NO_GRADIENT: Grad = { n: 1 }\nfunction f(Data: Grad, x: Data) {}\n')).toBe(
      'type Grad = { n: number }\nconst NO_GRADIENT_: Grad = { n: 1 }\nfunction f(Data: Grad, x: Data) {}\n',
    )
    expect(renamed('type Data = { n: number }\nconst NO_GRADIENT: Data = { n: 1 }\nconst { Group = 1 }: { Group?: number } = {}\n')).toBe(
      'type Data_ = { n: number }\nconst NO_GRADIENT_: Data_ = { n: 1 }\nconst { Group: Group_ = 1 }: { Group?: number } = {}\n',
    )
  })

  it('renames a component in values and JSX, and expands a shorthand property', () => {
    const out = renamed(`export function Group(props: { title: string }) { return <Stack>{props.title}</Stack> }
const routes = { Group }
export function Page() { return <Group title="a"></Group> }
`)
    expect(out).toContain('export function Group_(')
    expect(out).toContain('{ Group: Group_ }')
    expect(out).toContain('<Group_ title="a"></Group_>')
  })

  it('agrees across files: a sibling import is renamed by name, a package import never is', () => {
    const page = renamed(`import { Task } from './models'
import type { Data } from '@/types'
import { Button, Text } from '@pyreon/primitives'
const t: Task = { id: 1 }
let d: Data | null = null
export function Page() { return <Button onPress={() => {}}><Text>x</Text></Button> }
`)
    expect(page).toContain("import { Task_ } from './models'")
    expect(page).toContain("import type { Data_ } from '@/types'")
    expect(page).toContain("import { Button, Text } from '@pyreon/primitives'")
    expect(page).toContain('const t: Task_ =')
    expect(page).toContain('let d: Data_ | null')
    expect(page).toContain('<Button onPress')
    // An aliased import keeps its local name; the sibling's export is still `Task_`.
    expect(renamed(`import { Task as Todo } from './models'\nconst t: Todo = { id: 1 }\n`)).toContain(
      "import { Task_ as Todo } from './models'",
    )
    // A re-export barrel spells it the same way.
    expect(renamed(`export { Task } from './models'\n`)).toContain("export { Task_ } from './models'")
    // …without claiming the name for this file: a barrel that re-exports `Error` still throws the global one.
    expect(renamed(`export { Error } from './errors'\nexport function fail(): never { throw new Error('x') }\n`)).toBe(
      `export { Error_ } from './errors'\nexport function fail(): never { throw new Error('x') }\n`,
    )
  })

  it('leaves the primitive spellings, unreserved names, ambient declarations and other packages alone', () => {
    expect(renameSwiftReservedNames('type Int = number\ntype Double = number\nconst n: Int = 1\n')).toBeUndefined()
    expect(renameSwiftReservedNames('interface Todo { id: number }\n')).toBeUndefined()
    expect(renameSwiftReservedNames('declare const Text: unknown\n')).toBeUndefined()
    expect(renameSwiftReservedNames("import { Color } from 'some-lib'\nconst c: Color = Color.red\n")).toBeUndefined()
  })

  it('applies to the Swift emit only, and the emit says what it renamed', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
type Task = { id: number; title: string }
const ITEMS: Task[] = [{ id: 1, title: 'a' }]
export function Board() { return (<Stack><Text>{ITEMS[0]!.title}</Text></Stack>) }
`
    const swift = transform(src, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('struct Task_: Codable')
    expect(swift.code).toContain('[Task_]')
    expect(swift.code).not.toMatch(/\bTask\b(?!_)(?![^\n]*swift-reserved-rename)/)
    expect(swift.code.split('\n')[0]).toContain('`Task` → `Task_`')
    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain('data class Task(')
    expect(kotlin.code).not.toContain('Task_')
  })
})

// The class, end to end: app types named like runtime names, compiled in ONE
// module with every shipped runtime Swift file against the real iOS SDK —
// exactly how `examples/native-tasks/ios/project.yml` builds.
describe('the rename has no collisions and no gaps', () => {
  // `Task` becomes `Task_`, so a user's own `Task_` must move too, or the file declares `struct Task_` twice. Renaming
  // by one more underscore keeps that true across files with no knowledge of them.
  it('a user name that is a reserved name plus underscores moves one further', () => {
    const out = transform(`type Task = { id: number }\ntype Task_ = { other: string }\nconst a: Task = { id: 1 }\nconst b: Task_ = { other: 'x' }\n`, { target: 'swift' })
    expect(out.code.match(/^struct Task_:/gm)).toHaveLength(1)
    expect(out.code.match(/^struct Task__:/gm)).toHaveLength(1)
    expect(out.code).toContain('private let b: Task__ = Task__(other: "x")')
    expect(out.code.split('\n')[0]).toContain('`Task_` → `Task__`')
    expect(sourceSpelling('`Task__` and `Task_`', ['Task', 'Task_'])).toBe('`Task_` and `Task`')
  })

  it('an import type of a sibling (`import(\'./models\').Task`) is renamed like an import of it', () => {
    expect(renamed("let a: import('./models').Task | null = null\nlet b: import('./m').Data.Sub | null = null\nlet c: import('pkg').Task\n")).toBe(
      "let a: import('./models').Task_ | null = null\nlet b: import('./m').Data_.Sub | null = null\nlet c: import('pkg').Task\n",
    )
  })

  // A type the COMPILER names: `interface Video { player: { … } }` lifts `player` to `VideoPlayer`, which the runtime's
  // PyreonVideoPlayer.swift calls bare (AVKit's view). The emit's declarations are the choke point.
  const LIFTED = `import { Stack, Text } from '@pyreon/primitives'
interface Video { id: number; player: { src: string } }
interface Chart { spec: { kind: string } }
const V: Video = { id: 1, player: { src: 'a' } }
const C: Chart = { spec: { kind: 'bar' } }
export function Board() { return (<Stack><Text>{V.player.src}</Text><Text>{C.spec.kind}</Text></Stack>) }
`
  it('renames a synthesized type with a reserved name, declaration and every use', () => {
    const single = transform(LIFTED, { target: 'swift' })
    expect(single.warnings).toEqual([])
    expect(single.code).toContain('struct VideoPlayer_: Codable')
    expect(single.code).toContain('var player: VideoPlayer_')
    expect(single.code).toContain('VideoPlayer_(src: "a")')
    expect(single.code).toContain('struct ChartSpec_: Codable')
    // Past the note line, no bare use of the old names is left.
    expect(single.code.split('\n').slice(1).join('\n')).not.toMatch(/(?<![\w.])(?:VideoPlayer|ChartSpec)(?![\w])/)
    // In a multi-file build the new name carries the module suffix, so no two files (nor a user `VideoPlayer`, which
    // becomes `VideoPlayer_`) can collide.
    const multi = transform(LIFTED, { target: 'swift', filename: 'board.tsx' }).code
    expect(multi).toMatch(/struct VideoPlayer_[a-z0-9]+: Codable/)
    // Kotlin has no such class and keeps the name.
    expect(transform(LIFTED, { target: 'kotlin' }).code).toContain('data class VideoPlayer(')
  })
})

describe('a Plain-Mode file is renamed the same way', () => {
  it('renames before the Plain pre-pass, so both dialects agree', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
import { Stack, Text } from '@pyreon/primitives'
type Task = { id: number; title: string }
export function Board() {
  let tasks = state<Task[]>([{ id: 1, title: 'a' }])
  return (<Stack><Text>{String(tasks.length)}</Text></Stack>)
}
`
    const out = transform(src, { target: 'swift' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('struct Task_: Codable')
    expect(out.code).toContain('Task_(id: 1, title: "a")')
  })
})

describe('diagnostics name the type as the author spelled it', () => {
  it('maps a renamed name back in warnings, and leaves a longer name alone', () => {
    expect(sourceSpelling('field `Page_.score` of Page_, not Page_x or MyPage_', ['Page'])).toBe(
      'field `Page.score` of Page, not Page_x or MyPage_',
    )
  })
})

const LIFTED_APP = `import { Stack, Text } from '@pyreon/primitives'
interface Video { id: number; player: { src: string } }
interface Chart { spec: { kind: string } }
const V: Video = { id: 1, player: { src: 'a' } }
const C: Chart = { spec: { kind: 'bar' } }
export function Board() { return (<Stack><Text>{V.player.src}</Text><Text>{C.spec.kind}</Text></Stack>) }
`

describe.runIf(isSwiftUIAvailable())('an app whose types are named like runtime names builds against the real runtime', () => {
  const compile = (files: { name: string; code: string }[]): void => {
    const diagnostics = typecheckAgainstRealRuntime(files)
    if (diagnostics !== null) expect.fail(`swiftc -typecheck failed against the real runtime:\n${swiftErrorLines(diagnostics)}`)
  }

  // Names that break the RUNTIME files, not the generated one. Without the rename this fails in
  // PyreonChartCanvas.swift (`Task`; PyreonWebView.swift has written `_Concurrency.Task` since #4772), PyreonOidc.swift (`Error`, `Data`, `URL`),
  // PyreonDragDrop.swift (`Color`), PyreonAudioPlayer.swift (`State`), PyreonVideoPlayer.swift (`Group`),
  // PyreonFlowView.swift (`Binding`, `Button`) and PyreonFlowEdgeCanvas.swift (`Identifiable`).
  it('models that shadow names in the shipped runtime sources', () => {
    const names = ['Task', 'Error', 'Data', 'Color', 'State', 'Group', 'Binding', 'Button', 'Identifiable', 'URL', 'User']
    const app = `import { Stack, Heading } from '@pyreon/primitives'
${names.map((n) => `type ${n} = { id: number; title: string }`).join('\n')}
${names.map((n, i) => `const ITEM_${i}: ${n} = { id: ${i}, title: '${n}' }`).join('\n')}
export function Board() {
  return (
    <Stack>
${names.map((_, i) => `      <Heading>{ITEM_${i}.title}</Heading>`).join('\n')}
    </Stack>
  )
}
`
    const out = transform(app, { target: 'swift', filename: 'app.tsx' })
    expect(out.warnings).toEqual([])
    compile([{ name: 'App.swift', code: out.code }])
  }, 300_000)

  // Without the synthesized-name pass this fails in PyreonVideoPlayer.swift (`VideoPlayer(player:)` resolves to the
  // lifted struct) and with two `struct Task_` declarations.
  it('synthesized types, and a user name one underscore past a reserved one', () => {
    const app = LIFTED_APP + `type Task = { id: number }\ntype Task_ = { other: string }\nconst T1: Task = { id: 1 }\nconst T2: Task_ = { other: 'x' }\nexport function Tasks() { return (<Stack><Text>{T2.other + String(T1.id)}</Text></Stack>) }\n`
    const out = transform(app, { target: 'swift', filename: 'lifted.tsx' })
    expect(out.warnings).toEqual([])
    compile([{ name: 'Lifted.swift', code: out.code }])
  }, 300_000)

  // Names the generated code itself spells (`View`, `Text`, `Date`), a component among them, across two files: the
  // page imports the models and the component, and both files must agree on the Swift spelling.
  it('names the generated code spells, declared in one file and imported by another', () => {
    const names = ['View', 'Date', 'Task']
    const models = `import { Stack, Heading } from '@pyreon/primitives'
${names.map((n) => `export type ${n} = { id: number; title: string }`).join('\n')}
${names.map((n, i) => `const ITEM_${i}: ${n} = { id: ${i}, title: '${n}' }`).join('\n')}
export function Text(props: { label: string }) {
  return (
    <Stack>
      <Heading>{props.label}</Heading>
${names.map((_, i) => `      <Heading>{ITEM_${i}.title}</Heading>`).join('\n')}
    </Stack>
  )
}
`
    // A literal typed by an IMPORTED type is a separate, pre-existing limit (the importer cannot see the shape, for
    // any name), so the page only NAMES the types — which is what has to agree across files.
    const page = `import { Stack } from '@pyreon/primitives'
import { ${names.join(', ')}, Text } from './models'
${names.map((n, i) => `function title${i}(x: ${n}): string { return x.title }`).join('\n')}
export function Page() {
  return (
    <Stack>
      <Text label="page" />
    </Stack>
  )
}
`
    const a = transform(models, { target: 'swift', filename: 'models.tsx' })
    const b = transform(page, { target: 'swift', filename: 'page.tsx' })
    expect(a.warnings).toEqual([])
    // PMTC warns on a helper parameter typed from ANOTHER file for any name; it emits the name verbatim, and that
    // verbatim name must be the one models.swift declares.
    expect(b.warnings.filter((w) => !/parameter type `\w+` can't be resolved/.test(w))).toEqual([])
    expect(b.code).toContain('Text_(label: "page")')
    compile([
      { name: 'Models.swift', code: a.code },
      { name: 'Page.swift', code: b.code },
    ])
  }, 300_000)
})
