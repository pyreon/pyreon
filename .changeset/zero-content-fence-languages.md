---
'@pyreon/zero-content': patch
---

Highlight Swift and Kotlin code fences (#4257). The default highlighter languages now also include `swift`, `kotlin`, `xml`, `svelte`, `vue`, `nginx`, `ini` and `dockerfile`. `highlighter.langs` now adds to the default set instead of replacing it, so listing `'rust'` no longer turns off `tsx`. A fence whose language is not loaded still renders as plain text, but the build now prints one `[Pyreon]` warning per language, saying to add it to `highlighter.langs`. `text`, `txt`, `plaintext` and fences with no language do not warn.
