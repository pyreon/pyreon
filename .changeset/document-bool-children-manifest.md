---
'@pyreon/document': patch
---

JSX follow-ups: a `true` child in a document tree now renders nothing (JSX semantics) instead of the text "true"; `<Page header={<Text>…</Text>}>` / `footer` given as JSX are resolved (they were silently dropped by the PDF/DOCX renderers); `createDocument().add()` is typed to accept a JSX / `h()` tree (it already worked at runtime). Manifest/docs updated; the long example no longer uses a non-existent `<List items>` prop.
