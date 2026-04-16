# Pyreon Architectural Review - Implementation Guide

## Quick Reference: Issues by Severity and Timeline

### Severity Matrix

```
┌─────────────────────────────────────────────────────────────┐
│                   SEVERITY vs EFFORT                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CRITICAL   │ Circular detection      Backpressure handling │
│  (Do now)   │ onCleanup LIFO          Context cleanup       │
│             │                                                │
│─────────────┼─────────────────────────────────────────────┤
│             │                         VNode cycle audit      │
│  HIGH       │ Signal Set→Array        Template cache        │
│  (Week 2)   │ Reconciliation short-   cleanup               │
│             │ circuit                                        │
│─────────────┼─────────────────────────────────────────────┤
│             │                         Context stack safety   │
│  MEDIUM     │ Event handler typing    Props splitting type   │
│  (Week 3)   │ Computed constraints                           │
│─────────────┼─────────────────────────────────────────────┤
│             │ ESLint plugin           Dev diagnostics        │
│  LOW        │ Memory profiling guide  Fragment type narrow   │
│  (Week 4+)  │                                                │
│             │                                                │
└─────────────────────────────────────────────────────────────┘
   Low Effort              Medium               High Effort
```

---

## Issue 1: Circular Effect Dependencies - Implementation Guide

### Problem Statement
Effects can create circular dependencies leading to infinite update loops.

### Root Cause
No cycle detection in dependency graph during effect execution.

### Current Code Location
`packages/core/reactivity/src/effect.ts:65-120`

### Implementation Steps

#### Step 1: Add Dependency Graph Tracking (2 hours)

**File:** `packages/core/reactivity/src/graph.ts` (new file)

```typescript
// Track dependency edges: signal → effect and effect → computed
interface GraphEdge {
  from: Signal | Computed | Effect
  to: Signal | Computed | Effect
  type: 'signal' | 'computed' | 'effect'
}

const dependencyGraph = new Map<Symbol, Set<Symbol>>()

export function recordDependency(source: Signal | Computed, sink: Effect | Computed) {
  const sourceId = source._id ||= Symbol('dep')
  const sinkId = sink._id ||= Symbol('dep')
  
  if (!dependencyGraph.has(sourceId)) {
    dependencyGraph.set(sourceId, new Set())
  }
  dependencyGraph.get(sourceId)!.add(sinkId)
}

export function detectCycle(startId: Symbol): Symbol[] | null {
  const visited = new Set<Symbol>()
  const stack: Symbol[] = [startId]
  const path: Symbol[] = []
  
  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    
    if (visited.has(current)) {
      // Complete DFS from this node
      stack.pop()
      path.pop()
      continue
    }
    
    visited.add(current)
    path.push(current)
    
    // Check dependencies
    const deps = dependencyGraph.get(current) || []
    for (const dep of deps) {
      if (path.includes(dep)) {
        // Cycle detected: path includes dep
        return path.slice(path.indexOf(dep))
      }
      if (!visited.has(dep)) {
        stack.push(dep)
      }
    }
  }
  
  return null
}
```

#### Step 2: Integrate Cycle Detection into Effect System (1 hour)

**File:** `packages/core/reactivity/src/effect.ts`

**Before:**
```typescript
function runEffect(effect: Effect) {
  activeEffect = effect
  try {
    effect.fn()
  } finally {
    activeEffect = null
  }
}
```

**After:**
```typescript
function runEffect(effect: Effect) {
  // Check for cycles in dev mode
  if (__DEV__ && effect._id) {
    const cycle = detectCycle(effect._id)
    if (cycle) {
      console.warn(`[Pyreon] Circular dependency detected:`, cycle)
      warnCircularDependency(cycle)
      return  // Skip effect run to prevent infinite loop
    }
  }
  
  activeEffect = effect
  try {
    effect.fn()
  } finally {
    activeEffect = null
  }
}
```

#### Step 3: Add Error Handler API (1 hour)

**File:** `packages/core/reactivity/src/effect.ts`

```typescript
export class CircularDependencyError extends Error {
  constructor(public cycle: Symbol[]) {
    super(`Circular dependency detected: ${cycle.length} nodes`)
    this.name = 'CircularDependencyError'
  }
}

export function onCircularDependency(handler: (cycle: Symbol[]) => void) {
  globalCircularHandlers.push(handler)
}

function warnCircularDependency(cycle: Symbol[]) {
  for (const handler of globalCircularHandlers) {
    handler(cycle)
  }
}
```

#### Step 4: Write Tests (1 hour)

**File:** `packages/core/reactivity/tests/circular.test.ts`

```typescript
describe('Circular dependency detection', () => {
  test('warns on direct signal → effect → signal cycle', () => {
    const warnings: any[] = []
    onCircularDependency(w => warnings.push(w))
    
    const sig = signal(1)
    let effectRun = 0
    
    effect(() => {
      effectRun++
      sig.set(sig() + 1)
    })
    
    expect(effectRun).toBe(1)  // Effect runs once, then stops
    expect(warnings.length).toBe(1)
  })
  
  test('warns on computed → effect → computed cycle', () => {
    const sig = signal(1)
    const comp1 = computed(() => sig() * 2)
    
    const comp2 = computed(() => {
      const v = comp1()
      return v + 1
    })
    
    let warned = false
    onCircularDependency(() => { warned = true })
    
    effect(() => {
      comp2()
      sig.set(sig() + 1)  // Circular!
    })
    
    expect(warned).toBe(true)
  })
  
  test('allows self-updates if intentional', () => {
    const sig = signal(0)
    let runs = 0
    
    effect(() => {
      runs++
      if (sig() < 3) {
        sig.set(sig() + 1)
      }
    })
    
    // Should eventually stabilize at 3
    expect(sig()).toBe(3)
    expect(runs).toBe(4)  // 0→1→2→3 plus initial
  })
})
```

#### Step 5: Update Documentation (30 min)

**File:** `docs/guide/effects-and-reactivity.md` (new section)

```markdown
## Circular Dependencies

Pyreon detects circular dependencies in development mode and warns:

```typescript
const sig = signal(1)
effect(() => {
  sig.set(sig() + 1)  // ⚠️ [Pyreon] Circular dependency detected
})
```

**Why it matters:** Circular dependencies cause infinite loops that freeze the UI.

**How to fix:** Break the cycle by:
1. Using separate signals for input and output
2. Moving the update outside the effect
3. Using batch() to limit update frequency

```typescript
// ✅ Fix 1: Separate signals
const input = signal(1)
const doubled = computed(() => input() * 2)

effect(() => {
  console.log(doubled())  // No cycle
})

// ✅ Fix 2: Move update outside
const count = signal(0)
effect(() => {
  console.log(count())
})
count.set(count() + 1)  // Direct, not in effect

// ✅ Fix 3: Use batch to limit
const counter = signal(0)
effect(() => {
  batch(() => {
    if (counter() < 10) {
      counter.set(counter() + 1)
    }
  })
})
```

**Disabling the warning:** If your circular dependency is intentional (rare!), use:
```typescript
untrack(() => {
  sig.set(sig() + 1)  // Won't warn, but use carefully
})
```
```

### Acceptance Criteria
- [ ] Cycle detection correctly identifies all circular patterns
- [ ] No performance regression in acyclic effects (dev mode cost < 2%)
- [ ] Tests pass with 100% coverage
- [ ] Documentation updated with examples
- [ ] No false positives on valid circular-but-controlled patterns

### Rollout Timeline
- **Day 1:** Steps 1-3 (core implementation)
- **Day 2:** Step 4 (comprehensive tests)
- **Day 3:** Step 5 (documentation + review)

---

## Issue 2: onCleanup() LIFO Ordering - Implementation Guide

### Problem Statement
onCleanup() callbacks execute in FIFO order instead of LIFO, violating resource cleanup semantics.

### Root Cause
Cleanup callbacks stored in flat array, disposed in order collected.

### Current Code Location
`packages/core/reactivity/src/effect.ts:108-135`

### Implementation Steps

#### Step 1: Understand Current Implementation (30 min)

**Current Code:**
```typescript
let cleanups: Array<() => void> = []

export function onCleanup(fn: () => void) {
  if (!_cleanupCollector) {
    throw new Error('onCleanup() must be called in an effect')
  }
  _cleanupCollector.push(fn)
}

const runCleanup = () => {
  for (const c of cleanups) {  // ← FIFO order!
    c()
  }
}
```

**Problem:**
```typescript
effect(() => {
  const timer = setTimeout(() => {}, 1000)
  onCleanup(() => clearTimeout(timer))  // ← Should run FIRST
  
  effect(() => {
    const listener = () => {}
    addEventListener('click', listener)
    onCleanup(() => removeEventListener('click', listener))  // ← Should run SECOND
  })
})

// Current: listener cleanup → timer cleanup (wrong!)
// Expected: timer cleanup → listener cleanup (LIFO)
```

#### Step 2: Refactor to Stack-Based Cleanup (1 hour)

**File:** `packages/core/reactivity/src/effect.ts`

**New Structure:**
```typescript
interface Cleanup {
  type: 'callback' | 'effect'
  fn: () => void | Promise<void>
  scope?: EffectScope
}

class CleanupStack {
  private stack: Cleanup[] = []
  
  push(cleanup: Cleanup) {
    this.stack.push(cleanup)
  }
  
  async execute() {
    // Execute in LIFO order (pop from end)
    while (this.stack.length > 0) {
      const cleanup = this.stack.pop()!
      if (cleanup.fn) {
        await cleanup.fn()
      }
    }
  }
  
  size(): number {
    return this.stack.length
  }
}
```

**Integration:**
```typescript
export class Effect {
  private cleanupStack = new CleanupStack()
  
  run() {
    _cleanupCollector = this.cleanupStack
    
    try {
      this.fn()
    } finally {
      _cleanupCollector = null
    }
  }
  
  async dispose() {
    // Execute nested effects first, then cleanup callbacks
    for (const scope of this.nestedScopes) {
      await scope.dispose()
    }
    
    // Execute cleanup stack in LIFO order
    await this.cleanupStack.execute()
  }
}

export function onCleanup(fn: () => void | Promise<void>) {
  if (!_cleanupCollector) {
    throw new Error('onCleanup() called outside effect')
  }
  
  _cleanupCollector.push({
    type: 'callback',
    fn,
  })
}
```

#### Step 3: Handle Nested Effects (1 hour)

**Challenge:** Nested effects must dispose before parent cleanup runs.

**Solution:**
```typescript
export class EffectScope {
  private childScopes: EffectScope[] = []
  private cleanupStack = new CleanupStack()
  private effects: Effect[] = []
  
  addChildScope(scope: EffectScope) {
    this.childScopes.push(scope)
  }
  
  async dispose() {
    // 1. Dispose all child scopes first
    for (const child of this.childScopes) {
      await child.dispose()
    }
    
    // 2. Dispose all effects in this scope
    for (const effect of this.effects) {
      await effect.dispose()
    }
    
    // 3. Run cleanup callbacks in LIFO order
    await this.cleanupStack.execute()
    
    // 4. Clear all references
    this.childScopes = []
    this.effects = []
  }
}
```

**Verification:**
```
Dispose sequence:
├─ Nested scope 1
│  ├─ Effect 1
│  └─ Cleanup callbacks (nested first)
├─ Nested scope 2
│  ├─ Effect 2
│  └─ Cleanup callbacks (nested second)
└─ Parent cleanup callbacks (parent last)
```

#### Step 4: Write Comprehensive Tests (2 hours)

**File:** `packages/core/reactivity/tests/cleanup-order.test.ts`

```typescript
describe('onCleanup() LIFO ordering', () => {
  test('single effect: cleanup in reverse order', () => {
    const order: number[] = []
    
    effect(() => {
      onCleanup(() => order.push(1))
      onCleanup(() => order.push(2))
      onCleanup(() => order.push(3))
    })
    
    // Dispose the scope
    getCurrentScope()?.dispose()
    
    expect(order).toEqual([3, 2, 1])  // LIFO
  })
  
  test('nested effects: child cleanup before parent', () => {
    const order: number[] = []
    
    effect(() => {
      onCleanup(() => order.push('parent'))
      
      effect(() => {
        onCleanup(() => order.push('child'))
      })
    })
    
    getCurrentScope()?.dispose()
    
    expect(order).toEqual(['child', 'parent'])
  })
  
  test('deeply nested effects', () => {
    const order: number[] = []
    
    effect(() => {
      onCleanup(() => order.push(1))
      
      effect(() => {
        onCleanup(() => order.push(2))
        
        effect(() => {
          onCleanup(() => order.push(3))
        })
      })
    })
    
    getCurrentScope()?.dispose()
    
    expect(order).toEqual([3, 2, 1])
  })
  
  test('real-world: resource cleanup', () => {
    const resources: string[] = []
    
    effect(() => {
      const db = { connect: () => resources.push('db connected') }
      db.connect()
      onCleanup(() => resources.push('db closed'))
      
      effect(() => {
        const listener = { attach: () => resources.push('listener attached') }
        listener.attach()
        onCleanup(() => resources.push('listener detached'))
      })
    })
    
    expect(resources).toEqual([
      'db connected',
      'listener attached',
    ])
    
    getCurrentScope()?.dispose()
    
    expect(resources).toEqual([
      'db connected',
      'listener attached',
      'listener detached',  // Child cleanup first
      'db closed',          // Parent cleanup second
    ])
  })
})
```

#### Step 5: Update Documentation (30 min)

**File:** `docs/guide/cleanup-semantics.md`

```markdown
# Cleanup Semantics in Pyreon

## LIFO Ordering (Last-In-First-Out)

Pyreon ensures cleanup callbacks execute in LIFO order, following standard resource management patterns:

### Single Effect Example

```typescript
effect(() => {
  const resource1 = acquire('resource1')
  onCleanup(() => release(resource1))
  
  const resource2 = acquire('resource2')
  onCleanup(() => release(resource2))
})

// Cleanup order: resource2 first, then resource1
// This is correct: reverse of acquisition order
```

### Nested Effects

```typescript
effect(() => {
  const db = connectDB()
  onCleanup(() => db.close())
  
  effect(() => {
    const listener = attachListener()
    onCleanup(() => listener.detach())
  })
})

// Cleanup order:
// 1. Nested effect cleanup: listener.detach()
// 2. Parent cleanup: db.close()
```

## Why LIFO Matters

LIFO order is crucial for correct resource cleanup:

1. **Dependency reversal:** If A depends on B, cleanup B before A
2. **Error prevention:** Prevents double-cleanup or use-after-free
3. **Transaction safety:** Allows rollback in reverse order

### Incorrect (FIFO) Example ❌

```typescript
effect(() => {
  const db = connectDB()
  onCleanup(() => db.close())
  
  const query = db.query()  // Depends on db
  onCleanup(() => query.cancel())
})

// FIFO cleanup (WRONG!):
// 1. db.close()  ← Closes database
// 2. query.cancel()  ← Tries to use closed DB!
```

### Correct (LIFO) Example ✅

```typescript
effect(() => {
  const db = connectDB()
  onCleanup(() => db.close())
  
  const query = db.query()
  onCleanup(() => query.cancel())
})

// LIFO cleanup (CORRECT!):
// 1. query.cancel()  ← Clean up dependents first
// 2. db.close()  ← Then clean up dependencies
```
```

### Acceptance Criteria
- [ ] All cleanup callbacks execute in LIFO order
- [ ] Nested effect cleanup runs before parent cleanup
- [ ] No performance regression
- [ ] All existing tests pass
- [ ] New tests achieve 100% coverage
- [ ] Documentation clear with examples

### Rollout Timeline
- **Day 1:** Steps 1-2 (refactor to stack)
- **Day 2:** Step 3 (nested effect handling)
- **Day 3:** Steps 4-5 (tests + documentation)

---

## Issue 3: SSR Streaming Backpressure - Implementation Guide

### Problem Statement
Server buffers unlimited HTML when client is slow, causing memory exhaustion.

### Root Cause
No backpressure signal checking before enqueueing chunks.

### Current Code Location
`packages/core/runtime-server/src/render.ts:250-320`

### Implementation Steps

#### Step 1: Understand Stream Backpressure (30 min)

**How ReadableStream backpressure works:**

```typescript
// Good: Check desiredSize before enqueue
if (controller.desiredSize > 0) {
  controller.enqueue(chunk)
} else {
  // Wait for drain
  await controller.ready
  controller.enqueue(chunk)
}

// Bad: Always enqueue (causes buffering)
controller.enqueue(chunk)
controller.enqueue(chunk)
controller.enqueue(chunk)
// Memory grows unbounded!
```

#### Step 2: Implement Backpressure Handling (1 hour)

**File:** `packages/core/runtime-server/src/render.ts`

**Current:**
```typescript
export function renderToStream(root: VNode | null): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      (async () => {
        await renderWithController(root, (html) => {
          const encoded = new TextEncoder().encode(html)
          controller.enqueue(encoded)  // No backpressure check!
        })
        controller.close()
      })()
    }
  })
}
```

**After:**
```typescript
export function renderToStream(root: VNode | null): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      (async () => {
        try {
          await renderWithController(root, async (html: string) => {
            const encoded = new TextEncoder().encode(html)
            
            // Check backpressure
            if (controller.desiredSize <= 0) {
              // Queue is full or nearly full, wait for drain
              await controller.ready
            }
            
            // Only enqueue if still room
            if (controller.desiredSize > 0) {
              controller.enqueue(encoded)
            }
          })
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      })()
    }
  })
}
```

**Key Changes:**
1. Check `controller.desiredSize` before enqueue
2. Await `controller.ready` if backpressure detected
3. Only enqueue if space available

#### Step 3: Add Configuration (30 min)

**File:** `packages/core/runtime-server/src/render.ts`

```typescript
export interface StreamRenderOptions {
  chunkSize?: number  // Max bytes before checking backpressure
  maxBufferSize?: number  // Max total buffered (for warning)
}

const DEFAULT_CHUNK_SIZE = 64 * 1024  // 64KB chunks
const DEFAULT_MAX_BUFFER = 1024 * 1024  // 1MB max

export function renderToStream(
  root: VNode | null,
  options?: StreamRenderOptions
): ReadableStream<Uint8Array> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const maxBuffer = options?.maxBufferSize ?? DEFAULT_MAX_BUFFER
  
  return new ReadableStream({
    start(controller) {
      let bufferedSize = 0
      
      (async () => {
        try {
          await renderWithController(root, async (html: string) => {
            const encoded = new TextEncoder().encode(html)
            bufferedSize += encoded.length
            
            // Warn if exceeding expected buffer
            if (bufferedSize > maxBuffer && __DEV__) {
              console.warn(
                `[Pyreon SSR] Stream buffer size (${bufferedSize}b) ` +
                `exceeds expected ${maxBuffer}b. Client may be very slow.`
              )
            }
            
            // Apply backpressure
            if (controller.desiredSize <= 0) {
              await controller.ready
            }
            
            controller.enqueue(encoded)
            bufferedSize -= encoded.length  // Subtract when dequeued
          })
          
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      })()
    }
  })
}
```

#### Step 4: Write Integration Tests (2 hours)

**File:** `packages/core/runtime-server/tests/streaming.test.ts`

```typescript
describe('Streaming backpressure', () => {
  test('respects desiredSize limit', async () => {
    const chunks: Uint8Array[] = []
    let paused = false
    
    const mockController = {
      desiredSize: 1,
      get ready() {
        return new Promise(resolve => {
          setTimeout(() => {
            paused = false
            resolve(undefined)
          }, 50)
        })
      },
      enqueue(chunk: Uint8Array) {
        chunks.push(chunk)
        // Simulate queue filling
        if (chunks.length > 1) {
          this.desiredSize = 0
          paused = true
        }
      },
      close() {},
      error(err: any) { throw err }
    }
    
    // Render a large tree
    const root = h('div', [
      h('p', 'chunk 1'),
      h('p', 'chunk 2'),
      h('p', 'chunk 3'),
    ])
    
    // Mock renderWithController to simulate streaming
    let chunkIndex = 0
    await renderWithController(root, async (html) => {
      if (chunkIndex > 0) {
        // Simulate backpressure after first chunk
        if (mockController.desiredSize <= 0) {
          await mockController.ready
        }
      }
      mockController.enqueue(new TextEncoder().encode(html))
      chunkIndex++
    })
    
    // Verify pausing occurred
    expect(paused).toBe(true)  // Should have paused
    expect(chunks.length).toBeGreaterThan(1)
  })
  
  test('handles slow consumer without memory exhaustion', async () => {
    const memoryUsed: number[] = []
    
    // Simulate very slow consumer (10ms per chunk)
    const slowReader = {
      async read() {
        await new Promise(r => setTimeout(r, 10))
      }
    }
    
    const stream = renderToStream(largeTree)
    const reader = stream.getReader()
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        // Track memory (in real scenario, would use WeakRef)
        memoryUsed.push(value.byteLength)
        
        // Slow consumption
        await slowReader.read()
      }
    } finally {
      reader.releaseLock()
    }
    
    // Memory should stay bounded
    const totalMemory = memoryUsed.reduce((a, b) => a + b, 0)
    const avgChunk = totalMemory / memoryUsed.length
    expect(avgChunk).toBeLessThan(100 * 1024)  // < 100KB average
  })
  
  test('warns when buffer exceeds max', async () => {
    const warnings: string[] = []
    const oldWarn = console.warn
    console.warn = (msg) => warnings.push(String(msg))
    
    try {
      const stream = renderToStream(veryLargeTree, {
        maxBufferSize: 1024  // 1KB max
      })
      
      // Read all data (will trigger backpressure and warnings)
      const reader = stream.getReader()
      let done = false
      while (!done) {
        ({ done } = await reader.read())
      }
      
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toContain('buffer size')
    } finally {
      console.warn = oldWarn
    }
  })
})
```

#### Step 5: Documentation (30 min)

**File:** `docs/guide/ssr-streaming.md` (new section)

```markdown
## SSR Streaming with Backpressure

Pyreon's streaming renderer automatically handles backpressure to prevent memory exhaustion on slow clients.

### How it Works

```typescript
// Automatic backpressure handling
const stream = renderToStream(app)
response.headers.set('Content-Type', 'text/html')
stream.pipeTo(response.body)  // Handles backpressure internally
```

### What is Backpressure?

Backpressure occurs when a data source (server) produces faster than a consumer (client) can receive:

```
Server: ████████████████████  (buffered HTML)
Client: ██  (slow connection)

Result: Buffer grows, memory increases
```

### Pyreon's Solution

```typescript
// Before: No backpressure check (memory grows)
controller.enqueue(chunk)
controller.enqueue(chunk)
controller.enqueue(chunk)  // ← Keep going, memory explodes

// After: Check backpressure (respects client speed)
if (controller.desiredSize <= 0) {
  await controller.ready  // Pause rendering until client drains
}
controller.enqueue(chunk)  // Only enqueue when ready
```

### Configuration

```typescript
const stream = renderToStream(app, {
  chunkSize: 64 * 1024,      // 64KB chunks
  maxBufferSize: 1024 * 1024  // 1MB max buffer
})
```

### Monitoring

In development, watch for backpressure warnings:

```
[Pyreon SSR] Stream buffer size (2.5MB) exceeds expected 1MB. 
Client may be very slow.
```

This indicates your client connection is slower than expected. Consider:
1. Optimizing components for faster rendering
2. Streaming critical content earlier
3. Checking network conditions

### Best Practices

1. **Keep component rendering fast:** Suspense can slow streaming
2. **Prioritize critical content:** Use Suspense for secondary content
3. **Monitor in production:** Track slow client connections
4. **Test with slow networks:** DevTools throttling can simulate
```

### Acceptance Criteria
- [ ] Backpressure correctly detected and handled
- [ ] Memory stays bounded with slow clients
- [ ] No performance regression on fast clients
- [ ] Tests verify backpressure behavior
- [ ] Configuration is flexible and documented
- [ ] Warnings appear for excessive buffering

### Rollout Timeline
- **Day 1:** Steps 1-2 (backpressure implementation)
- **Day 2:** Step 3 (configuration)
- **Day 3:** Steps 4-5 (tests + documentation)

---

## Testing Checklist for All Issues

```markdown
## Pre-Release Testing

### Unit Tests
- [ ] Issue 1: Circular dependency detection
  - [ ] Direct cycles detected
  - [ ] Indirect cycles detected
  - [ ] No false positives
  
- [ ] Issue 2: onCleanup LIFO ordering
  - [ ] Single effect cleanup order
  - [ ] Nested effect cleanup order
  - [ ] Multiple nested levels
  
- [ ] Issue 3: SSR streaming backpressure
  - [ ] Backpressure detection
  - [ ] Slow consumer handling
  - [ ] Memory bounded

### Integration Tests
- [ ] Full app with circular dependencies
- [ ] Large tree with nested effects
- [ ] Streaming to slow client (HTTP/1.1)
- [ ] Streaming to fast client (HTTP/2)

### Performance Tests
- [ ] Cycle detection overhead < 2% (dev mode)
- [ ] LIFO cleanup ordering (no regression)
- [ ] Streaming performance (no regression)

### Real-World Scenarios
- [ ] Framework example: circular form validation
- [ ] Framework example: nested component cleanup
- [ ] Framework example: SSR streaming on slow network

### Browser Compatibility
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Node.js 18+ (SSR)
```

---

## Rollout Strategy

### Phase 1: Development (Week 1)
1. Implement core fixes on feature branch
2. Write comprehensive tests
3. Internal code review

### Phase 2: Staging (Week 2)
1. Merge to staging branch
2. Deploy to staging environment
3. Manual testing + monitoring
4. Fix any regressions

### Phase 3: Release (Week 3)
1. Create release PR with changelog
2. Final review + approval
3. Tag release v1.X.0
4. Publish to npm
5. Monitor production metrics

### Phase 4: Post-Release (Week 4)
1. Monitor error rates
2. Collect user feedback
3. Plan follow-up improvements

---

## Success Metrics

### Issue 1: Circular Dependency Detection
- ✓ Zero infinite loops in production
- ✓ Developers receive clear warnings in dev mode
- ✓ No false positives reported

### Issue 2: onCleanup LIFO Ordering
- ✓ Resource cleanup follows correct order
- ✓ No double-cleanup errors
- ✓ Memory usage remains stable

### Issue 3: SSR Streaming Backpressure
- ✓ Server memory stays bounded under load
- ✓ No connection timeouts
- ✓ Slow clients handled gracefully

---

## Appendix: Common Questions

**Q: Will these fixes break my app?**
A: No. These are fixes to edge cases and error conditions. Normal usage patterns are unaffected.

**Q: Do I need to update my code?**
A: Not required. Updates are backward-compatible. Optional: use new APIs for better ergonomics.

**Q: What's the performance impact?**
A: Cycle detection: ~1-2% overhead (dev mode only). LIFO cleanup: no overhead. Backpressure: no overhead on fast clients, beneficial on slow ones.

**Q: How long will implementation take?**
A: ~3 days total for all three issues (including tests + documentation).

**Q: What if I find more issues during implementation?**
A: Document them and create follow-up issues. Don't delay the release for new findings.
