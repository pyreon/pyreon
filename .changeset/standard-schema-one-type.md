---
'@pyreon/validation': minor
'@pyreon/validate': minor
'@pyreon/http': minor
'@pyreon/form': minor
---

The Standard Schema type is now defined once: `StandardSchemaV1` from the official, types-only `@standard-schema/spec` package (zero runtime code), which `@pyreon/validation` and `@pyreon/http` now depend on. `@pyreon/validation` and `@pyreon/validate` re-export it; the issue and result shapes are its namespace members, `StandardSchemaV1.Issue` and `StandardSchemaV1.Result<T>`.

Removed: `StandardSchemaShape`, `StandardSchemaLike`, `StandardSchemaIssue` and `StandardSchemaResult` from `@pyreon/validation`; `StandardSchemaIssue` and `StandardSchemaResult` from `@pyreon/validate` (including its `/mini` and `/v1` entries); `StandardSchemaShape` from `@pyreon/http`. `isStandardSchema` now narrows to `StandardSchemaV1`, and `standardSchemaToValidator` / `wrapStandardSchema` take it. `useForm({ schema })` and `@pyreon/http`'s `Validator<T>` accept `StandardSchemaV1<unknown, T>`, so a hand-written schema object must declare `version: 1` and `vendor` (zod, valibot, arktype and `@pyreon/validate`'s `s` already do). `ParseResult<T>` from `@pyreon/validate` is built from the spec result types and still reads `result.value` as `T | undefined` without narrowing.

Migration: import `StandardSchemaV1` (from `@pyreon/validation`, `@pyreon/validate` or `@standard-schema/spec`) instead of `StandardSchemaShape` / `StandardSchemaLike`, and write `StandardSchemaV1.Issue` / `StandardSchemaV1.Result<T>` instead of `StandardSchemaIssue` / `StandardSchemaResult`.
