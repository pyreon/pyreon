# native-tasks-web — Tasks showcase on web

> **PRIVATE / EXPERIMENTAL.** Web sibling of the canonical [`native-tasks`](../native-tasks/) Gap 5 scaffold from #1449. Renders the SAME `TasksApp.tsx` source via Pyreon's `runtime-dom` + the `@pyreon/primitives` web implementations.

Closes the web half of the Gap 5 host-shells follow-up from the [2026-06-05 native-readiness audit](../../.claude/audits/native-readiness-2026-06-05.md). iOS XcodeGen + Android Gradle host shells remain follow-up PRs.

## Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source (single file)
                          │
                          ├─→ Web (THIS dir)         Vite + runtime-dom
                          ├─→ iOS (follow-up)        XcodeGen + SwiftUI
                          └─→ Android (follow-up)    Gradle + Compose
```

Mirror of `native-todomvc-web` (Pyreon's Phase E3 reference for the three-targets-one-source pattern).

## What this exercises (currently-merged Tier-1 features)

- **Routing with auth-gate** via `createRouter` + per-route `beforeEnter`
- **Multi-screen navigation** via `useNavigate()` across login / tasks / new-task
- **Canonical primitives** — `<Stack>` / `<Inline>` / `<Field>` / `<Button>` / `<Text>` / `<For>`
- **Signal-driven state** held in the App component (closure-captured for the auth-gate)

All features verified Tier-1 on web by the showcase's CI gates (#1449's `validate-swift.test.ts` fixture loop).

## Build + dev

```bash
cd examples/native-tasks-web
bun install      # workspace setup (one-time)
bun run dev      # http://localhost:5173/
bun run build    # production bundle in dist/
bun run preview  # preview the production bundle
```

The dev server reloads on source edits to `../native-tasks/src/TasksApp.tsx` via Vite's HMR. Same source, instant feedback.

## Dependency on #1449

This PR's `entry-client.tsx` imports from `../../native-tasks/src/TasksApp` — that directory lands in [#1449](https://github.com/pyreon/pyreon/pull/1449) (the canonical Gap 5 tasks scaffold). **This PR is sequenced AFTER #1449 merges.** Before #1449 lands the import fails with `Cannot find module '../../native-tasks/src/TasksApp'`.

When #1449 merges, this PR rebases cleanly (no source-level conflicts — different directories) and the import resolves to the real TasksApp.

## What's NOT in this PR

- **iOS XcodeGen host shell** for native-tasks-ios — follow-up PR using the same template as `native-router-demo-ios` + the SPM PyreonRouter dep
- **Android Gradle host shell** for native-tasks-android — follow-up PR using the same template as `native-router-demo-android` (#1455) + the source-set wiring for `@pyreon/native-router-kotlin`
- **e2e (Playwright)** for the web showcase — could mirror `e2e/native-todomvc-web.spec.ts` if that fixture exists; otherwise a new fixture for the auth-gate + create-task flows
- **CI integration via verify-modes matrix** — currently not gated; follow-up

## Audit status

Closes the web half of Gap 5's host-shells follow-up. iOS + Android host shells + e2e remain queued.
