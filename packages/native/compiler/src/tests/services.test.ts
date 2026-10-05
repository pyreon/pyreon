// Service descriptors (`services.ts`) — the plain "service container" hooks are
// DATA, rendered by ONE generic `service` branch in each emitter.
//
// The expected strings below are the byte shapes the hand-written per-kind
// emit branches produced before the migration, so this file is also the
// behaviour-preservation lock for them (the golden gate covers the corpus; this
// pins every hook × target explicitly, plus an identifier that needs escaping).

import { describe, expect, it } from 'vitest'
import { parsePyreon, NATIVE_LOWERED_HOOKS } from '../parse'
import { transform } from '../index'
import { SERVICES, SERVICE_BY_HOOK, renderKotlinService, serviceFor } from '../services'

interface Expected {
  readonly hook: string
  readonly swift: string
  /** Kotlin lines for identifier `x`, joined as the emitter joins them. */
  readonly kotlin: string
}

const EXPECTED: readonly Expected[] = [
  {
    hook: 'useShare',
    swift: 'PyreonShare()',
    kotlin: 'val xCtx = LocalContext.current\n  val x = remember { PyreonShare(xCtx) }',
  },
  {
    hook: 'useLinking',
    swift: 'PyreonLinking()',
    kotlin: 'val xCtx = LocalContext.current\n  val x = remember { PyreonLinking(xCtx) }',
  },
  {
    hook: 'useHaptics',
    swift: 'PyreonHaptics()',
    kotlin:
      'val xHaptic = LocalHapticFeedback.current\n  val x = remember { PyreonHaptics(xHaptic) }',
  },
  {
    hook: 'useNotifications',
    swift: 'PyreonNotifications()',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonNotifications(xCtx) }',
  },
  {
    hook: 'useBiometrics',
    swift: 'PyreonBiometrics()',
    kotlin: 'val x = remember { PyreonBiometrics() }',
  },
  {
    hook: 'useImagePicker',
    swift: 'PyreonImagePicker()',
    kotlin:
      'val x = remember { PyreonImagePicker() }\n  x.launcher = rememberLauncherForActivityResult(\n      ActivityResultContracts.PickVisualMedia()\n    ) { uri -> x.onResult(uri?.toString()) }',
  },
  {
    hook: 'useFilePicker',
    swift: 'PyreonFilePicker()',
    kotlin:
      'val x = remember { PyreonFilePicker() }\n  x.launcher = rememberLauncherForActivityResult(\n      ActivityResultContracts.OpenDocument()\n    ) { uri -> x.onResult(uri?.toString()) }',
  },
  {
    hook: 'useCamera',
    swift: 'PyreonCamera(presenter: UIKitCameraPresenter())',
    kotlin:
      'val x = remember { PyreonCamera() }\n  x.launch = rememberCameraLauncher { uri -> x.onResult(uri) }',
  },
]

const src = (hook: string, name: string): string =>
  `import { ${hook} } from '@pyreon/hooks'
export function App() {
  const ${name} = ${hook}()
  return <Text>hi</Text>
}`

describe('service descriptors — emit shape per hook × target', () => {
  for (const e of EXPECTED) {
    it(`${e.hook} → Swift @State + Kotlin remember`, () => {
      const sw = transform(src(e.hook, 'x'), { target: 'swift' })
      expect(sw.code).toContain(`@State private var x = ${e.swift}`)
      const kt = transform(src(e.hook, 'x'), { target: 'kotlin' })
      expect(kt.code).toContain(e.kotlin)
    })
  }

  it('the table covers exactly the SERVICES entries', () => {
    expect(EXPECTED.map((e) => e.hook).sort()).toEqual(SERVICES.map((s) => s.hook).sort())
  })

  it('substitutes {id} with the ESCAPED Kotlin identifier and escapes the Swift one', () => {
    // `object` / `extension` are keywords on Kotlin / Swift respectively.
    const kt = transform(src('useShare', 'object'), { target: 'kotlin' })
    expect(kt.code).toContain('val `object`Ctx = LocalContext.current')
    expect(kt.code).toContain('val `object` = remember { PyreonShare(`object`Ctx) }')
    const sw = transform(src('useShare', 'extension'), { target: 'swift' })
    expect(sw.code).toContain('@State private var `extension` = PyreonShare()')
  })

  it('replaces EVERY {id} occurrence, including inside the launcher wiring', () => {
    const picker = serviceFor('useImagePicker')
    const out = renderKotlinService(picker, 'p')
    expect(out).not.toContain('{id}')
    expect(out.match(/\bp\b/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

describe('service descriptors — the generic declaration', () => {
  it('parses to { kind: "service", name, hook } and round-trips both emitters', () => {
    const parsed = parsePyreon(src('useBiometrics', 'bio'))
    const decls = parsed.components.flatMap((c) => c.decls)
    expect(decls).toContainEqual({ kind: 'service', name: 'bio', hook: 'useBiometrics' })
    expect(transform(src('useBiometrics', 'bio'), { target: 'swift' }).warnings).toEqual([])
    expect(transform(src('useBiometrics', 'bio'), { target: 'kotlin' }).warnings).toEqual([])
  })

  it('a service never carries an unlowered-hook warning', () => {
    for (const s of SERVICES) {
      const out = transform(src(s.hook, 'x'), { target: 'swift' })
      expect(out.warnings.filter((w) => w.includes(s.hook))).toEqual([])
    }
  })

  it('serviceFor throws a guided error for a hook with no descriptor', () => {
    expect(() => serviceFor('useNope')).toThrow(/\[Pyreon\].*services\.ts/)
  })
})

describe('service descriptors — invariants', () => {
  it('every service has a non-empty swift initialiser', () => {
    for (const s of SERVICES) expect(s.swift.trim().length, s.hook).toBeGreaterThan(0)
  })

  it('every service has Kotlin lines and the val line binds {id}', () => {
    for (const s of SERVICES) {
      expect(s.kotlin.length, s.hook).toBeGreaterThanOrEqual(1)
      expect(
        s.kotlin.some((l) => l.includes('val {id} = ')),
        `${s.hook}: no \`val {id} = …\` line`,
      ).toBe(true)
      expect(
        s.kotlin.every((l) => !l.includes('$')),
        `${s.hook}: descriptor lines are verbatim, not template literals`,
      ).toBe(true)
    }
  })

  it('hooks are unique and indexed', () => {
    const hooks = SERVICES.map((s) => s.hook)
    expect(new Set(hooks).size).toBe(hooks.length)
    for (const h of hooks) expect(SERVICE_BY_HOOK.get(h)?.hook).toBe(h)
    expect(SERVICE_BY_HOOK.size).toBe(SERVICES.length)
  })

  it('every service hook is in NATIVE_LOWERED_HOOKS (no spurious unlowered warning)', () => {
    for (const s of SERVICES) expect(NATIVE_LOWERED_HOOKS.has(s.hook), s.hook).toBe(true)
  })
})
