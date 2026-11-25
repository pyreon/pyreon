/**
 * The `swift` / `kotlin` model files against the REAL toolchains (#4836).
 *
 * Not only "it compiles": each platform's file is compiled with a small
 * program that decodes a payload exercising every mapping (snake_case and
 * keyword keys, string / integer enums, a date-time, nullability, maps, free
 * JSON, a tagged and an untagged union, a recursive model, an int64 past
 * 2^53), re-encodes it, and prints what it read. A mapping that compiles and
 * decodes WRONG fails here. Skips per toolchain, like Lathe's other native
 * tests; see `helpers/native-toolchain.ts` for what each skip means.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import {
  hasKotlinc,
  hasSwiftc,
  kotlinRun,
  kotlinTypecheckStubbed,
  kotlinxSerialization,
  swiftRun,
  swiftTypecheck,
} from './helpers/native-toolchain'

const SPEC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'native-models.json'), 'utf8')

function files(nativeModels: { kotlinPackage?: string; swiftAccess?: 'internal' | 'public' }) {
  const out = generate(SPEC, resolveConfig({ input: 'x', plugins: ['swift', 'kotlin'], nativeModels }))
  const swift = out.files.find((f) => f.path === 'swift/Models.swift')?.contents as string
  const kotlin = out.files.find((f) => f.path === 'kotlin/Models.kt')?.contents as string

  return { swift, kotlin }
}

const PET = String.raw`{
  "id": 9007199254740993,
  "name": "Rex",
  "status": "in_progress",
  "priority": -3,
  "kind": "dog",
  "created_at": "2024-01-02T03:04:05.5Z",
  "nickname": null,
  "metadata": { "a": [1, "x", null] },
  "extra": { "k": true },
  "owner": { "email": "o@example.test", "class": "vip" },
  "class": "keyword",
  "2fa-enabled": true,
  "price$": "9.99",
  "shape": { "shape_type": "square", "side": 2 },
  "contact": 42,
  "attributes": { "legs": 4 },
  "unknown_field": "ignored"
}`

const EXPECTED = [
  'id=9007199254740993',
  'name=Rex',
  'status=in_progress',
  'priority=-3',
  'kind=dog',
  'nickname=null',
  'metadata=1',
  'owner=o@example.test/vip',
  'class=keyword',
  '2fa=true',
  'price=9.99',
  'shape=square:2.0',
  'contact=int:42',
  'legs=4',
  'contact2=double:1.5',
  'contact3=address:Main',
  'node=a>b+c',
  'shape-unknown=rejected',
  'roundtrip=Rex/9.99/square',
]

const SWIFT_MAIN = `import Foundation
let pet = try! LatheJSON.decoder.decode(Pet.self, from: Data(${JSON.stringify(PET)}.utf8))
print("id=\\(pet.id)")
print("name=\\(pet.name)")
print("status=\\(pet.status.rawValue)")
print("priority=\\(pet.priority!.rawValue)")
print("kind=\\(pet.kind.rawValue)")
print("created=\\(pet.createdAt.timeIntervalSince1970)")
print("nickname=\\(pet.nickname ?? "null")")
print("metadata=\\(pet.metadata!.count)")
print("owner=\\(pet.owner!.email)/\\(pet.owner!.class_!)")
print("class=\\(pet.class_!)")
print("2fa=\\(pet._2faEnabled!)")
print("price=\\(pet.price!)")
if case .square(let s)? = pet.shape { print("shape=square:\\(s.side)") }
if case .intValue(let i)? = pet.contact { print("contact=int:\\(i)") }
print("legs=\\(pet.attributes!["legs"]!)")
if case .doubleValue(let d) = try! JSONDecoder().decode(Contact.self, from: Data("1.5".utf8)) { print("contact2=double:\\(d)") }
if case .address(let a) = try! JSONDecoder().decode(Contact.self, from: Data(#"{"street":"Main"}"#.utf8)) { print("contact3=address:\\(a.street)") }
let node = try! JSONDecoder().decode(Node.self, from: Data(#"{"value":"a","next":{"value":"b"},"children":[{"value":"c"}]}"#.utf8))
print("node=\\(node.value)>\\(node.next!.value)+\\(node.children![0].value)")
do {
    _ = try JSONDecoder().decode(Shape.self, from: Data(#"{"shape_type":"hexagon","side":1}"#.utf8))
    print("shape-unknown=accepted")
} catch {
    print("shape-unknown=rejected")
}
let again = try! LatheJSON.decoder.decode(Pet.self, from: try! LatheJSON.encoder.encode(pet))
var tag = "?"
if case .square? = again.shape { tag = "square" }
print("roundtrip=\\(again.name)/\\(again.price!)/\\(tag)")
print("date-roundtrip=\\(again.createdAt == pet.createdAt)")
`

const KOTLIN_MAIN = (pkg: string) => `package ${pkg}
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

fun main() {
    val pet = LatheJson.decodeFromString<Pet>(${JSON.stringify(PET).replace(/\$/g, '\\$')})
    println("id=\${pet.id}")
    println("name=\${pet.name}")
    println("status=\${pet.status}")
    println("priority=\${pet.priority}")
    println("kind=\${pet.kind}")
    println("created=\${pet.createdAt}")
    println("nickname=\${pet.nickname ?: "null"}")
    println("metadata=\${pet.metadata!!.size}")
    println("owner=\${pet.owner!!.email}/\${pet.owner!!.class_}")
    println("class=\${pet.class_}")
    println("2fa=\${pet._2faEnabled}")
    println("price=\${pet.price}")
    val shape = pet.shape
    if (shape is Shape.Square) println("shape=square:\${shape.value.side}")
    val contact = pet.contact
    if (contact is Contact.IntValue) println("contact=int:\${contact.value}")
    println("legs=\${pet.attributes!!["legs"]}")
    val c2 = Json.decodeFromString<Contact>("1.5")
    if (c2 is Contact.DoubleValue) println("contact2=double:\${c2.value}")
    val c3 = Json.decodeFromString<Contact>("""{"street":"Main"}""")
    if (c3 is Contact.Address) println("contact3=address:\${c3.value.street}")
    val node = Json.decodeFromString<Node>("""{"value":"a","next":{"value":"b"},"children":[{"value":"c"}]}""")
    println("node=\${node.value}>\${node.next!!.value}+\${node.children!![0].value}")
    try {
        Json.decodeFromString<Shape>("""{"shape_type":"hexagon","side":1}""")
        println("shape-unknown=accepted")
    } catch (e: IllegalArgumentException) {
        println("shape-unknown=rejected")
    }
    val again = LatheJson.decodeFromString<Pet>(LatheJson.encodeToString(pet))
    println("roundtrip=\${again.name}/\${again.price}/\${if (again.shape is Shape.Square) "square" else "?"}")
    println("equal=\${again == pet}")
}
`

describe.skipIf(!hasSwiftc())('swift models against swiftc', () => {
  it('compile, decode every mapping, and round-trip (public access)', () => {
    const { swift } = files({ swiftAccess: 'public' })
    const r = swiftRun({ 'Models.swift': swift, 'main.swift': SWIFT_MAIN })
    expect(r.ok, r.output).toBe(true)
    const lines = r.output.trim().split('\n')
    expect(lines.filter((l) => !l.startsWith('created=') && !l.startsWith('date-roundtrip=')).sort()).toEqual(
      [...EXPECTED].sort(),
    )
    // RFC 3339 with fractional seconds decoded, and written back losslessly.
    expect(lines).toContain('created=1704164645.5')
    expect(lines).toContain('date-roundtrip=true')
  }, 300_000)

  it('type-checks with internal access, in Swift 5 and Swift 6 language modes', () => {
    const { swift } = files({})
    for (const flags of [[], ['-swift-version', '6']]) {
      const r = swiftTypecheck({ 'Models.swift': swift }, flags)
      expect(r.ok, `${flags.join(' ')}\n${r.output}`).toBe(true)
    }
  }, 300_000)
})

const kx = kotlinxSerialization()

describe.skipIf(!kx)('kotlin models against kotlinc + the real kotlinx.serialization plugin', () => {
  it('compile, decode every mapping, and round-trip (custom package)', () => {
    const pkg = 'com.example.api'
    const { kotlin } = files({ kotlinPackage: pkg })
    const r = kotlinRun({ 'Models.kt': kotlin, 'Main.kt': KOTLIN_MAIN(pkg) }, `${pkg}.MainKt`, kx as NonNullable<typeof kx>)
    expect(r.ok, r.output).toBe(true)
    const lines = r.output.trim().split('\n')
    const expected = EXPECTED.map((l) =>
      l === 'status=in_progress' ? 'status=IN_PROGRESS' : l === 'kind=dog' ? 'kind=DOG' : l === 'shape=square:2.0' ? 'shape=square:2.0' : l,
    )
    expect(lines.filter((l) => !l.startsWith('created=') && !l.startsWith('equal=')).sort()).toEqual(expected.sort())
    // `date-time` stays the wire string on Kotlin (no extra dependency).
    expect(lines).toContain('created=2024-01-02T03:04:05.5Z')
    expect(lines).toContain('equal=true')
  }, 300_000)
})

describe.skipIf(!hasKotlinc() || kx !== undefined)('kotlin models against kotlinc (stubbed kotlinx.serialization)', () => {
  it('type-checks against the kotlinx.serialization API surface it names', () => {
    const { kotlin } = files({ kotlinPackage: 'com.example.api' })
    const r = kotlinTypecheckStubbed({ 'Models.kt': kotlin })
    expect(r.ok, r.output).toBe(true)
  }, 300_000)
})
