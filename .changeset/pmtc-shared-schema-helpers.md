---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/lathe': patch
---

Schema-bearing native modules now compile TOGETHER. PMTC used to emit `PyreonSchemaError` (and `PyreonParseResult`) into every file that declared a schema, so two such files in one Xcode target or Gradle source set failed with `invalid redeclaration` / `Redeclaration` even though each compiled on its own. Both types now live in the native runtime (`PyreonSchema.swift` / `PyreonSchema.kt`) and are declared once. An app must link the updated `@pyreon/native-runtime-swift` / `-kotlin`; emitted code from this compiler no longer declares them.

`Pet.safeParse(value)` now lowers when `value` holds a typed struct or data class (a signal read, a variable, a call), and when a typed value sits inside an object-literal argument. It is converted through the value's own `Codable` / `@Serializable` encoding by the new runtime helpers `pyreonSchemaInput` / `pyreonSchemaValue`. Previously the whole-value form did not compile, and the nested form compiled but rejected valid data.

A schema's nested structs now follow a value/type rename: `PyreonZodSchema_BookValue_Author` instead of `PyreonZodSchema_Book_Author` beside `PyreonZodSchema_BookValue`.

New: `validateSwiftFilesWithStubs` / `validateKotlinFiles` compile several emitted files as one module, the only check that can see a collision between files. `@pyreon/lathe`'s verify uses them when present and reports the result as `report.modules`; a failure there makes the report `broken`.
