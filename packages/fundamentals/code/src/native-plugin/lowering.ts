import {
  retagHostedWebView,
  type JsxElementIR,
  type RetagContext,
} from '@pyreon/native-compiler/plugin-api'

export { CODE_HOST_FILENAME } from '../host-file'
import { CODE_HOST_FILENAME } from '../host-file'

/**
 * `<CodeWebView>` → `<WebView src data onMessage>`. Edits arrive as `v:<text>`, host failures as `e:<message>`
 * (see `buildCodeHostHtml`, which posts them, and `retagHostedWebView`, which takes them apart on both targets).
 */
export function retagCodeWebView(el: JsxElementIR, ctx: RetagContext): JsxElementIR | undefined {
  return retagHostedWebView(el, ctx, {
    tag: 'CodeWebView',
    hostFile: CODE_HOST_FILENAME,
    editPrefix: 'v',
    engineProps: ['codemirrorScript', 'codemirrorSrc'],
    stateExample: "{ value: text(), language: 'typescript' }",
  })
}
