---
'@pyreon/rich-text': patch
---

`bindRichTextToSignal({ format: 'html' })` bound before the editor mounts no longer wipes the outside signal. The signal's HTML is loaded into the editor (through `editor.setContent`, which works before mount) instead of being skipped and then overwritten by the empty editor's HTML. As in JSON mode, the outside value wins at bind time, and an outside HTML load no longer adds an undo step.
