// How `@pyreon/kinetic` crosses to native: the `kinetic()` factory, as far as it can.
//
//   `const Box = kinetic('div').preset('fade')`   a WEB animation engine (CSS classes + rAF over a real CSSOM): neither target
//                                                 has one, so the BINDING never reaches the emit — a verbatim
//                                                 `private let Box = kinetic("div")…` calls a function that exists on neither
//                                                 target and fails the native build
//   `<Box>…</Box>`                                a chain WITH a preset that both targets know lowers to the canonical
//                                                 `<Transition show name>` (SwiftUI `.transition` / `.animation`, Compose
//                                                 `AnimatedVisibility`), driven by a mount flag that FLIPS (`<Transition
//                                                 show={true}>` compiles and never animates); a chain without one, or with a
//                                                 preset that has no native analogue, degrades to a plain container and says so
//
// The name is kept (not just skipped) because the binding is USED AS A JSX TAG. It is recorded by a PRE-PASS (`scanModule`),
// not a check inside the parse, because the tag rewrite must be in place wherever the component sits relative to the `const`:
// TS forces the const first for a value reference, but a hoisted `function` component can legally appear above it, and getting
// the order wrong would emit an unresolved tag for exactly one file layout.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  topLevelDeclarators,
  type CompilerPlugin,
  type DeclIR,
  type JsxElementIR,
  type ModuleScanner,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const KINETIC_PLUGIN_NAME = '@pyreon/kinetic'
const PRESETS_MODULE = '@pyreon/kinetic-presets'
const STATE_KEY = '@pyreon/kinetic:state'
/** Shared by the rewrite and the synthesis; internal, so `__`-prefixed. */
const MOUNT_FLAG = '__kineticIn'

interface KineticState {
  /** Local names bound to the `kinetic` import (supports `as` renaming). */
  readonly imports: Set<string>
  /** local name -> exported name, for presets imported from kinetic-presets. */
  readonly presetImports: Map<string, string>
  /** Factory bindings, mapped to the `.preset('x')` in their chain (undefined when the chain declares none). */
  readonly factories: Map<string, string | undefined>
}

const stateOf = (fileState: <T>(key: string, init: () => T) => T): KineticState =>
  fileState(STATE_KEY, () => ({ imports: new Set<string>(), presetImports: new Map<string, string>(), factories: new Map<string, string | undefined>() }))

/**
 * Map a `@pyreon/kinetic-presets` export name onto the native preset vocabulary, or undefined when it has no analogue.
 *
 * Only UNAMBIGUOUS names map. The pack ships 123 presets and native knows seven, so most of them (backInDown, blurScale,
 * bounceIn, flip*, rotate*, …) have nothing to lower to. Mapping those to the nearest fade would silently animate the
 * wrong thing, which is worse than declining by name — and the decline is what the author can act on. Diagonal and
 * magnitude variants (fadeDownLeft, slideUpBig) are deliberately NOT mapped: native has neither a diagonal nor a distance
 * parameter, so a mapping would drop half the intent without saying so.
 */
function nativePresetForPackName(name: string): string | undefined {
  const exact: Readonly<Record<string, string>> = {
    fade: 'fade',
    fadeUp: 'slide-up',
    fadeDown: 'slide-down',
    fadeLeft: 'slide-left',
    fadeRight: 'slide-right',
    slideUp: 'slide-up',
    slideDown: 'slide-down',
    slideLeft: 'slide-left',
    slideRight: 'slide-right',
    scaleIn: 'scale-in',
    scale: 'scale',
  }
  return exact[name]
}

/**
 * Walk a builder chain — `kinetic('div').preset('fade').duration(200)` — through every call and member, handing each
 * `.preset(arg)` argument to `visit`. The chain is a member chain of arbitrary depth and `.preset()` is rarely last.
 */
function visitPresetArgs(expr: AnyNode, visit: (arg: AnyNode) => string | undefined | 'continue'): string | undefined {
  let cur: AnyNode | undefined = expr
  while (cur) {
    if (cur.type === 'CallExpression') {
      const callee = cur.callee as AnyNode | undefined
      if (callee?.type === 'MemberExpression' && (callee.property?.name as string | undefined) === 'preset') {
        const arg = (cur.arguments as AnyNode[] | undefined)?.[0]
        const out = visit(arg)
        if (out !== 'continue') return out
      }
      cur = callee
      continue
    }
    if (cur.type === 'MemberExpression') {
      cur = cur.object as AnyNode | undefined
      continue
    }
    return undefined
  }
  return undefined
}

/** The native preset a chain names (a literal, or a mapped kinetic-presets import), if any. */
function presetOfChain(expr: AnyNode, state: KineticState): string | undefined {
  return visitPresetArgs(expr, (arg) => {
    if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value as string
    if (arg?.type === 'Identifier') {
      const exported = state.presetImports.get(arg.name as string)
      if (exported !== undefined) return nativePresetForPackName(exported)
    }
    return 'continue'
  })
}

/** The kinetic-presets export a chain names, when it maps to nothing native. */
function unmappedPackName(expr: AnyNode, state: KineticState): string | undefined {
  return visitPresetArgs(expr, (arg) => {
    if (arg?.type === 'Identifier') {
      const exported = state.presetImports.get(arg.name as string)
      if (exported !== undefined && nativePresetForPackName(exported) === undefined) return exported
    }
    return 'continue'
  })
}

/** Does this chain BOTTOM OUT in a call to the `kinetic` import? Matching the outermost callee would miss every chained form, which is the shape everyone writes. */
function basesOnKinetic(expr: AnyNode, state: KineticState): boolean {
  let cur: AnyNode | undefined = expr
  while (cur) {
    if (cur.type === 'CallExpression') {
      const callee = cur.callee as AnyNode | undefined
      const name = callee?.name as string | undefined
      if (typeof name === 'string') return state.imports.has(name)
      cur = callee
      continue
    }
    if (cur.type === 'MemberExpression') {
      cur = cur.object as AnyNode | undefined
      continue
    }
    return false
  }
  return false
}

const scanKinetic: ModuleScanner = (scan) => {
  const state = stateOf(scan.fileState)
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type !== 'ImportDeclaration') continue
    // Named presets from @pyreon/kinetic-presets are the DOCUMENTED way to use the factory (`kinetic('div').preset(fadeUp)`),
    // so an identifier argument has to resolve or the package's own example does not animate.
    if (node.source?.value === PRESETS_MODULE) {
      for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
        if (spec.type !== 'ImportSpecifier') continue
        const local = spec.local?.name
        const imported = spec.imported?.name
        if (typeof local === 'string' && typeof imported === 'string') state.presetImports.set(local, imported)
      }
      continue
    }
    if (node.source?.value !== KINETIC_PLUGIN_NAME) continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 'kinetic') {
        const local = spec.local?.name
        if (typeof local === 'string') state.imports.add(local)
      }
    }
  }
  if (state.imports.size === 0) return
  for (const node of scan.body as readonly AnyNode[]) {
    for (const d of topLevelDeclarators(node) as readonly AnyNode[]) {
      const name = d.id?.name as string | undefined
      const init = d.init as AnyNode | undefined
      if (typeof name !== 'string' || !init) continue
      if (!basesOnKinetic(init, state)) continue
      const preset = presetOfChain(init, state)
      state.factories.set(name, preset)
      if (preset !== undefined) continue // a preset LOWERS — see the tag rewrite
      // An UNMAPPED named preset is a different failure from "no preset at all", and blaming the factory for it sends the
      // author to the wrong place: the chain is right, that particular animation just has no native analogue.
      const packName = unmappedPackName(init, state)
      if (packName !== undefined) {
        scan.report(
          `\`${name}\`: the \`${packName}\` preset has no native analogue — iOS and Android know ` +
            `fade / scale / scale-in / slide-up|down|left|right, and mapping anything else to the ` +
            `nearest one would silently animate the WRONG thing. \`<${name}>\` renders as a plain ` +
            `container on iOS/Android. Pick a preset in that vocabulary to animate on all three.`,
        )
        continue
      }
      scan.report(
        `\`${name}\` is built by the \`kinetic()\` factory, which does not lower to native: it ` +
          `drives animation through CSS classes and rAF over a real CSSOM, and neither target has ` +
          `one. \`<${name}>\` renders as a plain container on iOS/Android — the layout and ` +
          `children are preserved, the animation is dropped. For an animation that DOES cross, use ` +
          `\`<Transition show name="fade">\` from \`@pyreon/primitives\`, whose preset vocabulary ` +
          `lowers to SwiftUI \`.transition\`/\`.animation\` and Compose \`AnimatedVisibility\`.`,
      )
    }
  }
  // The factory bindings are web-engine metadata: skipped for the same reason `createHttp()` metadata and `defineTheme()` are.
  // A statement is skipped only when EVERY declarator in it is a factory.
  scan.skipTopLevel((node) => {
    const decls = topLevelDeclarators(node as AnyNode) as readonly AnyNode[]
    return decls.length > 0 && decls.every((d) => typeof d.id?.name === 'string' && state.factories.has(d.id.name as string))
  })
}

/**
 * Synthesized, not hand-written: a signal that starts false and an on-mount that flips it. Both reuse paths already proven —
 * the on-mount harness even carries the SwiftUI stable-identity host that a `.task` / `.onAppear` needs, so the enter fires
 * once instead of thrashing per recomposition. Built per request: the parser and later passes own (and may edit) the IR.
 */
const mountSignal = (): DeclIR => ({ kind: 'signal', name: MOUNT_FLAG, type: { kind: 'boolean' }, initial: { kind: 'literal', value: false } })
const mountEffect = (): DeclIR => ({
  kind: 'on-mount',
  body: [{ kind: 'assign', target: { kind: 'identifier', name: MOUNT_FLAG }, op: '=', value: { kind: 'literal', value: true } }],
})

export const kineticPlugin: CompilerPlugin = Object.freeze({
  name: KINETIC_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: Object.freeze([KINETIC_PLUGIN_NAME, PRESETS_MODULE]),
  scanModule: scanKinetic,
  rewriteElement(el: JsxElementIR, ctx) {
    const state = stateOf(ctx.fileState)
    if (!state.factories.has(el.tag)) return undefined
    const preset = state.factories.get(el.tag)
    if (preset === undefined) {
      // No `.preset()` in the chain — there is no animation vocabulary to carry across, so this degrades to the plain container.
      return { kind: 'jsx-element', tag: 'Stack', attrs: el.attrs, children: el.children }
    }
    // A preset NAMES an animation both targets already know, so the box lowers to the same `<Transition>` path the primitive
    // uses — presets, durations and both emitters, all already verified. What it needs that a primitive does not is a TRIGGER:
    // `<Transition show={true}>` compiles and never animates (`.animation(value: true)` watches a constant), so the enter has
    // to be driven by a flag that FLIPS on mount. One flag per component: every box in it enters on the same mount.
    ctx.requestComponentDecls('mount-flag', { head: [mountSignal()], tail: [mountEffect()] })
    return {
      kind: 'jsx-element',
      tag: 'Transition',
      attrs: [
        { kind: 'attr', name: 'show', value: { kind: 'identifier', name: MOUNT_FLAG } },
        { kind: 'attr', name: 'name', value: { kind: 'literal', value: preset } },
        ...el.attrs,
      ],
      children: el.children,
    }
  },
})
