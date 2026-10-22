import {
  retagHostedWebView,
  type JsxElementIR,
  type RetagContext,
} from '@pyreon/native-compiler/plugin-api'

export { RICH_TEXT_HOST_FILENAME } from '../host-file'
import { RICH_TEXT_HOST_FILENAME } from '../host-file'

/**
 * `<RichTextWebView>` → `<WebView src data onMessage>`. Edits arrive as `c:<document JSON text>`, host failures as
 * `e:<message>` (see `buildRichTextHostHtml`, which posts them, and `retagHostedWebView`, which takes them apart on
 * both targets). The document is TEXT in both directions, so the lowered handler receives a plain string.
 */
export function retagRichTextWebView(el: JsxElementIR, ctx: RetagContext): JsxElementIR | undefined {
  return retagHostedWebView(el, ctx, {
    tag: 'RichTextWebView',
    hostFile: RICH_TEXT_HOST_FILENAME,
    editPrefix: 'c',
    engineProps: ['tiptapScript', 'tiptapSrc'],
    stateExample: "{ content: doc(), editable: true }",
  })
}
