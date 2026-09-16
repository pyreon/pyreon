---
'@pyreon/lathe': patch
---

Close the remaining spec-string injection surfaces in the emitters.

A regex literal is emitted from two places, not one. `mockPath` escaped regex
metacharacters and no line terminator, so a spec path carrying `\n`, `\r`,
U+2028 or U+2029 emitted an unterminated literal and took the whole `mocks.ts`
module with it, under the default config. Both sites now spell the literal
through one escape-aware `regexLiteral`.

On a docs page: a parameter name went raw into a Markdown table cell (a `|`
splits the row, a newline ends it), a control character went raw into a
double-quoted YAML scalar (js-yaml refuses the whole document on NUL/BEL/ESC,
so the page was unreadable to `gray-matter`), and a query wire name plus an
enum value went raw into the fenced TypeScript usage snippet a reader copies.

One generated file changes: a parameterised mock route's `/` inside a character
class is now escaped (`[^\/?#]`), which matches the same URLs as before.
