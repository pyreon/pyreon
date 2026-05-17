# @pyreon/cli

Developer tools for Pyreon — project doctor, context generation, and React pattern detection.

## Install

```bash
bun add -d @pyreon/cli
```

## Commands

### `pyreon doctor`

Project-wide health audit — runs every check Pyreon ships across 5 categories
(`correctness`, `performance`, `architecture`, `testing`, `documentation`) and
returns a unified 0-100 score with per-category breakdown.

```bash
pyreon doctor              # default: 8 fast gates, ~2-5s, scored output
pyreon doctor --full       # adds 2 slow gates (audit-types, bundle-budgets)
pyreon doctor --fix        # auto-fix what we can (lint + react-patterns)
pyreon doctor --json       # full DoctorReport as JSON
pyreon doctor --gha        # GitHub Actions annotation format
pyreon doctor --ci         # exit non-zero on error findings only
pyreon doctor --only lint,distribution         # ONLY these gates
pyreon doctor --skip pyreon-patterns           # exclude these gates
pyreon doctor --audit-min-risk high            # tighten test-environment audit
```

#### Gates

| Gate              | Category       | Speed | What it catches                                            |
| ----------------- | -------------- | ----- | ---------------------------------------------------------- |
| `react-patterns`  | correctness    | fast  | useState/useEffect/className/React imports (auto-fixable)  |
| `pyreon-patterns` | correctness    | fast  | Pyreon-specific anti-patterns (12 detector codes)          |
| `lint`            | varies         | fast  | All 66 `@pyreon/lint` rules                                |
| `distribution`    | architecture   | fast  | `sideEffects` field, source-map exclusion in published pkg |
| `doc-claims`      | documentation  | fast  | Numeric claims in docs match the source of truth           |
| `audit-tests`     | testing        | fast  | Mock-vnode test patterns (PR #197 bug class)               |
| `islands-audit`   | architecture   | fast  | Cross-file islands foot-guns (duplicate names, dead, ...)  |
| `ssg-audit`       | architecture   | fast  | `_404.tsx` placement, missing `getStaticPaths`, ...        |
| `audit-types`     | architecture   | slow  | Typed-but-unimplemented public-interface fields            |
| `bundle-budgets`  | performance    | slow  | Gzipped main-entry size > locked budget                    |

#### Score formula

- Per-finding penalty: `error=10, warning=3, info=1` points.
- Per-category subscore: `max(0, 100 - sum(penalties))` (saturates at 0).
- Overall score: mean of *included* category subscores (skipped categories drop out).
- Letter grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F otherwise.

#### Legacy flags (still work)

`--audit-tests`, `--check-islands`, `--check-ssg` are still accepted — they map
to `--only <gate>` shortcuts so existing CI scripts keep working.

#### What it detects and suggests

```tsx
// BEFORE: React patterns detected by doctor
import React from 'react'
import { useState, useEffect, useMemo, useCallback } from 'react'

function Counter() {
  const [count, setCount] = useState(0)
  const doubled = useMemo(() => count * 2, [count])

  useEffect(() => {
    document.title = `Count: ${count}`
  }, [count])

  const increment = useCallback(() => setCount((c) => c + 1), [])

  return (
    <div className="counter">
      <label htmlFor="display">Count</label>
      <span id="display">{doubled}</span>
      <button onClick={increment}>+1</button>
    </div>
  )
}
```

```tsx
// AFTER: Pyreon equivalents
import { signal, computed, effect } from '@pyreon/reactivity'

function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)

  effect(() => {
    document.title = `Count: ${count()}`
  })

  return (
    <div class="counter">
      <label for="display">Count</label>
      <span id="display">{doubled()}</span>
      <button onClick={() => count.update((c) => c + 1)}>+1</button>
    </div>
  )
}
```

#### Detection table

| React Pattern               | Pyreon Equivalent                  | Auto-fixable |
| --------------------------- | ---------------------------------- | ------------ |
| `import React from "react"` | `import { h } from "@pyreon/core"` | No           |
| `useState(initial)`         | `signal(initial)`                  | No           |
| `useEffect(fn, deps)`       | `effect(fn)`                       | No           |
| `useMemo(fn, deps)`         | `computed(fn)`                     | No           |
| `useCallback(fn, deps)`     | Use function directly              | No           |
| `className="..."`           | `class="..."`                      | Yes          |
| `htmlFor="..."`             | `for="..."`                        | Yes          |

#### CI integration

```yaml
# .github/workflows/ci.yml
- name: Pyreon Doctor
  run: bunx @pyreon/cli doctor --ci
```

#### JSON output format (`--json`)

```json
{
  "score": 92,
  "grade": "A",
  "categories": [
    { "category": "correctness",   "score": 87, "errors": 1, "warnings": 1, "infos": 0, "grade": "B", "included": true },
    { "category": "performance",   "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": true },
    { "category": "architecture",  "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": true },
    { "category": "testing",       "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": true },
    { "category": "documentation", "score": 100, "errors": 0, "warnings": 0, "infos": 0, "grade": "A", "included": true }
  ],
  "findings": [
    {
      "category": "correctness",
      "severity": "error",
      "code": "react-patterns/use-state-import",
      "gate": "react-patterns",
      "message": "useState imported from React. Use signal() from @pyreon/reactivity.",
      "location": { "path": "/abs/src/App.tsx", "relPath": "src/App.tsx", "line": 1, "column": 9 },
      "fix": "import { signal } from \"@pyreon/reactivity\""
    }
  ],
  "gates": [ /* one entry per gate, with meta.elapsedMs + meta.skipped */ ],
  "totals": { "errors": 1, "warnings": 1, "infos": 0 },
  "elapsedMs": 2300,
  "timestamp": "2026-05-14T12:00:00.000Z"
}
```

#### GitHub Actions annotations (`--gha`)

```text
::notice::pyreon doctor score: 92/100 (A) — 1 errors, 1 warnings, 0 info
::error title=react-patterns/use-state-import,file=src/App.tsx,line=1,col=9::useState imported from React. — import { signal } from "@pyreon/reactivity"
```

GitHub Actions parses these into inline PR annotations (clickable in the
"Files changed" tab).

### `pyreon context`

Generates project context for AI tools.

```bash
pyreon context                    # writes to .pyreon/context.json
pyreon context --out ./ai.json    # custom output path
```

#### Output example

```json
{
  "framework": "pyreon",
  "version": "0.5.0",
  "generatedAt": "2026-03-19T12:00:00.000Z",
  "routes": [
    { "path": "/", "name": "home", "params": [], "hasLoader": false, "hasGuard": false },
    {
      "path": "/users/:id",
      "name": "user",
      "params": ["id"],
      "hasLoader": true,
      "hasGuard": false
    },
    { "path": "/admin", "params": [], "hasLoader": false, "hasGuard": true }
  ],
  "components": [
    {
      "name": "UserCard",
      "file": "src/components/UserCard.tsx",
      "props": ["user", "showAvatar"],
      "hasSignals": true,
      "signalNames": ["isExpanded"]
    }
  ],
  "islands": [{ "name": "SearchBar", "file": "src/islands/SearchBar.tsx", "hydrate": "idle" }]
}
```

## Programmatic API

```ts
import { doctor, generateContext } from '@pyreon/cli'

// Run doctor programmatically
const errorCount = await doctor({ fix: false, json: false, ci: false, cwd: process.cwd() })

// Generate context
const result = generateContext({ cwd: process.cwd(), out: '.pyreon/context.json' })
```
