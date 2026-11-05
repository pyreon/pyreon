// `assertPluginShape` is what the CLI runs on a package's native plugin BEFORE building a compiler, so a malformed
// plugin is rejected naming the field instead of failing later inside an emitter. Each case below is a field the
// existing plugin-shape specs did not exercise; each must throw with the field named.

import { describe, expect, it } from 'vitest'
import { NATIVE_COMPILER_PLUGIN_API_V2 } from '../plugin'
import { assertPluginShape } from '../plugin-shape'

const fn = (): null => null
const base = { name: '@acme/x', apiVersion: NATIVE_COMPILER_PLUGIN_API_V2 }
const decl = { swift: fn, kotlin: fn }

const cases: [string, Record<string, unknown>, RegExp][] = [
  ['element emit not an object', { elements: [{ module: 'm', tags: ['T'], emit: 1 }] }, /emit must be an object with swift and\/or kotlin functions/],
  ['element emit with a non-function target', { elements: [{ module: 'm', tags: ['T'], emit: { swift: 1 } }] }, /emit must be an object/],
  ['element aliasable not a boolean', { elements: [{ module: 'm', tags: ['T'], retag: fn, aliasable: 'yes' }] }, /aliasable must be a boolean/],
  ['element styleBase not a boolean', { elements: [{ module: 'm', tags: ['T'], retag: fn, styleBase: 1 }] }, /styleBase must be a boolean/],
  ['decl feature flag not a boolean', { decls: { d: { ...decl, lifecycleOnly: 'no' } } }, /decl "d" lifecycleOnly must be a boolean/],
  ['decl root not an object', { decls: { d: { ...decl, root: 1 } } }, /decl "d" root needs swift and\/or kotlin wrapper functions/],
  ['decl root with a non-function target', { decls: { d: { ...decl, root: { kotlin: 1 } } } }, /root needs swift and\/or kotlin wrapper functions/],
  ['decl rename not a function', { decls: { d: { ...decl, rename: 1 } } }, /decl "d" rename must be a function/],
  ['decl valueBinding missing a target', { decls: { d: { ...decl, valueBinding: { swift: fn } } } }, /valueBinding needs swift and kotlin functions/],
  ['decl earlyOrder with midOrder', { decls: { d: { ...decl, lifecycle: { earlyOrder: 1, midOrder: 2 } } } }, /earlyOrder must be finite and cannot coexist/],
  ['decl earlyOrder not finite', { decls: { d: { ...decl, lifecycle: { earlyOrder: Infinity } } } }, /earlyOrder must be finite/],
  ['memberCalls without decls', { memberCalls: { m: decl } }, /declares memberCalls but no decls/],
  ['receivers not an object', { receivers: [], decls: {} }, /receivers must be an object keyed by declaration type/],
  ['a receiver with no lowering', { receivers: { r: {} }, decls: {} }, /receiver "r" needs a swift and\/or kotlin lowering/],
  ['receivers without decls', { receivers: { r: { swift: fn } } }, /declares receivers but no decls/],
  ['functions not an object', { functions: 1 }, /functions must be an object keyed by name/],
  ['a function with no lowering', { functions: { f: {} } }, /function "f" needs a swift and\/or kotlin function/],
  ['identifiers not an object', { identifiers: [] }, /identifiers must be an object keyed by name/],
  ['an identifier with no lowering', { identifiers: { i: null } }, /identifier "i" needs a swift and\/or kotlin function/],
  ['memberReads with no lowering', { memberReads: {} }, /memberReads needs a swift and\/or kotlin function/],
  ['refModifiers with a non-function target', { refModifiers: { swift: 1 } }, /refModifiers must be an object with swift and\/or kotlin functions/],
  ['intrinsics not an array', { intrinsics: {} }, /intrinsics must be an array of intrinsic lowerings/],
  ['an intrinsic with no tags', { intrinsics: [{ tags: [], applies: fn, emit: {} }] }, /intrinsic lowering needs a nonempty tags array/],
  ['prepareEmit not a function', { prepareEmit: 1 }, /prepareEmit must be a synchronous function/],
  ['intrinsicAdvice blank', { intrinsicAdvice: '  ' }, /intrinsicAdvice must be a nonempty string/],
  ['propsTypes not an object', { propsTypes: [] }, /propsTypes must be an object keyed by type name/],
  ['a propsTypes entry with no resolve', { propsTypes: { P: {} } }, /propsTypes "P" needs a resolve function/],
  ['items not an object', { items: 1 }, /items must be an object keyed by type/],
  ['items typing not an object of functions', { items: { t: { swift: fn, kotlin: fn, typing: { fields: 1 } } } }, /items\.t\.typing must be an object with fields\/scopes\/type functions/],
  ['methodCalls not an object', { methodCalls: [] }, /methodCalls must be an object keyed by method name/],
  ['a methodCalls entry not a function', { methodCalls: { m: 1 } }, /methodCalls\.m must be a synchronous function/],
  ['persistence missing a target', { persistence: { swift: fn } }, /persistence needs swift and kotlin functions/],
  ['tier2Calls with an empty name', { tier2Calls: [''] }, /tier2Calls must be an array of callee names/],
  ['declConstructs not a function', { declConstructs: 1 }, /declConstructs must be a synchronous function/],
  ['declCalls not a function', { declCalls: 1 }, /declCalls must be a synchronous function/],
  ['rewriteElement not a function', { rewriteElement: 1 }, /rewriteElement must be a synchronous function/],
  ['callExprs not a function', { callExprs: 1 }, /callExprs must be a synchronous function/],
  ['requires with a blank entry', { requires: [' '] }, /requires must be an array of nonempty strings/],
  ['builtIn not a boolean', { builtIn: 'yes' }, /builtIn must be a boolean/],
  ['transformIR not a function', { transformIR: 1 }, /transformIR must be a synchronous function/],
  ['backends not an array', { backends: {} }, /backends must be an array/],
]

describe('assertPluginShape names the malformed field', () => {
  for (const [what, extra, msg] of cases) {
    it(what, () => {
      expect(() => assertPluginShape({ ...base, ...extra })).toThrow(msg)
    })
  }

  it('a non-object plugin, a blank name, and an unsupported API version are refused', () => {
    expect(() => assertPluginShape(null)).toThrow(/must be an object/)
    expect(() => assertPluginShape({ ...base, name: ' ' })).toThrow(/needs a nonempty name/)
    expect(() => assertPluginShape({ ...base, apiVersion: 999 })).toThrow(/requires API 999/)
  })

  it('the well-formed counterparts pass', () => {
    expect(() =>
      assertPluginShape({
        ...base,
        elements: [{ module: 'm', tags: ['T'], emit: { swift: fn }, aliasable: true, styleBase: false }],
        decls: { d: { ...decl, lifecycleOnly: true, root: { swift: fn }, rename: fn, valueBinding: decl, lifecycle: { earlyOrder: 1 } } },
        memberCalls: { m: decl },
        receivers: { r: { kotlin: fn } },
        functions: { f: { swift: fn } },
        identifiers: { i: { kotlin: fn } },
        memberReads: { swift: fn },
        refModifiers: { kotlin: fn },
        methodCalls: { m: fn },
        persistence: decl,
        tier2Calls: ['x'],
        builtIn: true,
      }),
    ).not.toThrow()
  })
})
