// Entry — boots TasksApp into the #app element via @pyreon/runtime-dom.
//
// Gap 5 host shell (web). The canonical TasksApp source lives in
// `../../native-tasks/src/TasksApp.tsx` (introduced by #1449 — this
// PR depends on #1449 merging first to resolve the import path).
//
// Three targets share the same TasksApp.tsx:
//   - Web (this file) — Pyreon runtime-dom + @pyreon/primitives web impls
//   - iOS — examples/native-tasks-ios (deferred follow-up; xcodegen host)
//   - Android — examples/native-tasks-android (deferred follow-up; Gradle host)
//
// Same source-sharing pattern as `native-todomvc-web/src/entry-client.tsx`
// (which imports from `../../native-todomvc-ios/src/TodoApp`).

import { mount } from '@pyreon/runtime-dom'
import { TasksApp } from '../../native-tasks/src/TasksApp'

const root = document.getElementById('app')
if (root === null) {
  throw new Error('[native-tasks-web] #app element missing from index.html')
}

mount(TasksApp, root)
