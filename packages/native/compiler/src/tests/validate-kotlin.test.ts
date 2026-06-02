// Compile-validation gate for the Kotlin emitter.
//
// Mirrors validate-swift.test.ts but uses `kotlinc` + the Compose stubs
// file (see kotlin-stubs.ts) for semantic-level validation. Skipped
// when kotlinc is absent (typical local macOS dev); runs in the CI
// Docker job that has the Kotlin toolchain installed.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(HERE, '..', 'fixtures')

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8')
}

function emit(name: string): string {
  const result = transform(loadFixture(name), { target: 'kotlin' })
  return result.code
}

const skipCondition =
  process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
  (!isKotlincAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

describe.skipIf(skipCondition)('Kotlin emit — kotlinc validates each fixture', () => {
  // Phase B4 (native readiness audit 2026-06): brought the Kotlin
  // fixture loop to PARITY with Swift's 10-fixture loop. Pre-B4 only
  // 01-07 ran; 08/09/10 were extracted (the fixture files existed)
  // but never invoked here. Scout-2's "Kotlin fixture parity" finding.
  // Phase B5: added 11-canonical-layout to exercise the broader
  // canonical-primitive set (Stack/Inline/Heading) — scout-1's finding.
  // Phase B5.2: added 12-canonical-input (Field/Toggle/Modal — form +
  // overlay primitives).
  const fixtures = [
    '01-stateless.tsx',
    '02-signal.tsx',
    '03-computed.tsx',
    '04-event.tsx',
    '05-multi-signal.tsx',
    '06-for.tsx',
    '07-show.tsx',
    '08-string-computed.tsx',
    '09-props.tsx',
    '10-multi-component.tsx',
    '11-canonical-layout.tsx',
    '12-canonical-input.tsx',
    '13-canonical-overlay.tsx',
    '14-canonical-content.tsx',
  ] as const

  for (const fixture of fixtures) {
    it(`${fixture} — emitted Kotlin compiles cleanly`, () => {
      const kotlin = emit(fixture)
      const result = validateKotlin(kotlin)
      if (!result.ok) {
        throw new Error(
          `kotlinc rejected emitted output for ${fixture}:\n${result.error}\n\n` +
            `--- emitted source ---\n${kotlin}\n--- end ---`,
        )
      }
      expect(result.ok).toBe(true)
    })
  }
})

describe('validate.ts Kotlin module surface', () => {
  it('isKotlincAvailable returns a boolean', () => {
    expect(typeof isKotlincAvailable()).toBe('boolean')
  })

  it('validateKotlin respects PYREON_SKIP_NATIVE_VALIDATE', () => {
    const prev = process.env.PYREON_SKIP_NATIVE_VALIDATE
    process.env.PYREON_SKIP_NATIVE_VALIDATE = '1'
    try {
      const result = validateKotlin('this is not kotlin at all : ;')
      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
      expect(result.skipReason).toBe('PYREON_SKIP_NATIVE_VALIDATE=1')
    } finally {
      if (prev === undefined) delete process.env.PYREON_SKIP_NATIVE_VALIDATE
      else process.env.PYREON_SKIP_NATIVE_VALIDATE = prev
    }
  })

  it('validateKotlin skips gracefully when kotlinc is absent', () => {
    if (isKotlincAvailable()) {
      // Tool exists locally — the skip-path isn't reachable. Verify
      // the require-flag inverts that into a hard fail instead.
      const prev = process.env.PYREON_REQUIRE_NATIVE_VALIDATE
      process.env.PYREON_REQUIRE_NATIVE_VALIDATE = '1'
      try {
        const result = validateKotlin('@Composable fun X() {}')
        // With kotlinc present, this should validate (or fail with a
        // real Kotlin error). Skip-because-absent should not apply.
        expect(result.skipped).toBeUndefined()
      } finally {
        if (prev === undefined) delete process.env.PYREON_REQUIRE_NATIVE_VALIDATE
        else process.env.PYREON_REQUIRE_NATIVE_VALIDATE = prev
      }
    } else {
      const result = validateKotlin('@Composable fun X() {}')
      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
      expect(result.skipReason).toBe('kotlinc not on PATH')
    }
  })

  it.skipIf(!isKotlincAvailable())(
    'validateKotlin catches a genuinely-broken Kotlin snippet',
    () => {
      const result = validateKotlin('this is { not kotlin at all : ;')
      expect(result.ok).toBe(false)
      expect(result.error).toBeDefined()
    },
  )
})

// ----------------------------------------------------------------------------
// K4 — extended Compose stubs gate
//
// The 7 starter-fixture validations above only exercise the original minimal
// stub surface (Text/Button/Column/LazyColumn). TodoMVC needs more — the
// Compose Material widget set, saveable-state machinery, keyboard-options
// DSL, and kotlinx-serialization. K4 extends `kotlin-stubs.ts` with stubs
// for each; this gate asserts the extended stubs themselves typecheck-clean
// when used in a TodoMVC-shape Composable.
//
// The fixture below is HAND-WRITTEN to exercise every K4 stub addition
// directly. It does NOT route through `transform()` — that depends on the
// K1/K2/K3 emit fixes, which ship as sibling PRs. After those four PRs all
// merge, a follow-up replaces this hand-written fixture with the real
// TodoMVC emit (via `transform()`) and gates that end-to-end. This split
// keeps each K-numbered PR independently mergeable.
// ----------------------------------------------------------------------------

const TODOMVC_SHAPE_FIXTURE = `
@Serializable
data class Todo(var id: Int, var text: String, var done: Boolean)

enum class Filter { all, active, completed }

@Composable
fun TodoApp() {
    var todos by rememberSaveable(saver = Saver<List<Todo>, String>(
        save = { Json.encodeToString(it) },
        restore = { Json.decodeFromString<List<Todo>>(it) },
    )) { mutableStateOf<List<Todo>>(listOf()) }
    var filter by remember { mutableStateOf(Filter.all) }
    var draft by remember { mutableStateOf("") }

    Column {
        TextField(
            value = draft,
            onValueChange = { draft = it },
            placeholder = { Text("What needs to be done?") },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { }),
        )
        Row {
            Checkbox(checked = false, onCheckedChange = { })
            Text(text = "label")
            Button(onClick = { filter = Filter.active }) {
                Text("Active")
            }
        }
        Box {
            Text(text = "boxed")
        }
    }
}
`

describe.skipIf(skipCondition)('K4 — extended Compose stubs typecheck against TodoMVC-shape fixture', () => {
  it('hand-written TodoMVC-shape Composable typechecks against the extended stubs', () => {
    // The fixture above exercises every K4 stub addition in the shape
    // the real TodoMVC emit will produce post-K1+K2+K3. Validates the
    // stubs themselves, not the emit. After K1/K2/K3 all merge, a
    // follow-up replaces this with the real `transform()` output.
    const result = validateKotlin(TODOMVC_SHAPE_FIXTURE)
    if (!result.ok) {
      throw new Error(
        `K4 stub-validation failed:\n${result.error}\n\n` +
          `--- fixture ---\n${TODOMVC_SHAPE_FIXTURE}\n--- end ---`,
      )
    }
    expect(result.ok).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// K-FINAL — end-to-end TodoMVC emit validation
//
// Closes the Phase 2 Kotlin arc. Now that K1 (#879, enum equality), K2
// (#881, derivedStateOf labeled returns), K3 (#880, VStack/HStack →
// Column/Row), and K4 (#882, extended Compose stubs) have all landed
// on main, the real `transform()` output for TodoMVC.tsx should be
// typecheck-clean against the kotlinc + K4-stubs gate.
//
// This test replaces the hand-written `TODOMVC_SHAPE_FIXTURE` above
// with the actual TodoMVC source compiled via `transform()`. If any
// of K1/K2/K3 regresses, this test will fail loudly with the
// specific kotlinc error pointing at the regression.
//
// Parallels `validate-swift.test.ts`'s TodoMVC gate. After both
// platforms have this gate, the PMTC multi-target compile contract
// is CI-validated end-to-end on both targets — the same source
// produces typecheck-clean SwiftUI AND typecheck-clean Compose
// simultaneously.
// ----------------------------------------------------------------------------

// TodoMVC fixture path is identical to the one todomvc-baseline.test.ts uses.
// Importing/sharing would add cross-test coupling for no benefit; the path
// itself is the load-bearing piece and stable across tests.
const TODOMVC_SOURCE_PATH = (() => {
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(
    here,
    '..', '..', '..', '..', '..',
    'examples', 'native-todomvc-ios', 'src', 'TodoApp.tsx',
  )
})()

describe.skipIf(skipCondition)('K-FINAL — real TodoMVC emit typechecks via kotlinc + K4 stubs', () => {
  it('transform()-emitted Kotlin for examples/native-todomvc-ios/src/TodoApp.tsx is typecheck-clean', () => {
    const source = readFileSync(TODOMVC_SOURCE_PATH, 'utf8')
    const out = transform(source, { target: 'kotlin' })

    // Sanity: emit must contain the shape K1+K2+K3 produce. If these
    // fail, the regression is in the Kotlin emit not the stubs — the
    // structural anchors point straight at the right K* fix.
    expect(out.code).toContain('if (filter == Filter.active)') // K1
    expect(out.code).toContain('return@derivedStateOf xs') // K2
    // K3: Column { ... TextField ... } — supports both bare `Column {`
    // (legacy) AND `Column(arg = ...) {` (Phase B canonical-primitive
    // emit with gap/align/data-testid). The arg list may contain nested
    // parens (Arrangement.spacedBy(8.dp), Modifier.testTag("x")) so
    // match any non-brace chars between `Column` and the body brace.
    expect(out.code).toMatch(/Column[^{]*\{[\s\S]+TextField/) // K3
    expect(out.code).toContain('@Serializable') // foundational @Serializable annotation

    // End-to-end: pass the full emit through kotlinc with the K4 stubs.
    // 0 errors = the full Phase 2 Kotlin arc is intact AND the stub
    // surface covers everything the emit references.
    const result = validateKotlin(out.code)
    if (!result.ok) {
      throw new Error(
        `K-FINAL: TodoMVC Kotlin emit failed kotlinc validation:\n${result.error}\n\n` +
          `--- emit ---\n${out.code}\n--- end ---`,
      )
    }
    expect(result.ok).toBe(true)
  })
})
