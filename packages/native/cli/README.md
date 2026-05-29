# @pyreon/native-cli

> **PRIVATE / EXPERIMENTAL.** Build CLI orchestration for the Pyreon Multi-Target Compiler (PMTC). Phase 0 scaffold per [`native-platforms-phase0-roadmap.md`](../../../.claude/plans/native-platforms-phase0-roadmap.md) PR 2.

Wraps [`@pyreon/native-compiler`](../compiler/README.md) in a thin CLI that walks a directory of `.tsx` files and emits per-target native code.

## Usage

```bash
# Compile Pyreon TSX to Swift / SwiftUI
pyreon-native build --target=ios --source=./src --out=./generated

# Compile to Kotlin / Jetpack Compose
pyreon-native build --target=android --source=./src --out=./generated
```

Output files mirror the source structure:

```
src/
├── Counter.tsx
└── Card.tsx

generated/  (target=ios)
├── Counter.swift
└── Card.swift
```

Each emitted file carries a source-map directive (Swift `#sourceLocation`, Kotlin `// pyreon-source:` comment) so downstream debug tooling can trace back to the original Pyreon source.

## Programmatic API

```ts
import { build } from '@pyreon/native-cli'

const result = build({
  target: 'swift',
  source: './src',
  out: './generated',
})
console.log(`compiled ${result.filesCompiled} files`)
```

The programmatic surface is used by tests + the future Xcode build-phase wrapper (roadmap PR 3).

## Phase 0 scope

| Feature                                              | Status       |
| ---------------------------------------------------- | ------------ |
| Walk source dir for `.tsx` files (skip `.test.tsx`)  | Done         |
| Per-target file extension mapping (`.swift` / `.kt`) | Done         |
| Source-map directives in output                      | Done         |
| Aggregated warnings                                  | Done         |
| File-watching / hot reload                           | Phase 3      |
| Incremental compilation                              | Phase 1+     |
| Xcode build-phase integration                        | Roadmap PR 3 |

## Exit codes

| Code | Meaning                                                |
| ---- | ------------------------------------------------------ |
| 0    | Build succeeded                                        |
| 1    | Argv / usage error                                     |
| 2    | Build error (compiler threw, source dir missing, etc.) |

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
