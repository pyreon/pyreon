# Store + Query Circular Dependency Pattern

## Problem: Infinite Loops with Store-Query Integration

When composing stores and queries together, circular dependencies can occur:

```typescript
// Query state
const user = useQuery({
  queryKey: ['user'],
  queryFn: async () => fetchUser(),
})

// Store reads from query
const userStore = defineStore('user', () => ({
  user: computed(() => user.data),  // ✅ Store reads query
  updateUser: async (data) => {
    await updateUserAPI(data)
    user.invalidate()  // ❌ Query invalidates → refetch → store updates → ...
  },
}))

// If store updates trigger query invalidation:
// Store update → Query refetch → Store re-computes → Store effect triggers → Query invalidate again
// → INFINITE LOOP
```

## Solution: Use `batch()` for Batch Updates

The `batch()` function from `@pyreon/reactivity` prevents intermediate updates from triggering effects:

```typescript
import { batch } from '@pyreon/reactivity'
import { useQuery } from '@pyreon/query'
import { defineStore } from '@pyreon/store'

// Store with safe query invalidation
const userStore = defineStore('user', () => {
  const user = useQuery({
    queryKey: ['user'],
    queryFn: async () => fetchUser(),
  })

  return {
    user: computed(() => user.data),

    updateUser: async (data: User) => {
      // ✅ Batch prevents intermediate effects
      batch(async () => {
        // Update API
        await updateUserAPI(data)

        // Invalidate query inside batch
        // This triggers refetch, but effects don't run yet
        user.invalidate()

        // Refetch completes, user.data updates
        // But nothing reacts until batch() finishes
      })
      // Only now do effects run (once, not cascading)
    },
  }
})
```

## Why This Works

Without `batch()`:
1. `updateUserAPI()` resolves
2. `user.invalidate()` runs → sets query state to invalidating
3. Query state change → any computed that watches query re-runs immediately
4. Recomputed value might trigger more effects
5. Effects might call `invalidate()` again → loop

With `batch()`:
1. Everything inside batch runs
2. All signal updates are queued
3. Effects are scheduled but don't run yet
4. `batch()` finishes
5. All queued effects run once
6. Result: Single consistent update

## Patterns: Safe Store-Query Composition

### Pattern 1: Store Reads from Query (Recommended)

```typescript
const userStore = defineStore('user', () => {
  const query = useQuery({ queryKey: ['user'], queryFn: fetchUser })

  return {
    user: computed(() => query.data),
    isLoading: computed(() => query.isLoading),
    
    // ✅ Safe: Query is source of truth
    refreshUser: () => batch(() => query.refetch()),
    
    // ⚠️ Careful: Can cause loops if not batched
    updateUser: (data: User) => {
      return batch(async () => {
        await api.updateUser(data)
        query.invalidate()
      })
    },
  }
})
```

**Characteristics**:
- ✅ Single source of truth (query)
- ✅ Easy to understand data flow
- ⚠️ Must batch query mutations
- ✅ All effects still work correctly

### Pattern 2: Store Manages Query

```typescript
const userStore = defineStore('user', () => {
  const query = useQuery({
    queryKey: ['user'],
    queryFn: fetchUser,
  })

  const setUser = (data: User) => {
    batch(() => {
      // Update cache immediately
      query.setData(data)
      // Then sync to server
      updateUserAPI(data).catch(err => {
        // Revert on error
        query.invalidate()
      })
    })
  }

  return {
    user: computed(() => query.data),
    setUser,
  }
})
```

**Characteristics**:
- ✅ Optimistic updates
- ✅ Fewer round-trips to server
- ✅ Safe with `batch()`
- ✅ Good UX (immediate feedback)

### Pattern 3: Independent Query (Avoid)

```typescript
// ❌ DON'T: Store duplicates query data
const userStore = defineStore('user', () => {
  const user = signal<User | null>(null)
  
  const fetchUser = async () => {
    const data = await api.getUser()
    user.set(data)  // ❌ Duplicate source of truth
  }
  
  return { user, fetchUser }
})

const userQuery = useQuery({
  queryKey: ['user'],
  queryFn: () => userStore.fetchUser(),  // ❌ Circular
})
```

**Problems**:
- ❌ Two sources of truth
- ❌ Difficult to keep in sync
- ❌ Prone to infinite loops
- ❌ Hard to debug

## Best Practices

1. **✅ Use `batch()` for any mutation that invalidates**
   ```typescript
   updateUser: (data) => batch(async () => {
     await api.update(data)
     query.invalidate()
   })
   ```

2. **✅ Store reads from query, not vice versa**
   ```typescript
   // Good
   const user = computed(() => query.data)
   
   // Bad
   const user = signal()
   useEffect(() => query.setData(user()))
   ```

3. **✅ Use optimistic updates with `batch()`**
   ```typescript
   batch(() => {
     query.setData(optimisticValue)  // Update UI immediately
     api.update(data).catch(() => query.invalidate())
   })
   ```

4. **✅ Invalidate only what's needed**
   ```typescript
   // Good: Specific invalidation
   query.invalidate()
   
   // Bad: Too broad
   queryClient.invalidateQueries()  // Everything!
   ```

5. **⚠️ Beware of subscription-driven invalidation**
   ```typescript
   // ❌ Could cause loops
   effect(() => {
     userStore.user()  // Reads user
     query.invalidate()  // Invalidates query → refetch → user updates → effect runs again
   })
   
   // ✅ Better: Explicit action
   button.onClick(() => {
     batch(() => query.invalidate())
   })
   ```

## Testing Circular Dependencies

Test that updates don't cause infinite loops:

```typescript
it('store-query update does not infinite loop', async () => {
  const effectCount = signal(0)
  let queryRefetchCount = 0

  const query = useQuery({
    queryKey: ['user'],
    queryFn: () => {
      queryRefetchCount++
      return { id: 1, name: 'Alice' }
    },
  })

  const store = defineStore('user', () => {
    effect(() => {
      query.data()  // Subscribe to query
      effectCount.update(c => c + 1)
    })

    return {
      updateUser: (name: string) => {
        batch(async () => {
          await delay(10)  // Simulate API call
          query.setData({ id: 1, name })
          query.invalidate()  // Trigger refetch
        })
      },
    }
  })

  await store.updateUser('Bob')

  // Should NOT have cascading effects
  expect(effectCount()).toBeLessThan(5)  // 1-2 initial + 1 update = 2-3
  expect(queryRefetchCount).toBeLessThan(10)  // 1 initial + 1 refetch = 2
})
```

## Debugging Infinite Loops

If you suspect an infinite loop:

1. **Check effect subscriptions**
   ```typescript
   effect(() => {
     console.log('Effect running')
     query.data()  // Does this read signal?
   })
   ```

2. **Use `batch()` to confirm**
   ```typescript
   // Wrap suspicious code in batch
   batch(() => {
     updateUser(data)
     query.invalidate()
   })
   // If loop stops → issue was batching
   ```

3. **Check invalidation triggers**
   ```typescript
   // Look for these patterns
   - effect(() => query.invalidate())  // ❌
   - computed(() => (query.invalidate(), data))  // ❌
   - Store subscriber → query invalidate → store update  // ❌ unless batched
   ```

4. **Enable verbose logging**
   ```typescript
   const query = useQuery({
     queryKey: ['user'],
     queryFn: () => {
       console.log('Query running')
       return fetchUser()
     },
     staleTime: 0,  // Always refetch to expose loops
   })
   ```

## Related Issues

- [Store API](../README.md)
- [Query Integration](../../query/README.md)
- [batch() Documentation](../../../reactivity/README.md#batch)
- [GitHub Discussion: Store-Query Patterns](https://github.com/pyreon/pyreon/discussions)
