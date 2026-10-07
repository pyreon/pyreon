import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import type { TargetLanguage } from '../types'

/**
 * Hook BINDING resolution (hook-binding.ts). Every recognizer matched a hook
 * by its bare callee name; a same-named user function, a foreign import and an
 * aliased import were all misclassified. The marker of a LOWERED `useOnline`
 * is the runtime container `PyreonNetworkStatus` on both targets.
 */
const TARGETS: readonly TargetLanguage[] = ['swift', 'kotlin']
const LOWERED = 'PyreonNetworkStatus'

const body = `export function App() {
  const net = useOnline()
  return <Text>{net.isOnline ? 'on' : 'off'}</Text>
}
`
const prim = `import { Text } from '@pyreon/primitives'\n`

function compile(source: string, target: TargetLanguage) {
  return transform(source, { target, filename: 'hook-binding.tsx' })
}

describe.each(TARGETS)('hook binding resolution (%s)', (target) => {
  it('lowers a hook imported from @pyreon/hooks', () => {
    const r = compile(`import { useOnline } from '@pyreon/hooks'\n${prim}${body}`, target)
    expect(r.code).toContain(LOWERED)
    expect(r.warnings).toEqual([])
  })

  it('still lowers a hook with no import at all (snippet back-compat)', () => {
    const r = compile(`${prim}${body}`, target)
    expect(r.code).toContain(LOWERED)
  })

  it('does NOT lower a same-named function the user declared', () => {
    const r = compile(`${prim}function useOnline() { return { isOnline: true } }\n${body}`, target)
    expect(r.code).not.toContain(LOWERED)
  })

  it('does NOT lower a same-named hook imported from a non-@pyreon module, and says why', () => {
    const r = compile(`import { useOnline } from './my-hooks'\n${prim}${body}`, target)
    expect(r.code).not.toContain(LOWERED)
    expect(r.warnings.some((w) => w.includes('`useOnline` is imported from `./my-hooks`'))).toBe(true)
  })

  it('does NOT lower a different export aliased to a hook name', () => {
    const r = compile(`import { useSomethingElse as useOnline } from '@pyreon/hooks'\n${prim}${body}`, target)
    expect(r.code).not.toContain(LOWERED)
    expect(r.warnings.some((w) => w.includes('not as the `useOnline` hook'))).toBe(true)
  })

  it('lowers an ALIASED framework hook (it used to be dropped with no warning)', () => {
    const r = compile(
      `import { useOnline as useNet } from '@pyreon/hooks'\n${prim}export function App() {\n  const net = useNet()\n  return <Text>{net.isOnline ? 'on' : 'off'}</Text>\n}\n`,
      target,
    )
    expect(r.code).toContain(LOWERED)
    expect(r.warnings).toEqual([])
  })

  it('leaves property and member names alone (only bindings are renamed)', () => {
    const r = compile(
      `import { useOnline } from '@pyreon/hooks'\n${prim}const table = { useOnline: 1 }\nexport function App() {\n  const net = useOnline()\n  return <Text>{net.isOnline ? 'on' : 'off'}</Text>\n}\n`,
      target,
    )
    expect(r.code).toContain(LOWERED)
  })

  it('keeps the user function callable under its own (renamed) name instead of the framework container', () => {
    const r = compile(
      `${prim}function useOnline() { return 1 }\nexport function App() {\n  const a = useOnline()\n  return <Text>{a}</Text>\n}\n`,
      target,
    )
    expect(r.code).toContain('useOnline_')
    expect(r.code).not.toContain(LOWERED)
  })
})
