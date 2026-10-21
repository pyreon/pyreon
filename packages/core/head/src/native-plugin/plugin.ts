// How `@pyreon/head` crosses to native: it does not describe anything there, by design.
//
// Head management exists to write into a DOCUMENT's `<head>` — the title bar, social-preview meta, stylesheets,
// scripts, speculation rules. A native app has no document and no `<head>`, and none of those tags has an
// iOS / Android counterpart the compiler could target. What an author wants from shared source is that the call
// they wrote for the web does not break the native build, so:
//
//   useHead(...)       is claimed and lowers to NOTHING (its argument is not evaluated — head input is data
//                      describing tags, with no effect the app can observe natively);
//   <HeadProvider>     is transparent: it only injects the head context `useHead` writes into, which has no native
//                      reader, so its children render in place.
//
// The remaining exports (`createHeadContext`, `HeadContext`, and the `/ssr` collection helpers) are server-render
// plumbing for the document and keep their by-name warning — a native app has no server-rendered document either.

import type { CompilerPlugin, ElementLowering } from '@pyreon/native-compiler/plugin-api'

export const HEAD_PLUGIN_NAME = '@pyreon/head'

/** `<HeadProvider>` renders its children untouched: the context it provides has no native consumer. */
const headElements: readonly ElementLowering[] = [
  {
    module: '@pyreon/head',
    tags: ['HeadProvider'],
    emit: {
      swift(el, ctx) {
        if (el.children.length === 0) return 'EmptyView()'
        const pad = ctx.pad(ctx.indent + 2)
        const content = el.children.map((c) => pad + ctx.child(c, ctx.indent + 2)).join('\n')
        return `Group {\n${content}\n${ctx.pad(ctx.indent)}}`
      },
      kotlin(el, ctx) {
        if (el.children.length === 0) return ''
        const pad = ctx.pad(ctx.indent + 2)
        const content = el.children.map((c) => pad + ctx.child(c, ctx.indent + 2)).join('\n')
        return `Column {\n${content}\n${ctx.pad(ctx.indent)}}`
      },
    },
  },
]

/**
 * The `@pyreon/head` native plugin. Shipped by `@pyreon/head` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const headPlugin: CompilerPlugin = {
  name: HEAD_PLUGIN_NAME,
  apiVersion: 2,
  modules: ['@pyreon/head'],
  // `null` claims the call without declaring anything: the statement is consumed and nothing is emitted, which is the
  // lowering — the alternative (declining) would re-emit `useHead(...)` verbatim and fail to compile on both targets.
  statementCalls: { useHead: () => null },
  decls: {},
  elements: headElements,
  unlowered: {
    '@pyreon/head': {
      supported: ['useHead', 'HeadProvider'],
      advice:
        'document `<head>` plumbing (the head context and the server-rendering helpers) has no native equivalent — a native app has no document. `useHead(...)` and `<HeadProvider>` compile (as no-ops) so shared source builds; keep anything else behind a `<Web>` escape hatch',
    },
  },
}
