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

## Status (PR 3)

What's here:

| File | Purpose |
|---|---|
| `src/Counter.tsx` | User-authored Pyreon source (placeholder content in PR 3) |
| `ios/App.swift` | `@main` SwiftUI app entry point |
| `ios/ContentView.swift` | Root view, bootstraps `Counter()` from `generated/` |
| `ios/Info.plist` | Standard iOS bundle metadata |
| `scripts/build.sh` | Drives the Pyreon → Swift compile loop |
| `package.json` | Workspace member, runs `build.sh` via `bun run build` |
| `.gitignore` | Generated outputs + Xcode artifacts not committed |

What's NOT here yet:

- **`.xcodeproj`** — Apple's project format is awkward to commit verbatim. PR 4 (or 3a follow-up) will either commit a generated `.pbxproj` or wire up [`xcodegen`](https://github.com/yonaskolb/XcodeGen) to produce it from a YAML spec. Until then, manual Xcode setup is documented below.
- **Counter implementation** — `src/Counter.tsx` is a placeholder. PR 4 lands the real `signal()` + button-driven increment + the end-to-end "tap button on simulator, count increments" validation.
- **iOS simulator CI** — running this on Apple's simulator infrastructure needs Apple-hardware CI. Tracked separately.

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

**Subset of Phase 0 success criterion 2** (signal → @State round-trip with counter on iOS simulator): everything UP TO the simulator-render step.

- Pyreon TSX source compiles cleanly via the CLI ✓
- Generated Swift file is structurally consumable by SwiftUI host code ✓
- Compile loop is automated (one command: `./scripts/build.sh`) ✓
- iOS simulator render (the actual rocketstyle moment) — Phase 0 PR 4 closes this

## Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.
