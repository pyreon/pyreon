---
'@pyreon/head': patch
'@pyreon/runtime-server': patch
'@pyreon/document': patch
---

Faster HTML/XML escaping. The head, runtime-server and document (`escapeXml`) escapers now use a native regex search to find the first character that needs escaping, then run their character loop only from there. `@pyreon/head` used to walk every character of every title and attribute value. On Node 26 / Bun 1.4 that measured 2.8× / 1.8× faster for short clean strings, about 15× / 9× faster for long ones, and 1.36× / 1.28× faster for strings that do need escaping. In the head benchmark, serializing 20 meta tags went from 8.6–9.3 µs to 7.4–7.5 µs. Output is unchanged; new tests check all three escapers against a reference across 5,000 generated strings each.
