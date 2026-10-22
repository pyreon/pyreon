// The native lowering of `@pyreon/head` lives in this package, so its own suite has to exercise it (the package
// ratchets coverage at 100%). The end-to-end behaviour (compiled through the real compiler, type-checked with swiftc
// and kotlinc) is locked in `@pyreon/native-compiler`'s `native-head-plugin.test.ts`; this pins the plugin's own shape.

import type { SwiftEmitContext, KotlinEmitContext, JsxElementIR } from '@pyreon/native-compiler/plugin-api'
import { describe, expect, it } from 'vitest'
import headDefault, { headPlugin } from '../native-plugin'
import { HEAD_PLUGIN_NAME, headPlugin as direct } from '../native-plugin/plugin'

const element = (children: JsxElementIR['children']): JsxElementIR => ({
  kind: 'jsx-element',
  tag: 'HeadProvider',
  attrs: [],
  children,
})

// Only what the lowering touches: indentation and child emission.
const ctxOf = <T>(): T =>
  ({
    indent: 0,
    pad: (n: number) => ' '.repeat(n),
    child: () => 'CHILD',
  }) as unknown as T

describe('@pyreon/head native plugin', () => {
  it('exposes one plugin object under both the named and default export', () => {
    expect(headDefault).toBe(headPlugin)
    expect(direct).toBe(headPlugin)
    expect(headPlugin.name).toBe(HEAD_PLUGIN_NAME)
    expect(headPlugin.modules).toEqual(['@pyreon/head'])
    expect(headPlugin.apiVersion).toBe(2)
  })

  it('claims useHead at statement position and emits nothing (null = claimed, nothing declared)', () => {
    const recognize = headPlugin.statementCalls?.useHead
    expect(recognize).toBeTypeOf('function')
    expect(recognize!({} as never, {} as never)).toBeNull()
  })

  it('declares which exports lower, so the rest of the package warns by name', () => {
    const spec = headPlugin.unlowered?.['@pyreon/head']
    expect(spec?.supported).toEqual(['useHead', 'HeadProvider'])
    expect(spec?.advice).toContain('no native equivalent')
  })

  describe('<HeadProvider> is transparent', () => {
    const lowering = headPlugin.elements![0]!
    const kids: JsxElementIR['children'] = [{ kind: 'text', value: 'x' }]

    it('claims exactly HeadProvider from @pyreon/head', () => {
      expect(lowering.module).toBe('@pyreon/head')
      expect(lowering.tags).toEqual(['HeadProvider'])
    })

    it('Swift: wraps children in a layout-neutral Group, or EmptyView when there are none', () => {
      expect(lowering.emit!.swift!(element(kids), ctxOf<SwiftEmitContext>())).toBe('Group {\n  CHILD\n}')
      expect(lowering.emit!.swift!(element([]), ctxOf<SwiftEmitContext>())).toBe('EmptyView()')
    })

    it('Kotlin: wraps children in a Column, or nothing when there are none', () => {
      expect(lowering.emit!.kotlin!(element(kids), ctxOf<KotlinEmitContext>())).toBe('Column {\n  CHILD\n}')
      expect(lowering.emit!.kotlin!(element([]), ctxOf<KotlinEmitContext>())).toBe('')
    })
  })
})
