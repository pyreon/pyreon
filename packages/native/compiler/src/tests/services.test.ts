// Service descriptors (`services.ts`) — the plain "service container" hooks are
// DATA, rendered by ONE generic `service` branch in each emitter.
//
// The expected strings below are the byte shapes the hand-written per-kind
// emit branches produced before the migration, so this file is also the
// behaviour-preservation lock for them (the golden gate covers the corpus; this
// pins every hook × target explicitly, plus an identifier that needs escaping).

import { describe, expect, it } from 'vitest'
import { parsePyreon, NATIVE_LOWERED_HOOKS } from '../parse'
import { moduleTag } from '../expr-utils'
import { transform } from '../index'
import { SERVICES, SERVICE_BY_HOOK, renderKotlinService, serviceFor } from '../services'
import type { ParseResult } from '../types'

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
  // ── satellite-bearing services (accessor reads / callRead / kotlinState / lifecycle) ──
  {
    hook: 'useClipboard',
    swift: 'PyreonClipboard()',
    kotlin:
      'val xCtx = LocalContext.current\n  val xScope = rememberCoroutineScope()\n  val x = remember { PyreonClipboard(xCtx, xScope) }',
  },
  {
    hook: 'useBluetooth',
    swift: 'PyreonBluetooth(scanner: CoreBluetoothScanner())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonBluetooth(AndroidBluetoothScanner(xCtx)) }',
  },
  {
    hook: 'useWakeLock',
    swift: 'PyreonWakeLock(controller: UIKitIdleTimer())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonWakeLock(AndroidScreenKeeper(xCtx)) }',
  },
  {
    hook: 'useDeviceInfo',
    swift: 'PyreonDeviceInfo(probe: UIKitDeviceProbe())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonDeviceInfo(AndroidDeviceProbe(xCtx)) }',
  },
  {
    hook: 'useSafeArea',
    swift: 'PyreonSafeArea(probe: UIKitSafeAreaProbe())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonSafeArea(AndroidSafeAreaProbe(xCtx)) }',
  },
  {
    hook: 'useScreenOrientation',
    swift: 'PyreonScreenOrientation(probe: UIKitOrientationProbe())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonScreenOrientation(AndroidOrientationProbe(xCtx)) }',
  },
  {
    hook: 'useDeviceMotion',
    swift: 'PyreonDeviceMotion(source: CoreMotionSource())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonDeviceMotion(AndroidMotionSource(xCtx)) }',
  },
  {
    hook: 'useSpeech',
    swift: 'PyreonSpeech(synth: AVSpeechSynth())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonSpeech(AndroidSpeechSynth(xCtx)) }',
  },
  {
    hook: 'useAudioRecorder',
    swift: 'PyreonAudioRecorder(engine: AVFoundationRecordingEngine())',
    kotlin:
      'val xCtx = LocalContext.current\n  val x = remember { PyreonAudioRecorder(AndroidRecordingEngine(xCtx)) }',
  },
  { hook: 'useOnline', swift: 'PyreonNetworkStatus()', kotlin: 'val x = rememberPyreonNetworkStatus()' },
  { hook: 'useAppState', swift: 'PyreonAppState()', kotlin: 'val x = rememberPyreonAppState()' },
  {
    hook: 'useCrashReporter',
    swift: 'PyreonCrashReporter()',
    kotlin: 'val x = rememberPyreonCrashReporter()',
  },
  { hook: 'useGeolocation', swift: 'PyreonGeolocation()', kotlin: 'val x = rememberPyreonGeolocation()' },
  {
    hook: 'usePush',
    swift: 'PyreonPushNotifications()',
    kotlin: 'val x = rememberPyreonPushNotifications()',
  },
  { hook: 'usePayments', swift: 'PyreonPayments()', kotlin: 'val x = remember { PyreonPayments() }' },
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

// ─────────────────────────────────────────────────────────────────────────────
// Satellite vocabulary. The tables below are TYPED BY HAND from the per-kind
// code the descriptors replaced (not read back from the descriptors), so each
// is an independent lock on the old behaviour: breaking one descriptor field
// fails exactly the matching rows.
// ─────────────────────────────────────────────────────────────────────────────

/** `x.m()` accessor reads: [hook, member, Kotlin appends `.value`]. */
const ACCESSOR_READS: readonly (readonly [string, string, boolean])[] = [
  ['useBluetooth', 'scanning', true],
  ['useBluetooth', 'devices', true],
  ['useBluetooth', 'error', true],
  ['useBluetooth', 'available', false],
  ['useWakeLock', 'active', true],
  ['useWakeLock', 'supported', false],
  ['useDeviceInfo', 'platform', false],
  ['useDeviceInfo', 'model', false],
  ['useDeviceInfo', 'osVersion', false],
  ['useDeviceInfo', 'isTouch', false],
  ['useDeviceInfo', 'screen', false],
  ['useScreenOrientation', 'type', false],
  ['useScreenOrientation', 'angle', false],
  ['useDeviceMotion', 'active', true],
  ['useDeviceMotion', 'supported', false],
  ['useDeviceMotion', 'acceleration', true],
  ['useDeviceMotion', 'rotation', true],
  ['useSpeech', 'speaking', true],
  ['useSpeech', 'supported', false],
  ['useAudioRecorder', 'recording', true],
  ['useAudioRecorder', 'error', true],
  ['useAudioRecorder', 'supported', false],
  ['useClipboard', 'copied', false],
  ['useClipboard', 'text', false],
]

const readSrc = (hook: string, expr: string): string =>
  `import { ${hook} } from '@pyreon/hooks'
export function App() {
  const x = ${hook}()
  return <Text>{String(${expr})}</Text>
}`

describe('service descriptors — accessorReads (web accessor call → native property)', () => {
  it.each(ACCESSOR_READS)('%s: x.%s() drops its parens on both targets', (hook, member, kotlinValue) => {
    const sw = transform(readSrc(hook, `x.${member}()`), { target: 'swift' }).code
    expect(sw).toContain(`x.${member}`)
    expect(sw).not.toContain(`x.${member}()`)
    expect(sw).not.toContain(`x.${member}.value`)
    const kt = transform(readSrc(hook, `x.${member}()`), { target: 'kotlin' }).code
    expect(kt).not.toContain(`x.${member}()`)
    if (kotlinValue) expect(kt).toContain(`x.${member}.value`)
    else {
      expect(kt).toContain(`x.${member}`)
      expect(kt).not.toContain(`x.${member}.value`)
    }
  })

  it('a member NOT in accessorReads is a method call and keeps its parens', () => {
    const sw = transform(readSrc('useClipboard', 'x.copy("a")'), { target: 'swift' }).code
    expect(sw).toContain('x.copy("a")')
    const kt = transform(readSrc('useBluetooth', 'x.scan()'), { target: 'kotlin' }).code
    expect(kt).toContain('x.scan()')
  })

  it('a non-zero-argument call of an accessorReads member is left alone', () => {
    const sw = transform(readSrc('useDeviceInfo', 'x.model(1)'), { target: 'swift' }).code
    expect(sw).toContain('x.model(1)')
  })
})

describe('service descriptors — callRead (a bare call of the container)', () => {
  it.each([
    ['useOnline', 'x()', 'x.isOnline', 'x.isOnline.value'],
    ['useAppState', 'x()', 'x.phase', 'x.phase.value'],
    ['useSafeArea', 'x().top', 'x.insets.top', 'x.insets.top'],
  ] as const)('%s: %s', (hook, expr, swift, kotlin) => {
    const sw = transform(readSrc(hook, expr), { target: 'swift' }).code
    expect(sw).toContain(swift)
    expect(sw).not.toMatch(/x\(\)/)
    const kt = transform(readSrc(hook, expr), { target: 'kotlin' }).code
    expect(kt).toContain(kotlin)
    expect(kt).not.toMatch(/\bx\(\)/)
  })

  it('an identifier that is NOT a service binding is untouched', () => {
    const out = transform(
      `import { signal } from '@pyreon/reactivity'
export function App() {
  const s = signal(1)
  return <Text>{String(s())}</Text>
}`,
      { target: 'kotlin' },
    ).code
    expect(out).not.toContain('.insets')
    expect(out).not.toContain('.isOnline')
  })

  it('the binding map is per-component: another component\'s service name does not leak', () => {
    const code = transform(
      `import { useSafeArea } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
export function A() {
  const s = useSafeArea()
  return <Text>{String(s().top)}</Text>
}
export function B() {
  const s = signal(1)
  return <Text>{String(s())}</Text>
}`,
      { target: 'swift' },
    ).code
    expect(code.match(/\.insets/g)?.length).toBe(1)
  })
})

describe('service descriptors — kotlinState (Compose MutableState members)', () => {
  /** [hook, members that read `.value` as a MEMBER on Kotlin, members that stay bare]. */
  const STATE: readonly (readonly [string, readonly string[], readonly string[]])[] = [
    ['useOnline', ['isOnline'], []],
    ['useAppState', ['phase', 'wasBackgrounded'], []],
    ['useCrashReporter', ['lastCrash', 'hadCrash'], []],
    ['useGeolocation', ['latitude', 'longitude', 'accuracy', 'isAuthorized', 'error'], ['isTracking']],
    ['usePush', ['token', 'lastNotification', 'notifications', 'isAuthorized', 'error'], []],
    ['usePayments', ['products', 'ownedProductIds', 'purchasing', 'error'], ['isReady']],
  ]
  for (const [hook, state, plain] of STATE) {
    it(`${hook}: state members read .value on Kotlin and bare on Swift`, () => {
      for (const m of state) {
        const kt = transform(readSrc(hook, `x.${m}`), { target: 'kotlin' }).code
        expect(kt, `${hook}.${m}`).toContain(`x.${m}.value`)
        const sw = transform(readSrc(hook, `x.${m}`), { target: 'swift' }).code
        expect(sw, `${hook}.${m}`).not.toContain(`x.${m}.value`)
      }
      for (const m of plain) {
        const kt = transform(readSrc(hook, `x.${m}`), { target: 'kotlin' }).code
        expect(kt, `${hook}.${m}`).not.toContain(`x.${m}.value`)
      }
    })
  }

  it('the CALL form of a state member drops its parens and reads .value (Kotlin only)', () => {
    const kt = transform(readSrc('useGeolocation', 'x.latitude()'), { target: 'kotlin' }).code
    expect(kt).toContain('x.latitude.value')
    expect(kt).not.toContain('x.latitude()')
  })
})

describe('service descriptors — lifecycle', () => {
  const swiftOf = (hook: string): string => transform(src(hook, 'x'), { target: 'swift' }).code

  it('start-stop services start on appear and stop on disappear', () => {
    for (const hook of ['useOnline', 'usePush', 'useAppState']) {
      const out = swiftOf(hook)
      expect(out, hook).toContain('.onAppear { x.start() }')
      expect(out, hook).toContain('.onDisappear { x.stop() }')
    }
  })

  it('a start-only service (crash reporter) never emits a stop', () => {
    const out = swiftOf('useCrashReporter')
    expect(out).toContain('.onAppear { x.start() }')
    expect(out).not.toContain('.onDisappear')
  })

  it('services without a lifecycle emit no modifier (geolocation / payments stay explicit)', () => {
    for (const hook of ['useGeolocation', 'usePayments', 'useClipboard', 'useDeviceMotion']) {
      expect(swiftOf(hook), hook).not.toContain('.onAppear')
    }
  })

  it('emits in SERVICES order, not declaration order, so modifier order is stable', () => {
    const out = transform(
      `import { useCrashReporter, useOnline } from '@pyreon/hooks'
export function App() {
  const crash = useCrashReporter()
  const net = useOnline()
  return <Text>hi</Text>
}`,
      { target: 'swift' },
    ).code
    expect(out.indexOf('net.start()')).toBeGreaterThan(-1)
    expect(out.indexOf('net.start()')).toBeLessThan(out.indexOf('crash.start()'))
  })

  it('every lifecycle service has a self-installing Kotlin factory (never the bare container)', () => {
    for (const s of SERVICES.filter((x) => x.lifecycle !== undefined)) {
      expect(
        s.kotlin.some((l) => /= rememberPyreon[A-Za-z]+\(\)/.test(l)),
        `${s.hook}: a lifecycle service must use rememberPyreon<Container>() — a bare remember { } ships frozen`,
      ).toBe(true)
    }
  })
})

describe('service descriptors — destructure + typing + parse', () => {
  it('destructure: services flagged `destructure` alias onto the container', () => {
    const out = transform(
      `import { useClipboard } from '@pyreon/hooks'
export function App() {
  const { copy } = useClipboard()
  return <Text>hi</Text>
}`,
      { target: 'swift' },
    )
    expect(out.warnings).toEqual([])
  })

  // A destructure-capable container is aliased as `__pyHook<N>`; every other
  // service falls to the generic destructure path (`__pyDestr<N>`). The flag is
  // what routes a hook onto the container path, so it is observable here.
  const destructured = (hook: string, target: 'swift' | 'kotlin'): string =>
    transform(
      `import { ${hook} } from '@pyreon/hooks'
import { Press, Text } from '@pyreon/primitives'
export function App() {
  const { start } = ${hook}()
  return <Press onPress={() => start()}><Text>hi</Text></Press>
}`,
      { target },
    ).code

  it.each(SERVICES.filter((s) => s.destructure === true).map((s) => s.hook))(
    '%s: a destructured binding aliases onto the container',
    (hook) => {
      for (const target of ['swift', 'kotlin'] as const) {
        const out = destructured(hook, target)
        expect(out, `${hook} (${target})`).toContain('__pyHook0')
        expect(out, `${hook} (${target})`).not.toContain('__pyDestr0')
      }
    },
  )

  it.each(SERVICES.filter((s) => s.destructure !== true).map((s) => s.hook))(
    '%s (not flagged): takes the generic destructure path',
    (hook) => {
      expect(destructured(hook, 'swift')).toContain('__pyDestr0')
    },
  )

  it('every `destructure` service is flagged; the rest are not (set derived from SERVICES)', () => {
    const flagged = SERVICES.filter((s) => s.destructure === true).map((s) => s.hook).sort()
    expect(flagged).toEqual(
      [
        'useAppState',
        'useClipboard',
        'useCrashReporter',
        'useGeolocation',
        'useOnline',
        'usePayments',
        'usePush',
      ].sort(),
    )
  })

  it('optionalFields type a member read as nullable (geolocation / push / payments)', () => {
    for (const [hook, member] of [
      ['useGeolocation', 'latitude'],
      ['usePush', 'error'],
      ['usePayments', 'purchasing'],
    ] as const) {
      expect(serviceFor(hook).optionalFields?.[member], `${hook}.${member}`).toBeDefined()
    }
    // The nullable typing is what makes the emit nil-aware: an optional number
    // interpolates through `.map { … } ?? ""` and a condition on an error
    // object lowers to a nil test (a bare truthiness check would not compile).
    const child = (hook: string, expr: string): string =>
      transform(
        `import { ${hook} } from '@pyreon/hooks'
export function App() {
  const x = ${hook}()
  return <Text>{${expr}}</Text>
}`,
        { target: 'swift' },
      ).code
    expect(child('useGeolocation', 'x.latitude')).toContain('(x.latitude).map {')
    expect(child('usePayments', 'x.purchasing')).toContain('(x.purchasing).map {')
    const push = transform(
      `import { usePush } from '@pyreon/hooks'
export function App() {
  const x = usePush()
  return <Text>{x.error ? 'bad' : 'ok'}</Text>
}`,
      { target: 'swift' },
    ).code
    expect(push).toContain('x.error != nil')
  })

  it('parses to the generic declaration', () => {
    const decls = parsePyreon(src('useOnline', 'net')).components.flatMap((c) => c.decls)
    expect(decls).toContainEqual({ kind: 'service', name: 'net', hook: 'useOnline' })
  })

  it('NATIVE_LOWERED_HOOKS is derived from SERVICES for these hooks', () => {
    for (const h of ['useOnline', 'useClipboard', 'usePush', 'useGeolocation', 'useSafeArea']) {
      expect(NATIVE_LOWERED_HOOKS.has(h), h).toBe(true)
    }
  })
})

describe('service descriptors — descriptor invariants (satellite fields)', () => {
  it('every accessorReads / kotlinState / callRead member is a plain identifier', () => {
    for (const s of SERVICES) {
      for (const m of [...(s.accessorReads ?? []), ...(s.kotlinState ?? []), ...(s.callRead ? [s.callRead] : [])]) {
        expect(m, `${s.hook}: ${m}`).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
      }
    }
  })

  it('kotlinState members used by accessorReads are a subset of accessorReads\' members', () => {
    // A service whose accessorReads name a MutableState member must list it in
    // kotlinState, and the reverse for call/accessor-bearing services (member
    // reads of non-accessor state, e.g. geolocation, stand on kotlinState alone).
    for (const s of SERVICES.filter((x) => x.accessorReads !== undefined)) {
      for (const m of s.kotlinState ?? []) {
        expect(s.accessorReads, `${s.hook}.${m}`).toContain(m)
      }
    }
  })

  it('a callRead container with MutableState lists the property in kotlinState', () => {
    expect(serviceFor('useOnline').kotlinState).toContain(serviceFor('useOnline').callRead)
    expect(serviceFor('useAppState').kotlinState).toContain(serviceFor('useAppState').callRead)
    expect(serviceFor('useSafeArea').kotlinState).toBeUndefined()
  })

  it('legacyKind is present and unique across descriptors', () => {
    const kinds = SERVICES.map((s) => s.legacyKind)
    expect(kinds.every((k) => /^[a-z-]+$/.test(k))).toBe(true)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('no two services read the same member differently on one hook (accessorReads unique)', () => {
    for (const s of SERVICES) {
      const reads = s.accessorReads ?? []
      expect(new Set(reads).size, s.hook).toBe(reads.length)
    }
  })
})

describe('service descriptors — module tag stays representation-independent', () => {
  it('a service decl hashes as its pre-descriptor kind (synthesized struct names do not churn)', () => {
    const parsed = parsePyreon(src('useOnline', 'net'))
    const legacy: ParseResult = {
      ...parsed,
      components: parsed.components.map((c) => ({
        ...c,
        decls: c.decls.map((d) =>
          d.kind === 'service' ? ({ kind: 'network-status', name: d.name } as never) : d,
        ),
      })),
    }
    expect(moduleTag(parsed)).toBe(moduleTag(legacy))
  })
})
