# @pyreon/cli

Developer tools for Pyreon — project doctor, context generation, and React pattern detection.

## Install

```bash
bun add -d @pyreon/cli
```

## Commands

### `pyreon doctor`

Scans your project for React patterns and auto-fixes them to Pyreon equivalents.

```bash
pyreon doctor              # human-readable output
pyreon doctor --fix        # auto-fix safe transforms
pyreon doctor --json       # structured JSON output for AI tools
pyreon doctor --ci         # exit code 1 on any error (for CI)

# Test-environment audit (mock-vnode patterns — the PR #197 bug class)
pyreon doctor --audit-tests                     # appends test-audit with minRisk=medium
pyreon doctor --audit-tests --audit-min-risk high  # only HIGH-risk files
pyreon doctor --json --audit-tests              # audit emitted as a second JSON blob
```

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

#### JSON output format

```json
{
  "passed": false,
  "files": [
    {
      "file": "src/App.tsx",
      "diagnostics": [
        {
          "code": "react-import",
          "line": 1,
          "message": "React import detected",
          "current": "import React from \"react\"",
          "suggested": "import { h } from \"@pyreon/core\"",
          "fixable": false
        }
      ],
      "fixed": false
    }
  ],
  "summary": {
    "filesScanned": 12,
    "filesWithIssues": 1,
    "totalErrors": 1,
    "totalFixable": 0,
    "totalFixed": 0
  }
}
```

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
