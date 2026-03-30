import { effect } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import type { FormState } from "../index"
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useFormState,
  useWatch,
} from "../index"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement("div")
  document.body.appendChild(el)
  const unmount = mount(
    <Capture
      fn={() => {
        result = fn()
      }}
    />,
    el,
  )
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

// ─── useFieldArray — additional operations ───────────────────────────────────

describe("useFieldArray — additional operations", () => {
  it("append multiple items sequentially", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray<string>([]))

    arr.append("a")
    arr.append("b")
    arr.append("c")
    expect(arr.values()).toEqual(["a", "b", "c"])
    expect(arr.length()).toBe(3)
    unmount()
  })

  it("remove first item shifts remaining", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["x", "y", "z"]))

    arr.remove(0)
    expect(arr.values()).toEqual(["y", "z"])
    expect(arr.length()).toBe(2)
    unmount()
  })

  it("remove last item", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    arr.remove(2)
    expect(arr.values()).toEqual(["a", "b"])
    unmount()
  })

  it("move item forward (lower to higher index)", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c", "d"]))

    arr.move(1, 3) // move "b" from index 1 to index 3
    expect(arr.values()).toEqual(["a", "c", "d", "b"])
    unmount()
  })

  it("move item backward (higher to lower index)", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c", "d"]))

    arr.move(3, 0) // move "d" from index 3 to index 0
    expect(arr.values()).toEqual(["d", "a", "b", "c"])
    unmount()
  })

  it("swap preserves all other items", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c", "d", "e"]))

    arr.swap(1, 3) // swap "b" and "d"
    expect(arr.values()).toEqual(["a", "d", "c", "b", "e"])
    unmount()
  })

  it("prepend then remove first restores original", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["x", "y"]))

    arr.prepend("new")
    expect(arr.values()).toEqual(["new", "x", "y"])
    arr.remove(0)
    expect(arr.values()).toEqual(["x", "y"])
    unmount()
  })

  it("insert at beginning is equivalent to prepend", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["b", "c"]))

    arr.insert(0, "a")
    expect(arr.values()).toEqual(["a", "b", "c"])
    unmount()
  })

  it("insert at end is equivalent to append", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b"]))

    arr.insert(2, "c")
    expect(arr.values()).toEqual(["a", "b", "c"])
    unmount()
  })

  it("replace with empty array clears all items", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    arr.replace([])
    expect(arr.values()).toEqual([])
    expect(arr.length()).toBe(0)
    unmount()
  })

  it("replace generates new keys for all items", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b"]))

    const keysBefore = arr.items().map((i: any) => i.key)
    arr.replace(["x", "y"])
    const keysAfter = arr.items().map((i: any) => i.key)

    // All keys should be different since replace creates new items
    expect(keysAfter[0]).not.toBe(keysBefore[0])
    expect(keysAfter[1]).not.toBe(keysBefore[1])
    unmount()
  })

  it("items signal is reactive — effect fires on append", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray<string>([]))

    const lengths: number[] = []
    const cleanup = effect(() => {
      lengths.push(arr.items().length)
    })

    expect(lengths).toEqual([0])

    arr.append("a")
    expect(lengths).toEqual([0, 1])

    arr.append("b")
    expect(lengths).toEqual([0, 1, 2])

    cleanup.dispose()
    unmount()
  })

  it("update preserves key identity", () => {
    const { result: arr, unmount } = mountWith(() => useFieldArray(["a", "b", "c"]))

    const keyBefore = arr.items()[1]!.key
    arr.update(1, "updated")
    const keyAfter = arr.items()[1]!.key

    // Same item, just value changed — key should be identical
    expect(keyAfter).toBe(keyBefore)
    expect(arr.items()[1]!.value()).toBe("updated")
    unmount()
  })
})

// ─── useWatch — reactivity ───────────────────────────────────────────────────

describe("useWatch — reactivity", () => {
  it("single field watch is reactive to value changes", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { count: 0 },
        onSubmit: () => {
          /* noop */
        },
      })
      const count = useWatch(form, "count")
      return { form, count }
    })

    const values: number[] = []
    const cleanup = effect(() => {
      values.push(result.count() as number)
    })

    expect(values).toEqual([0])

    result.form.fields.count.setValue(1)
    expect(values).toEqual([0, 1])

    result.form.fields.count.setValue(42)
    expect(values).toEqual([0, 1, 42])

    cleanup.dispose()
    unmount()
  })

  it("watch all fields is reactive to any field change", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { first: "A", second: "B" },
        onSubmit: () => {
          /* noop */
        },
      })
      const all = useWatch(form)
      return { form, all }
    })

    expect(result.all()).toEqual({ first: "A", second: "B" })

    result.form.fields.first.setValue("X")
    expect(result.all()).toEqual({ first: "X", second: "B" })

    result.form.fields.second.setValue("Y")
    expect(result.all()).toEqual({ first: "X", second: "Y" })
    unmount()
  })

  it("multiple field watch returns signal array with correct types", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { name: "Alice", age: 30 },
        onSubmit: () => {
          /* noop */
        },
      })
      const [name, age] = useWatch(form, ["name", "age"])
      return { form, name, age }
    })

    expect(result.name!()).toBe("Alice")
    expect(result.age!()).toBe(30)

    result.form.fields.name.setValue("Bob")
    expect(result.name!()).toBe("Bob")
    expect(result.age!()).toBe(30) // unchanged
    unmount()
  })
})

// ─── useFormState — additional scenarios ─────────────────────────────────────

describe("useFormState — additional scenarios", () => {
  it("tracks dirty fields correctly after multiple changes", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "", name: "", age: 0 },
        onSubmit: () => {
          /* noop */
        },
      })
      const state = useFormState(form)
      return { form, state }
    })

    result.form.fields.email.setValue("test@test.com")
    result.form.fields.name.setValue("Alice")

    const s = result.state()
    expect(s.dirtyFields).toEqual({ email: true, name: true })
    expect(s.isDirty).toBe(true)

    // Revert email
    result.form.fields.email.setValue("")
    const s2 = result.state()
    expect(s2.dirtyFields).toEqual({ name: true })
    expect(s2.isDirty).toBe(true)

    // Revert name too
    result.form.fields.name.setValue("")
    const s3 = result.state()
    expect(s3.dirtyFields).toEqual({})
    expect(s3.isDirty).toBe(false)
    unmount()
  })

  it("tracks touched fields after blur events", () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { email: "", password: "" },
        onSubmit: () => {
          /* noop */
        },
      })
      const state = useFormState(form)
      return { form, state }
    })

    expect(result.state().touchedFields).toEqual({})

    result.form.fields.email.setTouched()
    expect(result.state().touchedFields).toEqual({ email: true })

    result.form.fields.password.setTouched()
    expect(result.state().touchedFields).toEqual({ email: true, password: true })
    unmount()
  })

  it("submitCount and submitError are tracked", async () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { name: "valid" },
        onSubmit: async () => {
          throw new Error("Submit failed")
        },
      })
      const state = useFormState(form)
      return { form, state }
    })

    expect(result.state().submitCount).toBe(0)
    expect(result.state().submitError).toBeUndefined()

    await result.form.handleSubmit().catch(() => {
      /* expected */
    })

    expect(result.state().submitCount).toBe(1)
    expect(result.state().submitError).toBeInstanceOf(Error)
    unmount()
  })

  it("isValidating is tracked during async validation", async () => {
    const { result, unmount } = mountWith(() => {
      const form = useForm({
        initialValues: { name: "" },
        validators: {
          name: async (v) => {
            await new Promise((r) => setTimeout(r, 20))
            return !v ? "Required" : undefined
          },
        },
        onSubmit: () => {
          /* noop */
        },
      })
      const state = useFormState(form)
      return { form, state }
    })

    expect(result.state().isValidating).toBe(false)

    const validatePromise = result.form.validate()
    expect(result.state().isValidating).toBe(true)

    await validatePromise
    expect(result.state().isValidating).toBe(false)
    unmount()
  })
})

// ─── Validation integration — schema-based ───────────────────────────────────

describe("validation integration — schema-based", () => {
  it("schema errors are set only on fields without field-level errors", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Email required" : undefined),
        },
        schema: (_values) => ({
          email: "Schema email error", // Should be overridden by field-level
          password: "Schema password error",
        }),
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    await form.validate()

    // email has a field-level error ("Email required") — schema error ignored
    expect(form.fields.email.error()).toBe("Email required")
    // password has no field-level validator — schema error applied
    expect(form.fields.password.error()).toBe("Schema password error")
    unmount()
  })

  it("async schema validation works", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { code: "" },
        schema: async (values) => {
          await new Promise((r) => setTimeout(r, 5))
          if (!values.code) return { code: "Code is required" }
          return {}
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    const valid = await form.validate()
    expect(valid).toBe(false)
    expect(form.fields.code.error()).toBe("Code is required")
    unmount()
  })
})

// ─── form.reset() clears all field state ─────────────────────────────────────

describe("form.reset() comprehensive", () => {
  it("clears all field state including errors, touched, dirty, submitCount, submitError", async () => {
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { email: "", password: "" },
        validators: {
          email: (v) => (!v ? "Required" : undefined),
          password: (v) => (!v ? "Required" : undefined),
        },
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    // Dirty up the form
    form.fields.email.setValue("changed")
    form.fields.password.setValue("changed")
    form.fields.email.setTouched()
    form.fields.password.setTouched()
    await form.handleSubmit() // triggers validation

    // Verify state is dirty
    expect(form.fields.email.dirty()).toBe(true)
    expect(form.fields.password.dirty()).toBe(true)
    expect(form.fields.email.touched()).toBe(true)
    expect(form.fields.password.touched()).toBe(true)
    expect(form.submitCount()).toBe(1)

    // Reset everything
    form.reset()

    // All state should be cleared
    expect(form.fields.email.value()).toBe("")
    expect(form.fields.password.value()).toBe("")
    expect(form.fields.email.error()).toBeUndefined()
    expect(form.fields.password.error()).toBeUndefined()
    expect(form.fields.email.touched()).toBe(false)
    expect(form.fields.password.touched()).toBe(false)
    expect(form.fields.email.dirty()).toBe(false)
    expect(form.fields.password.dirty()).toBe(false)
    expect(form.submitCount()).toBe(0)
    expect(form.submitError()).toBeUndefined()
    expect(form.isDirty()).toBe(false)
    expect(form.isValid()).toBe(true)
    unmount()
  })
})

// ─── Debounced validation — additional scenarios ─────────────────────────────

describe("debounced validation — additional", () => {
  it("debounced validation on blur only fires after delay", async () => {
    const calls: string[] = []
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { query: "" },
        validators: {
          query: (v) => {
            calls.push(v as string)
            return undefined
          },
        },
        validateOn: "blur",
        debounceMs: 40,
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.query.setValue("a")
    form.fields.query.setTouched()
    form.fields.query.setValue("ab")
    form.fields.query.setTouched()

    // Nothing fired yet
    await new Promise((r) => setTimeout(r, 10))
    expect(calls).toHaveLength(0)

    // After debounce, only the last blur validation fires
    await new Promise((r) => setTimeout(r, 60))
    expect(calls).toHaveLength(1)
    unmount()
  })

  it("field-level reset clears debounce timer for that field", async () => {
    let callCount = 0
    const { result: form, unmount } = mountWith(() =>
      useForm({
        initialValues: { name: "" },
        validators: {
          name: () => {
            callCount++
            return undefined
          },
        },
        validateOn: "blur",
        debounceMs: 50,
        onSubmit: () => {
          /* noop */
        },
      }),
    )

    form.fields.name.setTouched()
    // Reset the individual field before debounce fires
    form.fields.name.reset()

    await new Promise((r) => setTimeout(r, 80))
    // Timer was cleared by field reset
    expect(callCount).toBe(0)
    unmount()
  })
})

// ─── FormProvider with direct VNode children ─────────────────────────────────

describe("FormProvider — VNode children branch", () => {
  it("renders when children is a direct VNode (not a function)", () => {
    let contextForm: FormState<{ name: string }> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)

    function Child() {
      contextForm = useFormContext() as FormState<{ name: string }>
      return null
    }

    function TestComponent() {
      const form = useForm({
        initialValues: { name: "Direct" },
        onSubmit: () => {
          /* noop */
        },
      })
      return (
        <FormProvider form={form as any}>
          <Child />
        </FormProvider>
      )
    }

    const unmount = mount(<TestComponent />, el)
    expect(contextForm).toBeDefined()
    expect(contextForm!.fields.name.value()).toBe("Direct")
    unmount()
    el.remove()
  })
})
