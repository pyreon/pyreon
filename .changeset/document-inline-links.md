---
'@pyreon/document': minor
---

Inline links survive export (the audit's rich-text-runs gap, focused slice): an inline `<Link href>` inside a `<Text>` paragraph previously LOST its href in every `getTextContent`-flattening format. New `getInlineRuns`/`hasLinkRun` (exported) split text children into plain + link runs; wired into pdf (pdfmake `text:[…]` runs → real URI annotations), docx (`ExternalHyperlink`), slack (`<url|label>` mrkdwn), telegram (`<a href>`), whatsapp (`label (url)` — no link markup exists). Zero-link paragraphs keep the byte-identical old output (fast path). Inline bold/italic spans remain block-level — the full run model stays a tracked follow-up.
