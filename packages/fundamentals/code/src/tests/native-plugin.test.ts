// The native lowering of `@pyreon/code` lives in this package, so its own suite exercises the plugin object and the
// retag. End-to-end behaviour (compiled by the real compiler, type-checked with swiftc and kotlinc, run on a device)
// is locked in `@pyreon/native-compiler`'s `native-code-webview.test.ts` and the native-tasks example.

import type { JsxElementIR, RetagContext } from '@pyreon/native-compiler/plugin-api'
import { describe, expect, it } from 'vitest'
import codeDefault, { codePlugin } from '../native-plugin'
import { codeWebViewLowering } from '../native-plugin/plugin'
import { CODE_HOST_FILENAME, retagCodeWebView } from '../native-plugin/lowering'

const warnings: string[] = []
const ctx: RetagContext = { warn: (m) => void warnings.push(m) }
const element = (attrs: JsxElementIR['attrs']): JsxElementIR => ({ kind: 'jsx-element', tag: 'CodeWebView', attrs, children: [] })

describe('@pyreon/code native plugin', () => {
  it('is one plugin object under the named and default export', () => {
    expect(codeDefault).toBe(codePlugin)
    expect(codePlugin.name).toBe('@pyreon/code')
    expect(codePlugin.modules).toEqual(['@pyreon/code'])
    expect(codePlugin.apiVersion).toBe(2)
    expect(codePlugin.webHosts).toBeTypeOf('function')
  })

  it('claims only CodeWebView, and says what to do about every other export', () => {
    expect(codeWebViewLowering.module).toBe('@pyreon/code')
    expect(codeWebViewLowering.tags).toEqual(['CodeWebView'])
    const spec = codePlugin.unlowered?.['@pyreon/code']
    expect(spec?.supported).toEqual(['CodeWebView'])
    expect(spec?.advice).toContain('`<CodeWebView>`')
  })

  it('retags to a <WebView> pointed at the conventionally named page', () => {
    warnings.length = 0
    const state: JsxElementIR['attrs'][number] = {
      kind: 'attr',
      name: 'state',
      value: { kind: 'arrow', params: [], paramTypes: [], body: { kind: 'object', fields: [] } } as never,
    }
    const out = retagCodeWebView(element([state]), ctx)
    expect(out?.tag).toBe('WebView')
    const src = out?.attrs.find((a) => a.kind === 'attr' && a.name === 'src')
    expect(src).toMatchObject({ value: { kind: 'literal', value: CODE_HOST_FILENAME } })
  })

  it('declines with a warning that names the fix when state is missing', () => {
    warnings.length = 0
    expect(retagCodeWebView(element([]), ctx)).toBeUndefined()
    expect(warnings.join('\n')).toContain('`state` is required on native')
  })
})
