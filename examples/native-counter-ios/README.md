# native-counter-ios — first PMTC iOS example

> **PRIVATE / EXPERIMENTAL.** Minimal PMTC counter example for iOS.

This example demonstrates the full PMTC compile loop for iOS:

```
src/Counter.tsx          (user-authored Pyreon JSX)
        │
        │ scripts/build.sh
        │   → bun packages/native/cli/src/cli.ts build --target=ios ...
        ▼
generated/Counter.swift  (compiler-emitted SwiftUI)
        │
        │ Xcode (host project)
        ▼
ios/App.swift + ios/ContentView.swift  consumes the generated symbol
```

## Status

What's here:

| File | Purpose |
|---|---|
| `src/Counter.tsx` | User-authored Pyreon source — started as a minimal counter (PR 4); has since grown into a shared multi-feature device-proof fixture (see the note below) |
| `ios/App.swift` | `@main` SwiftUI app entry point |
| `ios/ContentView.swift` | Root view, bootstraps `Counter()` from `generated/` |
| `ios/Info.plist` | Standard iOS bundle metadata |
| `scripts/build.sh` | Drives the Pyreon → Swift compile loop |
| `scripts/xcode-setup.sh` | Compiles the source + regenerates `PyreonCounter.xcodeproj` via xcodegen |
| `project.yml` | xcodegen spec — the source of truth for the generated `.xcodeproj` |
| `package.json` | Workspace member, runs `build.sh` via `bun run build` |
| `.gitignore` | Generated outputs + Xcode artifacts not committed |

`.xcodeproj` generation (originally tracked as a "PR 4a follow-up" below) has
since landed — it's driven by `xcodegen` + the committed `project.yml`, not
committed directly (see "Open in Xcode" below for why). iOS simulator CI
against real Apple-hardware runners is still tracked separately.

## What the counter does

:::note
This section originally described `src/Counter.tsx` as it was in PR 4 (PMTC
Phase 0) — a minimal ~12-line counter. That file is now a **583-line shared
device-proof fixture**: the PMTC team consolidated dozens of feature proofs
(flow diagrams, animations, biometrics, i18n plurals, notifications, haptics,
geolocation, rocketstyle dimension resolution, and more) into this one
source rather than standing up a separate Xcode/Gradle project per feature.
The counter proof is still IN there — `const count = signal<number>(0)`,
a `<Text>Count: {count}</Text>`, and an `Increment` button that calls
`count.set(count() + 1)` — it's just one slice of a much bigger tree now.
The canonical vocabulary has also moved on: current source uses
`@pyreon/primitives`' `Stack`/`Button onPress` (not the `VStack`/`onClick`
shown in the old snippet below), and every file header comment explains what
each proof demonstrates. Read `src/Counter.tsx` directly for the current,
accurate source rather than trusting a frozen excerpt here.
:::

The historical (PR 4) shape, kept for context on what "Phase 0 success
criterion 2" originally verified:

```tsx
import { signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal<number>(0)
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Button onClick={() => count.set(count() + 1)}>Increment</Button>
    </VStack>
  )
}
```

Which compiled to a `generated/Counter.swift` byte-for-byte indistinguishable
from idiomatic hand-written SwiftUI. That claim still holds for the CURRENT,
much larger source — `swiftc -parse` accepting the generated output cleanly
is the same CI-verified guarantee, just over more surface area now.

## Run the compile loop now

```bash
# From this directory
./scripts/build.sh
```

Output: `generated/Counter.swift` carrying the SwiftUI translation of `src/Counter.tsx`. Verify with:

```bash
cat generated/Counter.swift
```

## Open in Xcode (automated via xcodegen)

One-time prerequisite: install [xcodegen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
```

Then from this directory:

```bash
./scripts/xcode-setup.sh   # compiles src/*.tsx + generates PyreonCounter.xcodeproj
open PyreonCounter.xcodeproj
```

`PyreonCounter.xcodeproj` is generated deterministically from [`project.yml`](./project.yml) — gitignored, regenerated on demand. The project carries a pre-build script that re-runs `./scripts/build.sh` on every Xcode build, so edits to `src/Counter.tsx` are picked up automatically the next time you hit ⌘+B.

### Why xcodegen vs. committing the .xcodeproj directly

Apple's `.xcodeproj` is a directory of XML/plist files with full file paths baked in. Three issues:

1. **Moving directories breaks references** — committed `.xcodeproj`s rot when the surrounding tree changes.
2. **Different machines produce different orderings** in the binary `.pbxproj`, so diffs are noisy even when nothing meaningful changed.
3. **No single source of truth** — the `.pbxproj` IS the authoritative file but it's not human-friendly to edit.

xcodegen sidesteps all three: the YAML spec IS the source of truth; the `.xcodeproj` regenerates deterministically. Same convention used by [Vapor](https://github.com/vapor/vapor), [SwiftLint](https://github.com/realm/SwiftLint), and many other Apple-platform projects.

### Manual setup (if you can't install xcodegen)

If xcodegen isn't an option:

1. Run `./scripts/build.sh` to produce `generated/Counter.swift`.
2. Open Xcode → File → New → Project → iOS App.
3. Save the new Xcode project at the parent directory level (NOT inside `examples/native-counter-ios/`).
4. Delete the auto-generated `ContentView.swift` from Xcode's new project.
5. Drag `ios/App.swift`, `ios/ContentView.swift`, `ios/Info.plist`, and `generated/Counter.swift` into the Xcode project.
6. Build target → iPhone simulator → Run.

## What this example proves

**Phase 0 success criterion 2** (signal → @State round-trip with counter on iOS simulator):

- Pyreon TSX compiles cleanly via the CLI ✓
- The generated Swift file passes `swiftc -parse` ✓
- Output uses real SwiftUI primitives: `@State`, `VStack`/`Stack`, `Text(...)`, `Button(...) { ... }` — idiomatic SwiftUI ✓
- Increment semantics: `count.set(count() + 1)` becomes `count = count + 1` (SwiftUI's `@State` IS the assignment target) ✓
- Compile is automated (one command) ✓
- Xcode project is automated (xcodegen + project.yml) ✓
- **Final user step**: `open PyreonCounter.xcodeproj`, build, tap the button on simulator.

## Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.
