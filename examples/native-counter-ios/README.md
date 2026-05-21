# native-counter-ios — first PMTC iOS example

> **PRIVATE / EXPERIMENTAL.** Phase 0 roadmap PR 3 scaffold; see [`native-platforms-phase0-roadmap.md`](../../.claude/plans/native-platforms-phase0-roadmap.md). The counter implementation itself lands in PR 4.

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

## Status (PR 4 — Counter implementation + verified compile loop)

What's here:

| File | Purpose |
|---|---|
| `src/Counter.tsx` | User-authored Pyreon source — **real counter** with `signal()`, label "Count: N", and Increment button |
| `ios/App.swift` | `@main` SwiftUI app entry point |
| `ios/ContentView.swift` | Root view, bootstraps `Counter()` from `generated/` |
| `ios/Info.plist` | Standard iOS bundle metadata |
| `scripts/build.sh` | Drives the Pyreon → Swift compile loop |
| `package.json` | Workspace member, runs `build.sh` via `bun run build` |
| `.gitignore` | Generated outputs + Xcode artifacts not committed |

What's NOT here yet:

- **`.xcodeproj`** — Apple's project format is awkward to commit verbatim. A PR 4a follow-up will either commit a generated `.pbxproj` or wire up [`xcodegen`](https://github.com/yonaskolb/XcodeGen) to produce it from a YAML spec. Until then, manual Xcode setup is documented below.
- **iOS simulator CI** — running this on Apple's simulator infrastructure needs Apple-hardware CI runners. Tracked separately.

## What the counter does

`src/Counter.tsx`:

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

Compiles to `generated/Counter.swift`:

```swift
#sourceLocation(file: "…/Counter.tsx", line: 1)
struct Counter: View {
  @State private var count: Int = 0
  var body: some View {
    VStack {
      Text("Count: \(count)")
      Button("Increment") { count = count + 1 }
    }
  }
}
```

The emitted Swift is byte-for-byte indistinguishable from idiomatic SwiftUI written by hand. `swiftc -parse generated/Counter.swift` accepts it cleanly (verified).

## Run the compile loop now

```bash
# From this directory
./scripts/build.sh
```

Output: `generated/Counter.swift` carrying the SwiftUI translation of `src/Counter.tsx`. Verify with:

```bash
cat generated/Counter.swift
```

## Open in Xcode (manual setup until PR 3a)

1. Run `./scripts/build.sh` first to produce `generated/Counter.swift`.
2. Open Xcode → File → New → Project → iOS App.
3. Save the new Xcode project at the parent directory level (NOT inside `examples/native-counter-ios/`).
4. Delete the auto-generated `ContentView.swift` from Xcode's new project.
5. Drag the following files into the Xcode project:
   - `ios/App.swift`
   - `ios/ContentView.swift`
   - `ios/Info.plist`
   - `generated/Counter.swift`
6. Build target → iPhone simulator → Run.

This manual flow is the Phase 0 floor. PR 3a or PR 4 automates it via xcodegen.

## Why no .xcodeproj in this PR

Apple's `.xcodeproj` format is a directory of XML/binary files with file-path references that break if you move directories. Committing one verbatim works but is fragile. The alternatives (xcodegen, Tuist, hand-crafted `.pbxproj`) are all viable but each adds dependencies / tooling that deserve their own PR.

For PR 3, the directory structure + source files + build script are the "useful subset" — the compile loop already works (just `./scripts/build.sh`); only the Xcode integration is manual. PR 3a follows up with the automated Xcode generation.

## What this PR proves

**Most of Phase 0 success criterion 2** (signal → @State round-trip with counter on iOS simulator):

- Pyreon TSX compiles cleanly via the CLI ✓
- The generated Swift file passes `swiftc -parse` ✓
- Output uses real SwiftUI primitives: `@State`, `VStack`, `Text(...)`, `Button(...) { ... }` — idiomatic SwiftUI ✓
- Increment semantics: `count.set(count() + 1)` becomes `count = count + 1` (SwiftUI's `@State` IS the assignment target) ✓
- Compile is automated (one command) ✓
- **Final manual step**: open the manually-set-up Xcode project + tap the button on simulator. Documented below. PR 4a automates the Xcode setup.

## Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.
