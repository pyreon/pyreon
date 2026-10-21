---
"@pyreon/compiler": patch
---

Update the native (Rust) compiler backend to oxc 0.154 and napi 3.14. oxc renamed `ParserReturn::panicked` to `fatal_error` (same meaning: the parser terminated early), so both parse-failure guards now read the new field.
