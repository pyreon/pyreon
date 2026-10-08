import { describe, expect, it } from 'vitest'
import { createCompiler } from '../compiler'
import hooksPlugin from '../../../../fundamentals/hooks/src/native-plugin'
import { transform, validateSwiftWithStubs, validateKotlin } from './first-party-plugins'
const fixtures = [
  {
    name: 'hotkey',
    source: `import { useHotkey } from '@pyreon/hotkeys'; import { signal } from '@pyreon/reactivity'; export function App() { const n = signal(0); useHotkey('mod+s', () => n.set(1)); useHotkey('shift+enter', () => n.set(2)); return <Text>{String(n())}</Text> }`,
  },
  {
    name: 'state and timers',
    source: `import { signal } from '@pyreon/reactivity'; import { useCounter, useToggle, useInterval, useTimeout } from '@pyreon/hooks'; export function App() { const count = useCounter(0.25, { min: 0.25, max: 2 }); const open = useToggle(false); useInterval(() => count.inc(), 20); useTimeout(() => open.setTrue(), 50); return <Button onPress={() => { count.reset(); open.toggle() }}>{String(count.count())}</Button> }`,
  },
  {
    name: 'debounce and throttle',
    source: `import { signal } from '@pyreon/reactivity'; import { useDebouncedValue, useDebouncedCallback, useThrottledCallback } from '@pyreon/hooks'; export function App() { const value = signal(0); const view = useDebouncedValue(() => value(), 20); const submit = useDebouncedCallback((v: number) => value.set(v), 20); const track = useThrottledCallback((v: number) => value.set(v), 30); return <Button onPress={() => { submit(1); track(2); submit.cancel(); submit.flush(); track.cancel() }}>{String(view())}</Button> }`,
  },
  {
    name: 'environment reads',
    source: `import { useColorMode } from '@pyreon/core'; import { useColorScheme, useSizeClass } from '@pyreon/hooks'; export function App() { const mode = useColorMode(); const scheme = useColorScheme(); const size = useSizeClass(); return <Text>{mode + scheme + size}</Text> }`,
  },
  {
    name: 'router hooks',
    source: `import { useNavigate, useParams, useLoaderData } from '@pyreon/router'; interface User { name: string }; export function App() { const navigate = useNavigate(); const { id: userId, slug } = useParams(); const data = useLoaderData<User>(); return <Button onPress={() => navigate('/home')}>{userId + slug}</Button> }`,
  },
  {
    name: 'native module',
    source: `import { useNativeModule } from '@pyreon/primitives'; export function App() { const bridge = useNativeModule('ToyBridge'); return <Button onPress={() => bridge.ping()}>ping</Button> }`,
    swift: 'class ToyBridge { init() {}; func ping() {} }',
    kotlin: 'class ToyBridge(ctx: Context) { fun ping() {} }',
  },
]
describe.each(['swift', 'kotlin'] as const)('remaining owning plugins compile on %s', (target) => {
  it.each(fixtures)('$name', (fixture) => {
    const r = transform(fixture.source, { target, filename: 'App.tsx' })
    if (fixture.name === 'router hooks') expect(r.warnings).toHaveLength(1)
    else expect(r.warnings).toEqual([])
    const code = r.code + '\n' + (fixture[target] ?? '')
    const verdict = target === 'swift' ? validateSwiftWithStubs(code) : validateKotlin(code)
    expect(verdict.ok, verdict.error).toBe(true)
  })
})
it('timing and state hooks require their owning plugin for direct compiler calls', () => {
  const source = fixtures.find((f) => f.name === 'state and timers')!.source
  const bare = createCompiler().transform(source, { target: 'swift' })
  const owned = createCompiler({ plugins: [hooksPlugin] }).transform(source, { target: 'swift' })
  expect(bare.code).not.toContain('.task {')
  expect(owned.code).toContain('.task {')
  expect(owned.code).toContain('count =')
})
it('rate-limiter stubs are supplied only for package runtime symbols', () => {
  expect(hooksPlugin.stubs.swift?.('struct Plain {}')).toBe('')
  expect(hooksPlugin.stubs.kotlin?.('fun plain() {}')).toBe('')
  expect(hooksPlugin.stubs.swift?.('PyreonDebounced<Int>')).toContain(
    'public final class PyreonDebounced',
  )
  expect(hooksPlugin.stubs.kotlin?.('PyreonThrottled')).toContain('class PyreonThrottled')
})
