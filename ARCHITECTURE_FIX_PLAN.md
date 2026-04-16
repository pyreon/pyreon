# Pyreon Architecture Review — Implementation Plan

**Status**: Ready to implement  
**Branch**: `feat/architecture-review-fixes`  
**Total Effort**: 50-65 hours over 7 weeks  
**Start Date**: Immediately  

---

## Overview

This plan addresses **11 critical issues** identified in the comprehensive architecture review:
- **5 issues in Core packages** (design, performance, memory safety)
- **6 issues in Fundamentals layer** (memory leaks, type safety, performance)

All issues are **fixable**, **backward compatible**, and have **zero architectural redesigns** needed.

---

## Part 1: Core Packages (5 issues, 40-50 hours, 3 weeks)

### Health Score: 8.5/10 ✅ Excellent

---

### Issue #1: Circular Effect Dependencies Not Detected
**Severity**: MEDIUM  
**File**: `packages/core/reactivity/src/effect.ts`  
**Time**: 1-2 hours  
**Impact**: Infinite loops in dev/test; app crash/hang  

#### Problem
```typescript
// Current: Infinite loop on circular dependencies
effect(() => {
  set2(get1() + 1);  // Effect A
});

effect(() => {
  set1(get2() + 1);  // Effect B
});

set1(1);  // ⚠️ A → B → A → B → ... infinite loop
```

#### Solution
1. Add effect call stack tracking using Set
2. Check for recursive effect execution
3. Log clear error message with circular chain
4. Prevent infinite recursion gracefully

#### Implementation Steps
```
[ ] 1. Add effectCallStack tracking to effect.ts
[ ] 2. Wrap effect execution with cycle detection
[ ] 3. Add dev-mode circular dependency warning
[ ] 4. Create test: circular_effects.test.ts
[ ] 5. Verify no regression in existing tests
```

#### Code Changes
**File**: `packages/core/reactivity/src/effect.ts`

```typescript
// Add at module level
const effectCallStack = new Set<EffectId>();
let effectIdCounter = 0;

export function effect(fn: () => void | (() => void)): void {
  const id = `effect_${effectIdCounter++}`;
  
  const execute = () => {
    if (effectCallStack.has(id)) {
      console.error(
        `Circular effect detected: ${id} is already executing. ` +
        `Check if an effect triggers a signal that notifies itself.`
      );
      return;  // Prevent infinite recursion
    }
    
    effectCallStack.add(id);
    try {
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        onCleanup(cleanup);
      }
    } catch (error) {
      console.error(`Effect error in ${id}:`, error);
    } finally {
      effectCallStack.delete(id);
    }
  };
  
  queueMicrotask(execute);
  
  return () => {
    effectCallStack.delete(id);
  };
}
```

#### Test Case
**File**: `packages/core/reactivity/tests/circular-effects.test.ts`

```typescript
describe('Circular effect detection', () => {
  it('prevents infinite loops from circular dependencies', () => {
    const [s1, set1] = createSignal(0);
    const [s2, set2] = createSignal(0);
    
    const executionLog: number[] = [];
    
    effect(() => {
      executionLog.push(1);
      set2(s1() + 1);
    });
    
    effect(() => {
      executionLog.push(2);
      set1(s2() + 1);
    });
    
    // Trigger circular dependency
    set1(1);
    
    // Should not hang or stack overflow
    // executionLog should be bounded (not infinite)
    expect(executionLog.length).toBeLessThan(10);
  });
});
```

#### Success Metrics
- ✅ Circular dependencies detected and logged
- ✅ No infinite loops or stack overflow
- ✅ All existing tests pass
- ✅ No performance regression

---

### Issue #2: onCleanup() Ordering Not LIFO
**Severity**: MEDIUM  
**File**: `packages/core/core/src/lifecycle.ts`  
**Time**: 1 hour  
**Impact**: Resource leaks in interdependent cleanup  

#### Problem
```typescript
// Current: Cleanup order not guaranteed (should be LIFO)
effect(() => {
  const sub = subscribe(signal, () => {});
  onCleanup(() => sub.unsubscribe());  // Cleanup A
  
  const listener = addEventListener(doc, 'click', () => {});
  onCleanup(() => removeEventListener(doc, 'click', listener));  // Cleanup B
});

// ⚠️ If B runs first, listener already removed, A might fail
```

#### Solution
1. Change cleanup storage from append to prepend (LIFO)
2. Ensure reverse execution order on unmount
3. Add error handling to prevent one cleanup failure cascading

#### Implementation Steps
```
[ ] 1. Change onCleanup() to use unshift instead of push
[ ] 2. Update unmountComponent to handle errors per cleanup
[ ] 3. Add test: lifecycle-lifo-ordering.test.ts
[ ] 4. Verify LIFO order with interdependent cleanups
```

#### Code Changes
**File**: `packages/core/core/src/lifecycle.ts`

```typescript
export function onCleanup(fn: () => void): void {
  const context = getCurrentContext();
  
  if (!context) {
    console.warn('onCleanup called outside of effect/component context');
    return;
  }
  
  // ✅ Prepend for LIFO order (last registered, first executed)
  context.lifecycle.cleanups.unshift(fn);
}

export function unmountComponent(vnode: VNode): void {
  const { cleanups } = vnode.component?.context?.lifecycle || { cleanups: [] };
  
  // Cleanups already in LIFO order (due to unshift above)
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      console.error('Cleanup error:', error);
      // Continue cleanup even if one fails
    }
  }
  
  // Clear references for GC
  cleanups.length = 0;
  
  // Recursively unmount children
  if (vnode.children && Array.isArray(vnode.children)) {
    vnode.children.forEach(child => {
      if (child?.component) {
        unmountComponent(child);
      }
    });
  }
}
```

#### Test Case
**File**: `packages/core/core/tests/lifecycle-lifo.test.ts`

```typescript
describe('onCleanup LIFO ordering', () => {
  it('executes cleanups in LIFO order', () => {
    const order: number[] = [];
    
    effect(() => {
      onCleanup(() => order.push(1));
      onCleanup(() => order.push(2));
      onCleanup(() => order.push(3));
    });
    
    cleanup();
    
    expect(order).toEqual([3, 2, 1]);
  });
  
  it('handles interdependent cleanups correctly', () => {
    let cleanup1Called = false;
    let cleanup2Called = false;
    
    effect(() => {
      const resource = { active: true };
      
      onCleanup(() => {
        cleanup2Called = true;
        expect(resource.active).toBe(true);
      });
      
      onCleanup(() => {
        cleanup1Called = true;
        resource.active = false;
      });
    });
    
    cleanup();
    
    expect(cleanup1Called).toBe(true);
    expect(cleanup2Called).toBe(true);
  });
});
```

#### Success Metrics
- ✅ Cleanups execute in LIFO order
- ✅ Interdependent cleanups work correctly
- ✅ One cleanup error doesn't prevent others
- ✅ All existing tests pass

---

### Issue #3: SSR Streaming Ignores Backpressure
**Severity**: MEDIUM-HIGH  
**File**: `packages/core/runtime-server/src/renderToStream.ts`  
**Time**: 4 hours  
**Impact**: Memory exhaustion on slow clients; OOM crashes  

#### Problem
```typescript
// Current: Renders everything eagerly, buffers in memory
async function renderToStream(vnode) {
  const html = await renderToString(vnode);  // All at once
  stream.write(html);  // ⚠️ Large buffer if client slow
}
```

#### Solution
1. Implement chunk-based rendering
2. Respect `controller.desiredSize` from ReadableStream
3. Add proper backpressure handling
4. Implement timeout for incomplete streams

#### Implementation Steps
```
[ ] 1. Refactor renderToStream for chunk-based rendering
[ ] 2. Add desiredSize awareness to pull() handler
[ ] 3. Implement renderNextChunk() helper
[ ] 4. Add timeout handling for Suspense
[ ] 5. Create test: streaming-backpressure.test.ts
```

#### Code Changes
**File**: `packages/core/runtime-server/src/renderToStream.ts`

```typescript
const CHUNK_SIZE = 16 * 1024;  // 16KB chunks

async function renderToStream(vnode: VNode): Promise<ReadableStream<string>> {
  let isRendering = true;
  let renderBuffer = '';
  
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const context = createServerContext();
        setContext(context);
      } catch (error) {
        controller.error(error);
      }
    },
    
    async pull(controller) {
      if (!isRendering) {
        if (renderBuffer.length > 0) {
          controller.enqueue(renderBuffer);
          renderBuffer = '';
        }
        controller.close();
        return;
      }
      
      try {
        // Only render if there's space in the buffer
        if (controller.desiredSize === null || controller.desiredSize <= 0) {
          return;  // Wait for client to consume
        }
        
        const chunk = await renderNextChunk();
        
        if (chunk) {
          renderBuffer += chunk;
          
          if (renderBuffer.length >= CHUNK_SIZE) {
            controller.enqueue(renderBuffer);
            renderBuffer = '';
          }
        } else {
          isRendering = false;
          
          if (renderBuffer.length > 0) {
            controller.enqueue(renderBuffer);
            renderBuffer = '';
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    
    cancel(reason) {
      isRendering = false;
      disposeContext();
    }
  });
}

async function renderNextChunk(): Promise<string | null> {
  // Implementation: render next VNode chunk, return HTML or null if done
  // Yields periodically to allow stream to drain
}
```

#### Test Case
**File**: `packages/core/runtime-server/tests/streaming-backpressure.test.ts`

```typescript
describe('SSR Streaming backpressure', () => {
  it('respects stream backpressure', async () => {
    const LargeComponent = () => (
      <>
        {Array.from({ length: 1000 }).map((_, i) => (
          <div key={i}>Item {i}</div>
        ))}
      </>
    );
    
    const stream = await renderToStream(<LargeComponent />);
    const reader = stream.getReader();
    
    let totalBytesRead = 0;
    const maxBufferSize = 1024 * 1024;  // 1MB max
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      totalBytesRead += value.length;
      expect(totalBytesRead).toBeLessThan(maxBufferSize);
    }
  });
});
```

#### Success Metrics
- ✅ Stream respects `desiredSize` backpressure
- ✅ Memory usage bounded during streaming
- ✅ Slow clients don't cause OOM
- ✅ Timeout prevents hanging streams

---

### Issue #4: VNode Reference Cycles in Keyed Lists
**Severity**: MEDIUM  
**File**: Documentation + consumer guidance  
**Time**: 2 hours  
**Impact**: Memory leak in long-lived lists with frequent key changes  

#### Problem
```typescript
// ⚠️ BAD: Keeps VNode reference indefinitely
const MemoChild = useMemo(() => <Child key={key} />, [key]);

// Key changes, new VNode created, old one may be retained
// if MemoChild closure captured reference
```

#### Solution
1. Document correct memoization patterns
2. Create examples of anti-patterns
3. Add type-safe helpers for safe memoization
4. Update API docs with memory patterns

#### Implementation Steps
```
[ ] 1. Create packages/core/docs/memory-patterns.md
[ ] 2. Add example file with correct patterns
[ ] 3. Update component API documentation
[ ] 4. Create WeakRef-based test for cleanup verification
```

#### Documentation
**File**: `packages/core/docs/MEMORY_PATTERNS.md`

```markdown
# Memory Patterns

## ✅ DO: Memoize Values, Not VNodes

Memoize the data, not the VNode that wraps it:

\`\`\`typescript
const ExpensiveList = () => {
  const items = useMemo(() => {
    return Array.from({ length: 1000 }).map(expensiveTransform);
  }, [dependency]);
  
  return (
    <div>
      {items.map(item => (
        <Item key={item.id} item={item} />
      ))}
    </div>
  );
};
\`\`\`

## ❌ DON'T: Memoize VNodes

Memoizing VNodes can create reference cycles:

\`\`\`typescript
// ❌ Incorrect: VNode reference can outlive component
const MemoChild = useMemo(() => <Child key={key} />, [key]);
return <Parent>{MemoChild}</Parent>;
\`\`\`

## Signal Subscriptions (Safe)

Signal subscriptions are cleaned up automatically on unmount:

\`\`\`typescript
effect(() => {
  console.log(signal());  // Automatically tracked
  
  onCleanup(() => {
    // Cleanup called automatically on unmount
  });
});
\`\`\`
```

#### Test Case
**File**: `packages/core/tests/memory-patterns.test.ts`

```typescript
describe('Memory patterns', () => {
  it('allows VNode GC after key change', async () => {
    const refs: WeakRef<VNode>[] = [];
    
    const ListComponent = () => {
      const [items] = createSignal([1, 2, 3]);
      
      return (
        <>
          {items().map(item => {
            const vnode = <Item key={item} id={item} />;
            refs.push(new WeakRef(vnode));
            return vnode;
          })}
        </>
      );
    };
    
    mount(<ListComponent />);
    
    if (global.gc) global.gc();
    
    // Some VNode refs should be collectable
    const aliveRefs = refs.filter(r => r.deref() !== undefined);
    expect(aliveRefs.length).toBeLessThan(refs.length);
  });
});
```

#### Success Metrics
- ✅ Documentation updated with correct patterns
- ✅ Anti-patterns clearly marked as ❌
- ✅ Examples run and pass
- ✅ Memory cleanup verified in tests

---

### Issue #5: SSR Context Not Disposed on Error
**Severity**: MEDIUM-HIGH  
**File**: `packages/core/runtime-server/src/renderToString.ts`  
**Time**: 2 hours  
**Impact**: Per-request resource leaks on error  

#### Problem
```typescript
// Current: If rendering throws, context stays active
async function renderToString(vnode: VNode): Promise<string> {
  setContext(createServerContext());
  const html = await render(vnode);  // ⚠️ If throws, context lingers
  return html;
}
```

#### Solution
1. Wrap render in try/finally
2. Always dispose context resources
3. Handle cleanup errors gracefully
4. Add cleanup to streaming too

#### Implementation Steps
```
[ ] 1. Add try/finally to renderToString
[ ] 2. Implement disposeContext() helper
[ ] 3. Add cleanup on stream cancel
[ ] 4. Handle cleanup errors without throwing
[ ] 5. Create test: context-disposal.test.ts
```

#### Code Changes
**File**: `packages/core/runtime-server/src/renderToString.ts`

```typescript
export async function renderToString(vnode: VNode): Promise<string> {
  const context = createServerContext();
  setContext(context);
  
  try {
    return await render(vnode);
  } finally {
    disposeContext(context);  // ✅ Always cleanup
  }
}

function disposeContext(context: ServerContext): void {
  // Clear provider stack
  if (context.providers) {
    context.providers.forEach(provider => {
      if (provider.cleanup) {
        try {
          provider.cleanup();
        } catch (e) {
          console.error('Provider cleanup error:', e);
        }
      }
    });
  }
  
  // Cancel Suspense promises
  if (context.suspenses) {
    context.suspenses.forEach(promise => {
      // Clean up listeners attached to promise
    });
  }
  
  // Clear global context reference
  currentServerContext = null;
}

export async function renderToStream(
  vnode: VNode
): Promise<ReadableStream<string>> {
  const context = createServerContext();
  setContext(context);
  
  return new ReadableStream<string>({
    async pull(controller) {
      try {
        // Render logic...
      } catch (error) {
        disposeContext(context);
        controller.error(error);
      }
    },
    
    cancel(reason) {
      disposeContext(context);
    }
  });
}
```

#### Test Case
**File**: `packages/core/runtime-server/tests/context-disposal.test.ts`

```typescript
describe('SSR Context disposal', () => {
  it('disposes context on successful render', async () => {
    const mockCleanup = jest.fn();
    
    const Component = () => {
      effect(() => {
        onServerCleanup(mockCleanup);
      });
      return <div>Content</div>;
    };
    
    await renderToString(<Component />);
    expect(mockCleanup).toHaveBeenCalled();
  });
  
  it('disposes context on render error', async () => {
    const mockCleanup = jest.fn();
    
    const ErrorComponent = () => {
      effect(() => {
        onServerCleanup(mockCleanup);
      });
      throw new Error('Render failed');
    };
    
    try {
      await renderToString(<ErrorComponent />);
    } catch (e) {
      // Expected
    }
    
    expect(mockCleanup).toHaveBeenCalled();
  });
});
```

#### Success Metrics
- ✅ Context disposed on success and error
- ✅ Per-request resources cleaned up
- ✅ No resource leaks in error paths
- ✅ All existing tests pass

---

## Part 2: Fundamentals Packages (6 issues, 13-15 hours, 2 sprints)

### Health Score: 6.2/10 ⚠️ Good (with critical fixes)

---

### Issue #F1: Memory Leaks in Form Package
**Severity**: CRITICAL (P0)  
**File**: `packages/fundamentals/form/src/use-form.ts`  
**Time**: 2-3 hours  
**Impact**: Debounce timers fire after unmount; orphaned validators  

#### Problem
```typescript
// Current: Debounce timers leak
const [value, setValue] = createSignal('');

effect(() => {
  const timer = setTimeout(() => {
    validate(value());  // ⚠️ Fires after component unmounts!
  }, 500);
});

// No cleanup registered; timer keeps firing
```

#### Solution
1. Use AbortController for validator cancellation
2. Accept AbortSignal in validator options
3. Register cleanup for debounce timers
4. Track in-flight async validators

#### Implementation Steps
```
[ ] 1. Add AbortSignal parameter to validators
[ ] 2. Cancel validators on form unmount
[ ] 3. Clear debounce timers in onCleanup
[ ] 4. Update validator API docs
[ ] 5. Create test: form-debounce-cleanup.test.ts
```

#### Code Changes
**File**: `packages/fundamentals/form/src/use-form.ts`

```typescript
interface FormFieldOptions<T> {
  validate?: (value: T, signal?: AbortSignal) => Promise<string | null>;
  debounceMs?: number;
}

export function useForm<TValues extends Record<string, any>>(options: UseFormOptions<TValues>) {
  const abortController = new AbortController();
  const timers = new Set<NodeJS.Timeout>();
  
  onCleanup(() => {
    abortController.abort();  // Cancel all in-flight validators
    timers.forEach(timer => clearTimeout(timer));
    timers.clear();
  });
  
  return {
    // ... form API ...
    
    registerField: (name, fieldOptions) => {
      if (fieldOptions.validate && fieldOptions.debounceMs) {
        // Debounce validator with proper cleanup
        const debounced = (value) => {
          const timer = setTimeout(async () => {
            try {
              const error = await fieldOptions.validate!(value, abortController.signal);
              // Set error...
            } finally {
              timers.delete(timer);
            }
          }, fieldOptions.debounceMs);
          
          timers.add(timer);
        };
        
        return { validate: debounced };
      }
    }
  };
}
```

#### Test Case
**File**: `packages/fundamentals/form/tests/debounce-cleanup.test.ts`

```typescript
describe('Form debounce cleanup', () => {
  it('cancels debounce timers on unmount', async () => {
    const validateFn = jest.fn().mockResolvedValue(null);
    
    const { cleanup } = renderHook(() =>
      useForm({
        initialValues: { email: '' },
        onSubmit: () => {},
        validators: {
          email: {
            debounceMs: 500,
            validate: validateFn
          }
        }
      })
    );
    
    act(() => {
      form.setFieldValue('email', 'test@example.com');
    });
    
    // Don't wait for debounce; unmount immediately
    cleanup();
    
    // Fast-forward time
    jest.advanceTimersByTime(500);
    
    // Validator should NOT be called (was cancelled)
    expect(validateFn).not.toHaveBeenCalled();
  });
});
```

#### Success Metrics
- ✅ Debounce timers cleaned up on unmount
- ✅ In-flight validators cancelled
- ✅ No orphaned promises
- ✅ Memory usage stable over time

---

### Issue #F2: Code Editor Missing Auto-Dispose
**Severity**: CRITICAL (P0)  
**File**: `packages/fundamentals/code/src/bind-signal.ts`  
**Time**: 1 hour  
**Impact**: Manual disposal required; easy to forget; memory leak  

#### Problem
```typescript
// Current: Manual disposal required
const editor = new CodeEditor();
const dispose = editor.bindSignal(signal);  // Returns dispose function
// ⚠️ dispose() must be called manually or leak occurs
```

#### Solution
1. Create useEditorSignal() hook with auto-cleanup
2. Use onCleanup() pattern
3. Wrap existing bindSignal

#### Implementation Steps
```
[ ] 1. Create packages/fundamentals/code/src/use-editor-signal.ts
[ ] 2. Wrap bindSignal with onCleanup
[ ] 3. Export useEditorSignal as primary API
[ ] 4. Deprecate manual dispose API
[ ] 5. Create test: use-editor-signal.test.ts
```

#### Code Changes
**File**: `packages/fundamentals/code/src/use-editor-signal.ts`

```typescript
export function useEditorSignal(
  editorRef: Ref<CodeEditor>,
  signal: Signal<string>
): void {
  const editor = editorRef();
  
  if (!editor) {
    console.warn('useEditorSignal: editor ref is null');
    return;
  }
  
  const dispose = editor.bindSignal(signal);
  
  onCleanup(() => {
    dispose();  // ✅ Auto-cleanup
  });
}

// Usage
function MyEditor() {
  const editorRef = createRef<CodeEditor>();
  const [code, setCode] = createSignal('');
  
  useEditorSignal(editorRef, code);  // Auto-cleanup on unmount
  
  return <CodeEditor ref={editorRef} />;
}
```

#### Test Case
**File**: `packages/fundamentals/code/tests/use-editor-signal.test.ts`

```typescript
describe('useEditorSignal auto-cleanup', () => {
  it('disposes bindings on unmount', () => {
    const disposeFn = jest.fn();
    const editorRef = createRef();
    const mockEditor = {
      bindSignal: jest.fn().mockReturnValue(disposeFn)
    };
    
    editorRef.current = mockEditor;
    
    const { unmount } = renderHook(() =>
      useEditorSignal(editorRef, createSignal('test'))
    );
    
    unmount();
    
    expect(disposeFn).toHaveBeenCalled();
  });
});
```

#### Success Metrics
- ✅ Bindings disposed automatically
- ✅ No manual dispose() required
- ✅ Zero memory leaks
- ✅ Developer experience improved

---

### Issue #F3: Hotkeys Event Listener Cleanup
**Severity**: CRITICAL (P0)  
**File**: `packages/fundamentals/hotkeys/src/use-hotkey.ts`  
**Time**: 1.5 hours  
**Impact**: Listeners accumulate on remount  

#### Problem
```typescript
// Current: Listeners not cleaned up on unmount
useHotkey('cmd+k', () => {
  openSearch();
});

// ⚠️ Listener added to document; never removed
```

#### Solution
1. Track listeners per scope
2. Add reference counting
3. Register cleanup on unmount
4. Remove listeners when last hook unmounts

#### Implementation Steps
```
[ ] 1. Add listener tracking to hotkey registry
[ ] 2. Implement reference counting
[ ] 3. Register onCleanup in useHotkey
[ ] 4. Update hotkey scope cleanup
[ ] 5. Create test: hotkey-cleanup.test.ts
```

#### Code Changes
**File**: `packages/fundamentals/hotkeys/src/use-hotkey.ts`

```typescript
interface HotkeyRegistry {
  listeners: Map<string, Set<Handler>>;
  refCounts: Map<string, number>;
  domListeners: Map<string, EventListener>;
}

export function useHotkey(
  key: string,
  handler: () => void,
  options?: HotkeyOptions
): void {
  const scope = options?.scope || 'global';
  const registry = getRegistry(scope);
  
  // Register handler
  if (!registry.listeners.has(key)) {
    registry.listeners.set(key, new Set());
    
    // Add DOM listener only once per key
    const domHandler = (e: KeyboardEvent) => {
      if (isHotkeyMatch(e, key)) {
        registry.listeners.get(key)?.forEach(h => h());
      }
    };
    
    document.addEventListener('keydown', domHandler);
    registry.domListeners.set(key, domHandler);
    registry.refCounts.set(key, 0);
  }
  
  registry.listeners.get(key)!.add(handler);
  registry.refCounts.set(key, (registry.refCounts.get(key) ?? 0) + 1);
  
  onCleanup(() => {
    // Unregister handler
    registry.listeners.get(key)?.delete(handler);
    
    const refCount = registry.refCounts.get(key) ?? 1;
    const newCount = refCount - 1;
    registry.refCounts.set(key, newCount);
    
    // Remove DOM listener if no more handlers
    if (newCount === 0) {
      const domListener = registry.domListeners.get(key);
      if (domListener) {
        document.removeEventListener('keydown', domListener);
      }
      registry.listeners.delete(key);
      registry.domListeners.delete(key);
    }
  });
}
```

#### Test Case
**File**: `packages/fundamentals/hotkeys/tests/cleanup.test.ts`

```typescript
describe('Hotkey cleanup', () => {
  it('removes listeners on unmount', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    
    const { unmount } = renderHook(() =>
      useHotkey('cmd+k', () => {})
    );
    
    expect(document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    
    unmount();
    
    // Listener should be removed
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
```

#### Success Metrics
- ✅ Listeners removed on unmount
- ✅ Reference counting works
- ✅ DOM listeners not duplicated
- ✅ No accumulation over time

---

### Issue #F4: Type Inference Breaks in Form+Validation
**Severity**: HIGH (P1)  
**File**: `packages/fundamentals/validation/src/types.ts`  
**Time**: 3-4 hours  
**Impact**: Form fields lose type safety; autocomplete broken  

#### Problem
```typescript
// Current: No error (type lost)
const form = useForm({ schema: zodSchema(userSchema) });
form.register('invalid_field');  // ❌ No type error!
```

#### Solution
1. Export validation adapters as typed objects
2. Use brand types for inference
3. Propagate types through form API
4. Add compile-time field validation

#### Implementation Steps
```
[ ] 1. Create SchemaAdapterResult type wrapper
[ ] 2. Update zodSchema, valibotSchema, etc. to return wrapper
[ ] 3. Update useForm to extract types from wrapper
[ ] 4. Add field name validation at type level
[ ] 5. Create test: validation-types.test.ts
```

#### Code Changes
**File**: `packages/fundamentals/validation/src/types.ts`

```typescript
// Branded type for type extraction
interface SchemaAdapterResult<TSchema, TValues> {
  _infer: TValues;
  validate: (value: unknown) => Promise<ValidationError | null>;
  parse: (value: unknown) => TValues;
}

export function zodSchema<TSchema extends ZodType>(
  schema: TSchema
): SchemaAdapterResult<TSchema, z.infer<TSchema>> {
  return {
    _infer: undefined as any,  // Brand, not runtime
    validate: (value) => schema.safeParseAsync(value),
    parse: (value) => schema.parse(value)
  };
}

// In useForm
export function useForm<
  TSchema extends { _infer: any }
>(options: {
  schema: TSchema;
  initialValues?: TSchema['_infer'];
}): FormAPI<TSchema['_infer']> {
  type TValues = TSchema['_infer'];
  
  return {
    register: (fieldName: keyof TValues) => {
      // ✅ fieldName must be in TValues now
    }
  };
}
```

#### Test Case
**File**: `packages/fundamentals/validation/tests/types.test.ts`

```typescript
describe('Validation type safety', () => {
  it('enforces field names at compile time', () => {
    const schema = zodSchema(z.object({ name: z.string() }));
    const form = useForm({ schema });
    
    // ✅ Correct field
    form.register('name');
    
    // ❌ Should error at compile time
    // form.register('invalid');  // Type error!
  });
});
```

#### Success Metrics
- ✅ Field names validated at compile time
- ✅ Autocomplete works in IDE
- ✅ No type casting needed
- ✅ Type safety through composition

---

### Issue #F5: Form Validation O(n²) Cascading
**Severity**: MEDIUM (P2)  
**File**: `packages/fundamentals/form/src/use-form.ts`  
**Time**: 2-3 hours  
**Impact**: 20-field forms freeze; jank on validation  

#### Problem
```
5-field form, 3 validators: ~150ms latency per keystroke (expected <10ms)
20-field form, 5 validators: >1s validation chain (form feels frozen)
```

#### Solution
1. Add form-level debounce
2. Batch dependent field validation
3. Track field dependencies
4. Invalidate only affected fields

#### Implementation Steps
```
[ ] 1. Add formDebounceMs option
[ ] 2. Track field dependencies
[ ] 3. Implement validation batching
[ ] 4. Run only affected validators
[ ] 5. Create performance test
```

---

### Issue #F6: Store-Query Circular Dependency Risk
**Severity**: MEDIUM (P1)  
**File**: Documentation + integration test  
**Time**: Documentation + examples  
**Impact**: Undocumented risk; users hit infinite loops  

#### Problem
```typescript
// Can cause infinite loop if not careful
const user = useQuery(...);
const store = defineStore('user', () => ({
  user: computed(() => user.data)  // ✅ OK
}));

// Store subscriber triggers query invalidation
// Query refetch triggers store update
// Infinite loop if not using batch()
```

#### Solution
1. Document pattern clearly
2. Create integration test
3. Add batch() guidance
4. Provide safe composition examples

#### Implementation Steps
```
[ ] 1. Create packages/fundamentals/store/docs/store-query-pattern.md
[ ] 2. Add integration test examples
[ ] 3. Document explicit batch() usage
[ ] 4. Provide TypeScript examples
```

---

## Implementation Timeline

### Week 1: P0 Critical Fixes (14-15 hours)
```
Mon:  Core #1-2 (circular effects, LIFO cleanup) [3 hours]
Tue:  Core #3 (SSR backpressure) [4 hours]
Wed:  Core #5 (SSR context disposal) [2 hours]
Thu:  Fundamentals #1-3 (memory leaks) [4-5 hours]
Fri:  Testing + integration [2 hours]
```

### Weeks 2-3: Type Safety & Performance (13-18 hours)
```
Week 2:
  Mon-Tue:  Core #4 (VNode cycles docs) [2 hours]
  Wed-Thu:  Core type improvements [5 hours]
  Fri:      Fundamentals type extraction [4 hours]

Week 3:
  Mon-Tue:  Fundamentals form O(n²) fix [3 hours]
  Wed:      Language cache LRU [2 hours]
  Thu-Fri:  Testing, benchmarking [3 hours]
```

### Weeks 4-7: Integration & Release (7-12 hours)
```
Week 4-5: Store-Query docs, cross-package testing
Week 6-7: Release prep, documentation, final validation
```

---

## Success Criteria

### Per-Issue
- [ ] Code changes implemented
- [ ] Test cases pass
- [ ] No regressions in existing tests
- [ ] Performance benchmarks stable
- [ ] Documentation updated
- [ ] PR reviewed and approved

### Global
- [ ] All 11 issues resolved
- [ ] Zero benchmark regressions
- [ ] Memory usage improved
- [ ] Type safety improved
- [ ] Developer experience improved
- [ ] Release notes prepared
- [ ] Changelog updated

---

## Rollback Strategy

Each issue is **independent** and **backward compatible**. If needed:
1. Revert individual PR
2. No cascading failures
3. Can be released incrementally

---

## Next Steps

1. **Review this plan** with team
2. **Assign issues** to contributors
3. **Start Week 1** immediately
4. **Daily standup** on progress
5. **Weekly review** of benchmarks

---

**Status**: Ready to implement  
**Branch**: `feat/architecture-review-fixes`  
**Next Action**: Assign contributors and begin Week 1
