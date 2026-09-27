# native-tasks-web — Tasks showcase on web

> **PRIVATE / EXPERIMENTAL.** Web sibling of the canonical [`native-tasks`](../native-tasks/) Gap 5 scaffold. Renders the SAME `TasksApp.tsx` source via Pyreon's `runtime-dom` + the `@pyreon/primitives` web implementations.

## Architecture

```text
examples/native-tasks/src/TasksApp.tsx     ← canonical source (single file)
                          │
                          ├─→ Web (THIS dir)                  Vite + runtime-dom
                          ├─→ iOS (native-tasks-ios)          XcodeGen + SwiftUI
                          └─→ Android (native-tasks-android)  Gradle + Compose
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

## Status

`entry-client.tsx` imports from `../../native-tasks/src/TasksApp`, which has
landed, and both sibling hosts have landed too:
[`native-tasks-ios`](../native-tasks-ios) (XcodeGen + XCUITest, CI-wired) and
[`native-tasks-android`](../native-tasks-android) (Gradle + Espresso,
CI-wired).

## What's still NOT in this PR

- **e2e (Playwright)** for the web showcase — could mirror `e2e/native-todomvc-web.spec.ts` if that fixture exists; otherwise a new fixture for the auth-gate + create-task flows
- **CI integration via verify-modes matrix** — currently not gated; follow-up

## Audit status

Closes the web half of Gap 5's host-shells follow-up.
