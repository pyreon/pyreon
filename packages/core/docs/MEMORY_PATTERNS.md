# Memory Patterns in Pyreon

This guide documents patterns for safe memory management in Pyreon applications.

## ✅ DO: Memoize Values, Not VNodes

Memoize the **data** that goes into a component, not the VNode itself. This allows VNodes to be garbage collected when they're no longer needed.

### Correct Pattern

```typescript
const ExpensiveList = () => {
  const items = createSignal([]);

  const processedItems = useMemo(() => {
    // Expensive computation on the data
    return items().map(item => ({
      ...item,
      computed: expensiveTransform(item),
    }));
  }, [items]);

  return (
    <div>
      {processedItems().map(item => (
        <Item key={item.id} item={item} />
      ))}
    </div>
  );
};
```

**Why:** Each item in the list is rendered independently. Memoizing the data array means recomputing only when necessary, but VNodes are created fresh on each render (or updated by the framework's reactivity). This allows old VNodes to be garbage collected.

---

## ❌ DON'T: Memoize VNodes Directly

Never memoize VNodes themselves, especially in closures. This can create reference cycles that prevent garbage collection.

### ❌ Incorrect Pattern

```typescript
// BAD: VNode reference captured in closure
const ListComponent = () => {
  const [key, setKey] = createSignal('initial');

  const memoChild = useMemo(() => <Child key={key()} />, [key]);

  return <Parent>{memoChild}</Parent>;
};

// When key changes:
// 1. New VNode created
// 2. useMemo re-runs
// 3. Old VNode reference may be retained in memory indefinitely
```

### Why This Is Bad

- The VNode object contains references to props, context, and internal state
- If a closure captures the VNode, it can prevent garbage collection
- In long-lived applications with frequent key changes, this accumulates memory leaks
- Keyed lists with memoized VNodes are particularly problematic

---

## ✅ Safe Patterns for Dynamic Content

### Signal-Based Updates

Signal subscriptions are automatically cleaned up when components unmount:

```typescript
const Component = () => {
  const [data, setData] = createSignal(null);

  effect(() => {
    const controller = new AbortController();

    // Signal subscription tracked automatically
    const value = data();
    if (value) {
      fetch(`/api/item/${value}`, { signal: controller.signal })
        .then(r => r.json())
        .then(setData);
    }

    // Cleanup is automatic on unmount or when effect re-runs
    onCleanup(() => controller.abort());
  });

  return <div>{data()?.name}</div>;
};
```

### Event Listeners

Cleanup event listeners using `onCleanup()` in LIFO order:

```typescript
const Component = () => {
  effect(() => {
    const handleClick = () => console.log('clicked');
    document.addEventListener('click', handleClick);

    // Registered first - runs LAST
    onCleanup(() => {
      document.removeEventListener('click', handleClick);
    });

    const handleKeydown = () => console.log('keydown');
    document.addEventListener('keydown', handleKeydown);

    // Registered last - runs FIRST
    onCleanup(() => {
      document.removeEventListener('keydown', handleKeydown);
    });
  });

  return <div>Click or press a key</div>;
};
```

**Note:** Cleanup callbacks run in LIFO (Last In, First Out) order. This ensures dependent resources are cleaned up in the correct order.

---

## Memory Management Rules

### 1. Signals and Effects

Signals are reference-counted internally. Effects are disposed automatically when:
- The component unmounts
- The effect scope is destroyed
- `effect.dispose()` is explicitly called

```typescript
const e = effect(() => {
  const value = signal();
  console.log(value);
});

// Later, when component unmounts
e.dispose();  // Automatic by framework
```

### 2. Closures and Captures

Be careful with closures that capture state:

```typescript
// ✅ GOOD: Handler captured in closure, cleaned up explicitly
const Component = () => {
  const [count, setCount] = createSignal(0);

  const handleClick = () => {
    // count() is read fresh each time
    console.log('clicked', count());
  };

  effect(() => {
    element.addEventListener('click', handleClick);
    onCleanup(() => element.removeEventListener('click', handleClick));
  });

  return <button onClick={handleClick}>Count: {count()}</button>;
};

// ❌ BAD: VNode memoized in closure
const Component = () => {
  const [count, setCount] = createSignal(0);

  // This VNode reference can outlive the component
  const vnode = useMemo(() => <div>{count()}</div>, [count]);
  return vnode;
};
```

### 3. VNode Keys

Always provide stable keys for list items:

```typescript
// ✅ GOOD: Key is item ID, stable across re-renders
<For each={items()}>
  {item => <Item key={item.id} item={item} />}
</For>

// ❌ BAD: Key based on index, changes when list is reordered
<For each={items()}>
  {(item, index) => <Item key={index} item={item} />}
</For>

// ❌ BAD: Key changes every render
<For each={items()}>
  {item => <Item key={Math.random()} item={item} />}
</For>
```

Unstable keys cause:
- VNodes to be destroyed and recreated unnecessarily
- Memory waste from repeated allocation/deallocation
- Lost state in controlled components

---

## Debugging Memory Issues

### Enable GC and Profile

```typescript
// In tests with node
if (global.gc) {
  global.gc();  // Force garbage collection
  // Then check memory usage
}
```

### Use WeakRefs to Verify Cleanup

```typescript
test('Component allows VNode GC after unmount', () => {
  const refs = [];

  const Component = () => {
    const [items] = createSignal([1, 2, 3]);
    return (
      <>
        {items().map(item => {
          const vnode = <div key={item}>{item}</div>;
          refs.push(new WeakRef(vnode));
          return vnode;
        })}
      </>
    );
  };

  const root = mount(() => <Component />);
  const initialCount = refs.filter(r => r.deref()).length;

  root.unmount();

  if (global.gc) global.gc();

  const afterUnmount = refs.filter(r => r.deref()).length;
  expect(afterUnmount).toBeLessThan(initialCount);
});
```

### Check for Leaked Signals

```typescript
// Create a signal
const sig = signal(0);

// If this signal still has subscribers after component unmount,
// it will keep the effect alive
const unsub = sig.subscribe(v => console.log(v));
unsub();  // Always unsubscribe
```

---

## Common Memory Leak Patterns

### Pattern 1: Forgotten Event Listeners

```typescript
// ❌ BAD: Listener never removed
effect(() => {
  window.addEventListener('resize', () => {
    console.log('resized');
  });
});

// ✅ GOOD: Listener removed on unmount
effect(() => {
  const handler = () => console.log('resized');
  window.addEventListener('resize', handler);
  onCleanup(() => window.removeEventListener('resize', handler));
});
```

### Pattern 2: Circular References

```typescript
// ❌ BAD: Object contains self-reference
const obj = { data: 'value' };
obj.self = obj;  // Circular reference can prevent GC

// ✅ GOOD: Use WeakMap for back-references
const backReferences = new WeakMap();
backReferences.set(obj, parent);
```

### Pattern 3: Retained Timers

```typescript
// ❌ BAD: Timer not cleared on unmount
effect(() => {
  const timeoutId = setTimeout(() => {
    console.log('done');
  }, 1000);
  // Missing: onCleanup to clear timeout
});

// ✅ GOOD: Timer cleared on unmount
effect(() => {
  const timeoutId = setTimeout(() => {
    console.log('done');
  }, 1000);
  onCleanup(() => clearTimeout(timeoutId));
});
```

---

## Performance Tips

### 1. Use Reactive Boundaries

Signals and effects are cheap. Use them liberally at component boundaries:

```typescript
const Component = () => {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <>
      <button onClick={() => setExpanded(!expanded())}>Toggle</button>
      {expanded() && <Details />}
    </>
  );
};
```

### 2. Memoize Expensive Computations

```typescript
const items = useMemo(() => {
  return largeArray.filter(expensivePredicate).map(expensiveTransform);
}, [largeArray]);
```

### 3. Defer Non-Critical Updates

Use `batch()` to batch multiple signal updates:

```typescript
import { batch } from '@pyreon/reactivity';

batch(() => {
  setFirst(value1);
  setSecond(value2);
  setThird(value3);
});
// Effects re-run once, not three times
```

---

## Testing Memory Safety

```typescript
describe('Memory patterns', () => {
  test('cleans up event listeners on unmount', () => {
    let listenerCount = 0;
    const originalAdd = window.addEventListener;
    const originalRemove = window.removeEventListener;

    window.addEventListener = function () {
      listenerCount++;
      return originalAdd.apply(this, arguments);
    };

    window.removeEventListener = function () {
      listenerCount--;
      return originalRemove.apply(this, arguments);
    };

    const component = mount(() => <Component />);
    const initialCount = listenerCount;

    component.unmount();

    expect(listenerCount).toBeLessThanOrEqual(initialCount);

    window.addEventListener = originalAdd;
    window.removeEventListener = originalRemove;
  });

  test('allows VNode collection after unmount', () => {
    const refs = [];

    const Component = () => {
      const [items] = createSignal([1, 2, 3]);
      return (
        <>
          {items().map(item => {
            const vnode = <div key={item}>{item}</div>;
            refs.push(new WeakRef(vnode));
            return vnode;
          })}
        </>
      );
    };

    const root = mount(() => <Component />);
    root.unmount();

    if (global.gc) global.gc();

    const alive = refs.filter(r => r.deref()).length;
    expect(alive).toBe(0);
  });
});
```

---

## Summary

| Pattern | Status | Reason |
|---------|--------|--------|
| Memoize data values | ✅ DO | Data reuse, VNodes created fresh |
| Memoize VNodes | ❌ DON'T | Reference cycles, prevents GC |
| Use signal subscriptions | ✅ DO | Auto-cleanup, reference counting |
| Forget event listeners | ❌ DON'T | Memory leaks, always use onCleanup |
| Use stable keys | ✅ DO | Prevents unnecessary VNode recreation |
| Circular references | ❌ DON'T | Prevents garbage collection |
| Clear timers in onCleanup | ✅ DO | Prevents dangling timeouts |
| Batch signal updates | ✅ DO | Fewer effect re-runs, better perf |

---

## See Also

- [Reactivity Guide](../../reactivity/README.md)
- [Effect and onCleanup](../../reactivity/README.md#effect)
- [LIFO Cleanup Ordering](../../reactivity/README.md#oncleanup)
