---
'@pyreon/document': minor
---

Audit-gap release — silent-drop class closed structurally, injection fixes, and the typed-but-unimplemented surface resolved:

- **pptx `page-break` implemented** (was silently dropped in the one remaining paginated format): a `<PageBreak/>` starts a NEW slide. `discord` documents its `spacer` skip explicitly; orphan `list-item`s render as text in structural formats; the 9 renderers with no `default:` now dev-warn on unknown node types (a future NodeType can never silently drop).
- **Un-embeddable images emit their alt/caption as fallback text** in slack/discord/telegram/whatsapp/notion/confluence/teams/google-chat/pptx (was: silent vanish — a `createDocument().chart(...)` report posted to Slack lost its chart with zero signal).
- **NEW: the 18-primitive × 20-format completeness lock test** — one fixture with every primitive rendered through every format; every cell must be represented or explicitly allowlisted with a documented reason. This is the structural gate that makes the silent-drop class unshippable.
- **google-chat user text is now escaped** (a literal `<` corrupted the card — injection class); whatsapp/slack/teams escape their markup metachars in user text; **markdown nested lists indent correctly** (were malformed GFM).
- **PDF: documents containing a `<Code>` block no longer CRASH** (`Font 'Courier' is not defined` — since inception; Courier now aliases the bundled Roboto faces, and a real monospace font can be supplied via the new `RenderOptions.fonts`, which is now actually implemented). `RenderOptions.styles` + `DocNode.styles` (the connector-document rocketstyle pipeline) are wired into the HTML renderer as inline styles; pdf/docx document them as browser-preview-only.
- **docx works in browsers** (`Buffer.from` → portable base64 decode) and honors `direction: 'rtl'` (`<w:bidi/>`); email honors RTL too.
